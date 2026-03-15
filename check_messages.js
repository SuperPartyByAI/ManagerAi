const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    // Let's grab the real client ID of the user we just saw (e.g. 0241236f-cd6d-4fa8-a7e1-6266c3e5d72f)
    const id = '0241236f-cd6d-4fa8-a7e1-6266c3e5d72f';
    const { data: convs, error: convErr } = await supabase.from('conversations')
        .select('id')
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .limit(20);
        
    if (convErr) {
        console.error("convErr", convErr);
        return;
    }
    
    console.log("convs", convs);
    const convIds = convs?.map(c => c.id) || [];
    if (convIds.length > 0) {
        const { data: msgs, error: msgErr } = await supabase.from('messages')
            .select('id, conversation_id, content, sender_type, created_at')
            .in('conversation_id', convIds.slice(0, 5))
            .order('created_at', { ascending: false })
            .limit(30);
        console.log("msgs", msgs?.length, msgErr);
        if (msgs && msgs.length > 0) {
            console.log(msgs[0]);
        }
    }
    process.exit(0);
})();
