const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const { data } = await supabase.from('messages')
        .select('conversation_id, sender_type, content, created_at, conversations(client_id)')
        .order('created_at', { ascending: false })
        .limit(10);
        
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
})();
