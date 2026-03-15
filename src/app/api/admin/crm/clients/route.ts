import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
  
  try {
    let query = supabase.from('ai_client_profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(50);

    if (search) query = query.or(`nume_client.ilike.%${search}%,telefon_e164.ilike.%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;
    
    const mappedClients = (data || []).map(c => ({
        ...c,
        id: c.client_id,
        full_name: c.nume_client,
        real_phone_e164: c.telefon_e164,
        source: c.tip_client
    }));
    
    return NextResponse.json({ clients: mappedClients, total: count });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
