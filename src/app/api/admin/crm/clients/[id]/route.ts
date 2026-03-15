import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  try {
    const { data: convs, error: convErr } = await supabase.from('conversations')
        .select('id')
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .limit(20);
        
    if (convErr) throw convErr;
    
    const convIds = convs?.map(c => c.id) || [];
    let latestMessages: any[] = [];
    
    if (convIds.length > 0) {
        const { data: msgs } = await supabase.from('messages')
            .select('id, conversation_id, content, sender_type, created_at')
            .in('conversation_id', convIds.slice(0, 5))
            .order('created_at', { ascending: false })
            .limit(30);
        latestMessages = msgs || [];
    }
    
    return NextResponse.json({ latest_messages: latestMessages });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
