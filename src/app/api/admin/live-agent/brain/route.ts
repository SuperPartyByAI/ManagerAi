import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { securityCheck } from '@/lib/security-middleware';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const conversation_id = searchParams.get('conversation_id');
  const client_id = searchParams.get('client_id');
  
  if (!conversation_id && !client_id) {
    return NextResponse.json({ error: "conversation_id sau client_id sunt obligatorii" }, { status: 400 });
  }
  
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
        // Run security checks
        const check = await securityCheck({
          userId: user.id,
          email: user.email || '',
          action: 'view_live_agent',
          permission: 'view_live_agent',
          resourceType: 'system',
          ipAddress: request.headers.get('x-forwarded-for') || undefined,
        });

        if (!check.allowed) {
          return NextResponse.json({ error: check.reason || 'Access denied' }, { status: 403 });
        }
      }
    } catch (e) {
      console.warn('[SECURITY] Auth validation error in live-agent:', e);
    }
  }
  
  try {
    let actualConvId = conversation_id;
    
    // Daca aveam doar client_id, cautam conversatia activa
    if (!actualConvId && client_id) {
        const { data: convs } = await supabase.from('conversations')
            .select('id')
            .eq('client_id', client_id)
            .order('created_at', { ascending: false })
            .limit(1);
        if (convs && convs.length > 0) {
            actualConvId = convs[0].id;
        }
    }

    if (!actualConvId) {
        return NextResponse.json({ decisions: [], drafts: [] });
    }

    // 1. Fetch AI Reply Decisions
    const { data: decisions, error: err1 } = await supabase
        .from('ai_reply_decisions')
        .select('*')
        .eq('conversation_id', actualConvId)
        .order('created_at', { ascending: false })
        .limit(50);

    if (err1) throw err1;

    // 2. Fetch AI Event Drafts (unified)
    const { data: draftsRaw, error: err2 } = await supabase
        .from('ai_client_events')
        .select('*')
        .eq('client_id', client_id) // route.ts has client_id in scope
        .eq('status', 'draft')
        .order('updated_at', { ascending: false })
        .limit(1);

    if (err2) throw err2;

    const drafts = (draftsRaw || []).map(d => ({
        id: d.id,
        client_id: d.client_id,
        draft_status: d.status,
        structured_data_json: {
            date: d.data_eveniment,
            time: d.ora_eveniment,
            location: d.locatie
        },
        services: (d.servicii_cerute || []).map((s: any) => s.role_key),
        updated_at: d.updated_at
    }));

    // 3. Fetch REAl messages (Client & Human Agent & AI if sent)
    const { data: realMessages, error: errReal } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', actualConvId)
        .order('created_at', { ascending: true })
        .limit(1000);
        
    if (errReal) throw errReal;

    // 4. Fetch Shadow Training Messages (What AI thought)
    const { data: shadow, error: err3 } = await supabase
        .from('ai_training_messages')
        .select('*')
        .eq('conversation_id', actualConvId)
        .order('created_at', { ascending: true })
        .limit(1000);
        
    if (err3) throw err3;

    return NextResponse.json({ 
        decisions: decisions || [], 
        drafts: drafts || [],
        shadow_chat: shadow || [],
        real_chat: realMessages || []
    });
    
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
