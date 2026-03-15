import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
  
  try {
    let notebooks = [];
    const { data, error } = await supabase.from('ai_client_notebooks')
      .select('*, template:ai_notebook_templates(json_schema)')
      .order('updated_at', { ascending: false })
      .limit(50);
      
    if (error) {
      console.warn("Notebooks table not found. Falling back to ai_client_profiles...", error.message);
      
      const { data: recentMsgs } = await supabase.from('messages')
        .select('conversation_id, created_at, conversations(client_id)')
        .order('created_at', { ascending: false })
        .limit(100);
        
      const uniqueClientIds = [];
      if (recentMsgs) {
         for (const msg of recentMsgs) {
             const cid = (msg.conversations as any)?.client_id;
             if (cid && !uniqueClientIds.includes(cid)) {
                 uniqueClientIds.push(cid);
             }
             if (uniqueClientIds.length >= 20) break;
         }
      }

      if (uniqueClientIds.length > 0) {
          const { data: clientsRaw } = await supabase.from('clients')
              .select('id, real_phone_e164, full_name, public_alias, avatar_url, brand_key')
              .in('id', uniqueClientIds);
              
          if (clientsRaw) {
              const clientMap = new Map(clientsRaw.map(c => [c.id, c]));
              
              for (const cid of uniqueClientIds) {
                  const c = clientMap.get(cid);
                  if (c) {
                      notebooks.push({
                         phone_number: c.real_phone_e164 || c.public_alias || c.id,
                         template_key: 'Live Chat',
                         extracted_data: {},
                         avatar_url: c.avatar_url,
                         brand_key: c.brand_key
                      });
                  }
              }
          }
      }
    } else {
      notebooks = data || [];
    }
    
    return NextResponse.json({ notebooks });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
