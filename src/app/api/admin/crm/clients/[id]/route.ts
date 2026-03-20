import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    {
       auth: { persistSession: false },
       global: { fetch: (url: RequestInfo | URL, options?: RequestInit) => fetch(url, { ...options, cache: 'no-store' }) }
    }
  );

  try {
    // Gasim telefonul clientului pentru lookup cross-QR
    const { data: clientRow } = await supabase
      .from('clients')
      .select('real_phone_e164')
      .eq('id', id)
      .maybeSingle();

    const clientPhone = clientRow?.real_phone_e164;

    // Gasim toti clientii cu acelasi telefon (toate QR-urile)
    let allClientIds: string[] = [id];
    if (clientPhone) {
      const { data: samePhoneClients } = await supabase
        .from('clients')
        .select('id')
        .eq('real_phone_e164', clientPhone);
      if (samePhoneClients && samePhoneClients.length > 0) {
        allClientIds = samePhoneClients.map((c: { id: string }) => c.id);
      }
    }

    // Luam toate conversatiile de la toti clientii
    const { data: convs, error: convErr } = await supabase
      .from('conversations')
      .select('id')
      .in('client_id', allClientIds)
      .order('created_at', { ascending: false })
      .limit(500);

    if (convErr) throw convErr;

    console.log('Next route fetching id:', id, 'Phone:', clientPhone, 'All client IDs:', allClientIds.length, 'Found convs:', convs?.length);
    const convIds = convs?.map((c: { id: string }) => c.id) || [];
    let latestMessages: any[] = [];

    if (convIds.length > 0) {
      const { data: msgs } = await supabase
        .from('messages')
        .select('id, conversation_id, content, sender_type, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: true })
        .limit(500);
      latestMessages = msgs || [];
    }

    return NextResponse.json({
      latest_messages: latestMessages,
      debug: { id, convCount: convs?.length, clientIds: allClientIds.length, phone: clientPhone }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
