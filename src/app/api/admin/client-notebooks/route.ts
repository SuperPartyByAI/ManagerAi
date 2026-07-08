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
    
    // 1. Fetch MOST RECENT 500 conversations
    console.log('[API/Notebooks] Fetching recent conversations...');
    const { data: recentConvs, error: convErr } = await supabase.from('conversations')
      .select('client_id, last_message_at')
      .order('last_message_at', { ascending: false })
      .limit(500);
      
    if (convErr) {
        console.error('[API/Notebooks] Error fetching conversations:', convErr.message);
        throw convErr;
    }
    console.log(`[API/Notebooks] Found ${recentConvs?.length || 0} recent conversations.`);

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

        // 3.6. Fetch role constraints (must_collect_fields) from ai_knowledge_base
        const rolesConstraintsMap = new Map<string, string[]>();
        const { data: roleRows } = await supabase.from('ai_knowledge_base')
            .select('knowledge_key, policy_config')
            .like('knowledge_key', 'role_%')
            .eq('active', true);
        (roleRows || []).forEach((r: { knowledge_key: string; policy_config: Record<string, unknown> }) => {
            const pc = r.policy_config as Record<string, Record<string, unknown>>;
            const fields = (pc?.constraints?.must_collect_fields as string[]) || [];
            if (fields.length > 0) rolesConstraintsMap.set(r.knowledge_key, fields);
        });
        // default universal fields
        const DEFAULT_MUST_COLLECT = ['date', 'location', 'duration'];
        
        // 3.5. Fetch Event Drafts from unified Schema (ai_client_events)
        const eventDraftsRaw: any[] = [];
        
        for (let i = 0; i < uniqueClientIds.length; i += 200) {
            const chunk = uniqueClientIds.slice(i, i + 200);
            const { data, error: draftErr } = await supabase.from('ai_client_events')
               .select('id, client_id, status, servicii_cerute, data_eveniment, ora_eveniment, locatie, structured_data_json, updated_at')
               .in('client_id', chunk);

            if (draftErr) {
                console.error('[API/Notebooks] Error fetching drafts for chunk:', draftErr.message);
                continue;
            }

            if (data) {
                eventDraftsRaw.push(...data.map(d => {
                    // Build base from flat columns
                    const structured: Record<string, unknown> = {
                        date: d.data_eveniment,
                        time: d.ora_eveniment,
                        location: d.locatie,
                    };

                    // Merge actual structured_data_json from DB (AI extracted data)
                    if (d.structured_data_json && typeof d.structured_data_json === 'object') {
                        Object.assign(structured, d.structured_data_json);
                    }

                    // Try to extract more detail from servicii_cerute METADATA role
                    const svc = d.servicii_cerute || [];
                    const meta = Array.isArray(svc) ? svc.find((s: any) => s.role_key === 'METADATA') : null;
                    if (meta && meta.payload) {
                        Object.assign(structured, meta.payload);
                    }

                    // Detect role_key from servicii_cerute (both array and object formats)
                    const svcRaw = d.servicii_cerute || {};
                    const svcArr = Array.isArray(svcRaw) ? svcRaw : Object.values(svcRaw);
                    const firstRole = svcArr.find((s: any) => (s.role_key || s.role_title) && s.role_key !== 'METADATA');
                    const detectedRoleKey = firstRole?.role_key || firstRole?.role_title || '';
                    const mustCollect: string[] = rolesConstraintsMap.get(detectedRoleKey) || DEFAULT_MUST_COLLECT;

                    // Calculate which fields are filled — check both structured_data_json AND servicii_cerute slot data
                    const sdataRaw = (d.structured_data_json || {}) as Record<string, unknown>;
                    // Also extract fields from servicii_cerute slots (new format stores date/location/duration there)
                    const slotData: Record<string, unknown> = {};
                    const svcObj = Array.isArray(svcRaw) ? {} : (svcRaw as Record<string, Record<string, unknown>>);
                    for (const slot of Object.values(svcObj)) {
                        if (slot && typeof slot === 'object') {
                            Object.assign(slotData, slot as Record<string, unknown>);
                        }
                    }
                    // Merged lookup: structured_data_json + flat columns + slot data
                    const merged: Record<string, unknown> = {
                        date: d.data_eveniment,
                        location: d.locatie,
                        time: d.ora_eveniment,
                        ...slotData,
                        ...sdataRaw,
                    };

                    const filledFields = mustCollect.filter(f => {
                        const val = merged[f];
                        return val !== undefined && val !== null && String(val).trim().length > 0;
                    });
                    const missingFields = mustCollect.filter(f => !filledFields.includes(f));
                    const completenessPct = mustCollect.length > 0 ? Math.round((filledFields.length / mustCollect.length) * 100) : 100;

                    // Use merged as the display structured_data_json
                    Object.assign(structured, merged);


                    return {
                        id: d.id,
                        client_id: d.client_id,
                        status: d.status,
                        source: 'ai_client_events',
                        structured_data_json: structured,
                        servicii_cerute: svcArr, // MUST be array to prevent .filter() crash in React
                        must_collect_fields: mustCollect,
                        filled_fields: filledFields,
                        missing_fields_json: missingFields,
                        completeness_pct: completenessPct,
                        role_key: detectedRoleKey,
                        services: svcArr.filter((s: Record<string, unknown>) => s.role_key !== 'METADATA').map((s: Record<string, unknown>) => s.role_key || s.service_key || s.role_title),
                        updated_at: d.updated_at
                    };
                }));
            }
        }
        
        const draftMap = new Map<string, any[]>();
        for (const d of eventDraftsRaw) {
             const drafts = draftMap.get(d.client_id) || [];
             drafts.push(d);
             draftMap.set(d.client_id, drafts);
        }
        
        const cleanNotebookMap = new Map<string, any>();
        for (const n of cleanNotebooksRaw) {
             cleanNotebookMap.set(`${n.phone_number}|${n.wa_number}`, n.clean_notebook);
             // Also index by brand_key for lookups that use resolvedBrand
             if (n.brand_key && !cleanNotebookMap.has(`${n.phone_number}|${n.brand_key}`)) {
                 cleanNotebookMap.set(`${n.phone_number}|${n.brand_key}`, n.clean_notebook);
             }
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
            const seenUniqueKeys = new Set<string>();
            const seenAliases = new Set<string>();
            
            for (const cid of uniqueClientIds) {
                const c = clientMap.get(cid);
                if (c) {
                    if (!c.real_phone_e164) continue; // Skip groups
                    
                    const phoneNumber = c.real_phone_e164;
                    const alias = c.public_alias || c.full_name || null;
                    
                    // Resolve brand_key
                    let resolvedBrand = c.brand_key;
                    if (resolvedBrand && brandFixMap.has(resolvedBrand)) {
                      resolvedBrand = brandFixMap.get(resolvedBrand)!;
                    }
                    
                    // Cheia unică trebuie să fie TELEFON + BRAND (pentru ca clientul să apară de mai multe ori dacă a scris pe mai multe QR-uri)
                    const uniqueKey = `${phoneNumber}|${resolvedBrand || 'UNKNOWN'}`;
                    
                    if (!seenUniqueKeys.has(uniqueKey)) { // Changed condition
                        seenUniqueKeys.add(uniqueKey); // Changed set
                        if (alias) seenAliases.add(alias);
                        
                        // Cauta clean_notebook stric pentru brand_key specific
                        const notebookKey = `${phoneNumber}|${resolvedBrand || ''}`;
                        const cleanNotebookData = cleanNotebookMap.get(notebookKey) || {}; // Daca nu are istoric pe QR-ul asta, pleaca de zero
                                                     // Structure to match what the frontend expects today
                         const rawDrafts = draftMap.get(c.id) || [];
                         // Enrich each draft: if structured_data_json is null/empty, fill from clean_notebook
                         const enrichedDrafts = rawDrafts.map((draft: Record<string, unknown>) => {
                             const existing = (draft.structured_data_json as Record<string, unknown>) || {};
                             const hasData = Object.keys(existing).some(k => existing[k] && !['date','time','location'].includes(k) || existing[k]);
                             if (!hasData && cleanNotebookData && typeof cleanNotebookData === 'object') {
                                 return { ...draft, structured_data_json: { ...cleanNotebookData, ...existing } };
                             }
                             return draft;
                         });
                         notebooks.push({
                            client_id: c.id,
                            phone_number: phoneNumber,
                            alias: alias,
                            template_key: 'Live Chat',
                            extracted_data: cleanNotebookData, 
                            event_drafts: enrichedDrafts,
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
