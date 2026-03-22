import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    {
      global: {
        fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' as RequestCache })
      }
    }
  );
  
  try {
    const notebooks: Record<string, unknown>[] = [];
    
    // 1. Fetch ALL active conversations using the unprotected last_message_at column bypass
    const { data: recentConvs, error: convErr } = await supabase.from('conversations')
      .select('client_id, last_message_at')
      .order('last_message_at', { ascending: false });
      
    if (convErr) throw convErr;

    const uniqueClientIds: string[] = [];
    const lastMessageMap = new Map<string, string>();
    if (recentConvs) {
       for (const conv of recentConvs) {
           const cid = conv.client_id;
           if (cid && !uniqueClientIds.includes(cid)) {
               uniqueClientIds.push(cid);
               const realDate = conv.last_message_at;
               if (realDate) lastMessageMap.set(cid, realDate);
           }
       }
    }

    if (uniqueClientIds.length > 0) {
        // 2. Fetch clients (chunked to prevent URL too long error)
        const clientsRaw: { id: string, real_phone_e164?: string, full_name?: string, public_alias?: string, avatar_url?: string, brand_key?: string }[] = [];
        for (let i = 0; i < uniqueClientIds.length; i += 200) {
            const chunk = uniqueClientIds.slice(i, i + 200);
            const { data } = await supabase.from('clients')
               .select('id, real_phone_e164, full_name, public_alias, avatar_url, brand_key')
               .in('id', chunk);
            if (data) clientsRaw.push(...data);
        }
            
        // 3. Fetch clean notebooks from client_notebooks_v2 using unique phone numbers
        const uniquePhones = [...new Set(clientsRaw.map(c => c.real_phone_e164).filter(Boolean))];
        const cleanNotebooksRaw: any[] = [];
        for (let i = 0; i < uniquePhones.length; i += 200) {
            const chunk = uniquePhones.slice(i, i + 200);
            const { data } = await supabase.from('client_notebooks_v2')
               .select('phone_number, wa_number, clean_notebook')
               .in('phone_number', chunk);
            if (data) cleanNotebooksRaw.push(...data);
        }
        
        const cleanNotebookMap = new Map<string, any>();
        for (const n of cleanNotebooksRaw) {
             cleanNotebookMap.set(`${n.phone_number}|${n.wa_number}`, n.clean_notebook);
             if (!cleanNotebookMap.has(n.phone_number)) {
                 cleanNotebookMap.set(n.phone_number, n.clean_notebook);
             }
        }

        // 4. Fetch whatsapp_sessions to resolve SESSION_xxx -> proper brand label
        const { data: sessions } = await supabase.from('whatsapp_sessions')
            .select('session_key, label, brand_key');
        const brandFixMap = new Map<string, string>();
        if (sessions) {
          for (const s of sessions) {
            if (s.brand_key) {
              // Map wa_xxx -> BRAND
              brandFixMap.set(s.session_key, s.brand_key);
              // Map SESSION_XXXXXX -> BRAND  (first 6 chars of session_key after wa_)
              const shortId = s.session_key.replace('wa_', '').substring(0, 6).toUpperCase();
              brandFixMap.set('SESSION_' + shortId, s.brand_key);
            }
          }
        }

        if (clientsRaw) {
            const clientMap = new Map(clientsRaw.map(c => [c.id, c]));
            const seenPhones = new Set<string>();
            const seenAliases = new Set<string>();
            
            for (const cid of uniqueClientIds) {
                const c = clientMap.get(cid);
                if (c) {
                    if (!c.real_phone_e164) continue; // Skip groups
                    
                    const phoneNumber = c.real_phone_e164;
                    const alias = c.public_alias || c.full_name || null;
                    
                    if (!seenPhones.has(phoneNumber) && (!alias || !seenAliases.has(alias))) {
                        seenPhones.add(phoneNumber);
                        if (alias) seenAliases.add(alias);
                        
                        // Resolve brand_key: fix SESSION_xxx and wa_xxx to proper brand name
                        let resolvedBrand = c.brand_key;
                        if (resolvedBrand && brandFixMap.has(resolvedBrand)) {
                          resolvedBrand = brandFixMap.get(resolvedBrand)!;
                        }
                        
                        // Cauta clean_notebook stric pentru brand_key specific
                        const notebookKey = `${phoneNumber}|${resolvedBrand || ''}`;
                        const cleanNotebookData = cleanNotebookMap.get(notebookKey) || {}; // Daca nu are istoric pe QR-ul asta, pleaca de la zero. NU folosi alte QR-uri.
                             
                        // Structure to match what the frontend expects today
                        notebooks.push({
                           client_id: cid,
                           phone_number: phoneNumber,
                           alias: alias,
                           template_key: 'Live Chat',
                           // Returneaza clean_notebook JSON, nu SLOT_U0QR
                           extracted_data: cleanNotebookData, 
                           avatar_url: c.avatar_url,
                           brand_key: resolvedBrand,
                           last_message_at: lastMessageMap.get(cid) || null
                        } as never);
                    }
                }
            }
        }
    }
    
    // Sorteaza dupa ultimul mesaj DESC (ca WhatsApp)
    notebooks.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const ta = (a.last_message_at as string) || '';
      const tb = (b.last_message_at as string) || '';
      return tb.localeCompare(ta);
    });
    return NextResponse.json({ notebooks });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
