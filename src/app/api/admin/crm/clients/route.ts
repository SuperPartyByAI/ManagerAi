import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { securityCheck } from '@/lib/security-middleware';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  // ── Extract auth token and validate user ──
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (token) {
    try {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        // Run security checks: audit + rate limit + session + role
        const check = await securityCheck({
          userId: user.id,
          email: user.email || '',
          action: 'view_clients',
          permission: 'view_clients',
          resourceType: 'client',
          metadata: { search: search || undefined },
          ipAddress: request.headers.get('x-forwarded-for') || undefined,
        });

        if (!check.allowed) {
          return NextResponse.json(
            { error: check.reason || 'Access denied' },
            { status: 403 }
          );
        }
      }
    } catch (e) {
      // Auth validation failed — continue without blocking for now
      console.warn('[SECURITY] Auth validation error:', e);
    }
  }
  
  try {
    let query = supabase.from('clients')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(50);

    if (search) query = query.or(`full_name.ilike.%${search}%,real_phone_e164.ilike.%${search}%,public_alias.ilike.%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;
    
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
