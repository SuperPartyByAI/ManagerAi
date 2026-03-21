import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/universparty/wa-web-launcher/superparty-manager-ai/.env.local' });

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data: recentConvs } = await supabase.from('conversations')
      .select('client_id, updated_at')
      .order('updated_at', { ascending: false })
      .limit(200);

    const uniqueClientIds = [];
    if (recentConvs) {
       for (const conv of recentConvs) {
           const cid = conv.client_id;
           if (cid && !uniqueClientIds.includes(cid)) {
               uniqueClientIds.push(cid);
           }
       }
    }
    console.log("Unique Client Ids from Top 200:", uniqueClientIds.length);

    const { data: clientsRaw } = await supabase.from('clients')
        .select('id, real_phone_e164, full_name, public_alias, avatar_url, brand_key')
        .in('id', uniqueClientIds);

    let creativePartyCountRaw = 0;
    if (clientsRaw) {
        for (const c of clientsRaw) {
           if (c.brand_key === 'CREATIVE_PARTY' || c.brand_key === 'wa_f6c37b9b') {
               creativePartyCountRaw++;
           }
        }
    }
    console.log("Creative Party Clients matched explicitly in `clients` pull:", creativePartyCountRaw);

    const seenPhones = new Set();
    const seenAliases = new Set();
    const notebooks = [];
    
    if (clientsRaw) {
        const clientMap = new Map(clientsRaw.map(c => [c.id, c]));
        
        for (const cid of uniqueClientIds) {
            const c = clientMap.get(cid);
            if (c) {
                if (!c.real_phone_e164) {
                    continue; 
                }
                
                const phoneNumber = c.real_phone_e164;
                const alias = c.public_alias || c.full_name || null;
                
                if (!seenPhones.has(phoneNumber) && (!alias || !seenAliases.has(alias))) {
                    seenPhones.add(phoneNumber);
                    if (alias) seenAliases.add(alias);
                    
                    if (c.brand_key === 'wa_f6c37b9b' || c.brand_key === 'CREATIVE_PARTY') {
                        notebooks.push({ cid, phoneNumber, alias, brand_key: c.brand_key });
                    }
                } else {
                     if (c.brand_key === 'wa_f6c37b9b' || c.brand_key === 'CREATIVE_PARTY') {
                        let reason = "";
                        if (seenPhones.has(phoneNumber)) reason += "DUP_PHONE ";
                        if (alias && seenAliases.has(alias)) reason += "DUP_ALIAS";
                        console.log(`Filtered out ${alias} (${phoneNumber}) due to: ${reason}`);
                     }
                }
            } else {
                console.log("Client ID not found in clients table:", cid);
            }
        }
    }
    console.log("Added inside notebooks:", notebooks.length);
}

run();
