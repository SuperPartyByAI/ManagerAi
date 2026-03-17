import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
  try {
    const { data: events } = await supabase.from('ai_client_events').select('*');
    return NextResponse.json({ events });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
