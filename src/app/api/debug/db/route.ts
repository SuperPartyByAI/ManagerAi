import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
  try {
    const { data: msgs } = await supabase.from('messages').select('id, content, created_at, sender_type, conversation_id').order('created_at', { ascending: false }).limit(10);
    const { data: convs } = await supabase.from('conversations').select('id, client_id, status, updated_at').order('updated_at', { ascending: false }).limit(10);
    
    return NextResponse.json({ msgs, convs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
