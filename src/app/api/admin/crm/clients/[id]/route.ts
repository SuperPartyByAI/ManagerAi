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
    // In API-ul vechi, sistemul incerca sa faca 'lookup cross-QR' luand acelasi telefon si incarcand absolut toate
    // mesajele, amestecand brandurile vizual. Acum pastram STRICT client_id dat ca argument, deoarece este unic pe QR.
    const allClientIds: string[] = [id];

    // Luam toate conversatiile de la acest client (izolare perfecta)
    const { data: convs, error: convErr } = await supabase
      .from('conversations')
      .select('id')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (convErr) throw convErr;

    console.log('Next route fetching id:', id, 'All client IDs:', allClientIds.length, 'Found convs:', convs?.length);
    const convIds = convs?.map((c: { id: string }) => c.id) || [];
    let latestMessages: any[] = [];
    const decisionsMap = new Map();

    if (convIds.length > 0) {
      const { data: msgs } = await supabase
        .from('messages')
        .select('id, conversation_id, content, sender_type, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false })
        .limit(100);
        
      latestMessages = (msgs || []).reverse();
      
      // Aduce deciziile AI asociate discuțiilor curente
      const { data: decisions } = await supabase
        .from('ai_reply_decisions')
        .select('suggested_reply, operator_edited_reply, tool_action_suggested, safety_class, reply_status, operator_verdict, confidence_score, created_at, id, conversation_id')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false })
        .limit(100);

      (decisions || []).forEach(d => {
          if (!decisionsMap.has(d.conversation_id)) {
              decisionsMap.set(d.conversation_id, []);
          }
          decisionsMap.get(d.conversation_id).push(d);
      });
      
      // Mapăm deciziile invizibile fix în dreptul actiunilor
      latestMessages = latestMessages.map((m: any) => {
          const conversationDecisions = decisionsMap.get(m.conversation_id) || [];
          // Alegem ultima decizie (ce voia sa trimita AI-ul) creata cel târziu odată cu mesajul uman
          const decision = conversationDecisions
              .filter((d: any) => new Date(d.created_at).getTime() <= new Date(m.created_at).getTime())
              .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

          return {
              ...m,
              ai_reply: decision?.operator_edited_reply || decision?.suggested_reply || null,
              tool_action: decision?.tool_action_suggested || null,
              safety_class: decision?.safety_class || null,
              reply_status: decision?.reply_status || null,
              operator_verdict: decision?.operator_verdict || null,
              confidence: decision?.confidence_score || null,
              ai_decision_id: decision?.id || null
          };
      });
    }

    return NextResponse.json({
      latest_messages: latestMessages,
      debug: { id, convCount: convs?.length, clientIds: allClientIds.length }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
