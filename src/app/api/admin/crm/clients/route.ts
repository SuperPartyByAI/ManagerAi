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
    let query = supabase.from('clients')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(50);

    if (search) query = query.or(`full_name.ilike.%${search}%,real_phone_e164.ilike.%${search}%,public_alias.ilike.%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;
    
    // Clients already has id, real_phone_e164, full_name, so no deep mapping needed
    const mappedClients = (data || []).map(c => ({
        ...c,
        id: c.id,
        full_name: c.full_name || c.public_alias,
        real_phone_e164: c.real_phone_e164,
        source: c.source
    }));
    
    return NextResponse.json({ clients: mappedClients, total: count });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
