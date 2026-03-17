import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
  
  try {
    const notebooks: Record<string, unknown>[] = [];
    
    // 1. Fetch recent conversations to know which clients are active
    const { data: recentConvs, error: convErr } = await supabase.from('conversations')
      .select('client_id, updated_at')
      .order('updated_at', { ascending: false })
      .limit(300);
      
    if (convErr) throw convErr;

    const uniqueClientIds: string[] = [];
    if (recentConvs) {
       for (const conv of recentConvs) {
           const cid = conv.client_id;
           if (cid && !uniqueClientIds.includes(cid)) {
               uniqueClientIds.push(cid);
           }
       }
    }

    if (uniqueClientIds.length > 0) {
        // 2. Fetch clients to get basic info (phone, alias, avatar)
        const { data: clientsRaw } = await supabase.from('clients')
            .select('id, real_phone_e164, full_name, public_alias, avatar_url, brand_key')
            .in('id', uniqueClientIds);
            
        // 3. Fetch active draft events from NEW ai_client_events table
        const { data: activeEvents } = await supabase.from('ai_client_events')
            .select('client_id, servicii_cerute, status')
            .in('client_id', uniqueClientIds)
            .eq('status', 'draft');
            
        const eventsMap = new Map(activeEvents?.map(e => [e.client_id, e.servicii_cerute]) || []);

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
                        
                        // Structure to match what the frontend expects today
                        notebooks.push({
                           client_id: cid,
                           phone_number: phoneNumber,
                           alias: alias,
                           template_key: 'Live Chat',
                           // We merge the requested services here so UI column 3 can read it
                           extracted_data: eventsMap.get(cid) || {}, 
                           avatar_url: c.avatar_url,
                           brand_key: c.brand_key
                        } as never);
                    }
                }
            }
        }
    }
    
    return NextResponse.json({ notebooks });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
