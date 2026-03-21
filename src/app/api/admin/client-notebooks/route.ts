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
    
    // 1. Fetch ALL active conversations regardless of trigger times to prevent invisible cut-offs
    const { data: recentConvs, error: convErr } = await supabase.from('conversations')
      .select('client_id, updated_at, messages(created_at)')
      .limit(1, { foreignTable: 'messages' })
      .order('created_at', { foreignTable: 'messages', ascending: false });
      
    if (convErr) throw convErr;

    const uniqueClientIds: string[] = [];
    const lastMessageMap = new Map<string, string>();
    if (recentConvs) {
       for (const conv of recentConvs) {
           const cid = conv.client_id;
           if (cid && !uniqueClientIds.includes(cid)) {
               uniqueClientIds.push(cid);
               const realDate = conv.messages && conv.messages.length > 0 ? conv.messages[0].created_at : conv.updated_at;
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
            
        // 3. Fetch active draft events from NEW ai_client_events table (chunked)
        const activeEvents: { client_id: string, servicii_cerute?: string, status?: string }[] = [];
        for (let i = 0; i < uniqueClientIds.length; i += 200) {
            const chunk = uniqueClientIds.slice(i, i + 200);
            const { data } = await supabase.from('ai_client_events')
               .select('client_id, servicii_cerute, status')
               .in('client_id', chunk)
               .eq('status', 'draft');
            if (data) activeEvents.push(...data);
        }
            
        const eventsMap = new Map(activeEvents?.map(e => [e.client_id, e.servicii_cerute]) || []);

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
                        
                        // Structure to match what the frontend expects today
                        notebooks.push({
                           client_id: cid,
                           phone_number: phoneNumber,
                           alias: alias,
                           template_key: 'Live Chat',
                           // We merge the requested services here so UI column 3 can read it
                           extracted_data: eventsMap.get(cid) || {}, 
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
