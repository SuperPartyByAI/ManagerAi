const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    let notebooks = [];
    const { data: recentMsgs } = await supabase.from('messages')
        .select('conversation_id, created_at, conversations(client_id)')
        .order('created_at', { ascending: false })
        .limit(10);
        
    const uniqueClientIds = [];
    if (recentMsgs) {
         for (const msg of recentMsgs) {
             const cid = msg.conversations?.client_id;
             if (cid && !uniqueClientIds.includes(cid)) uniqueClientIds.push(cid);
         }
    }

    if (uniqueClientIds.length > 0) {
          const { data: profiles, error } = await supabase.from('ai_client_profiles')
              .select('client_id, telefon_e164, nume_client')
              .in('client_id', uniqueClientIds);
          console.log(profiles, error);
    }
    process.exit(0);
})();
