import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Import the legacy AI orchestration pipeline we copied over
// We use require to bypass some strict TS module resolution issues with .mjs in Next if any
// @ts-ignore
import { processConversation } from '../../../backend/orchestration/processConversation.mjs';

const DEBOUNCE_MS = parseInt(process.env.AI_DEBOUNCE_MS || '15000', 10);

// In-memory debounce state (Works well for local/VPS deployment, less ideal for Serverless)
// conversation_id → { timer, latestMessageId, count }
const debounceTimers = new Map<string, any>();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(req: Request) {
  try {
    const signature = req.headers.get('x-hub-signature');
    const webhookSecret = process.env.MANAGER_AI_WEBHOOK_SECRET || 'dev-secret-123';

    if (!signature) {
      console.warn('[Webhook config] Missing signature');
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    const bodyStr = await req.text();
    const hash = `sha256=${crypto.createHmac('sha256', webhookSecret).update(bodyStr).digest('hex')}`;

    if (hash !== signature) {
      console.warn('[Webhook security] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    const payload = JSON.parse(bodyStr);
    const { message_id, conversation_id, content, sender_type } = payload;
    
    console.log(`[Next.js Webhook MSG] Received verified msg ${message_id} for conv ${conversation_id} from ${sender_type}`);

    // Idempotency check: see if we already have this message processed
    const { data: stateData } = await supabase
      .from('ai_conversation_state')
      .select('last_processed_message_id')
      .eq('conversation_id', conversation_id)
      .maybeSingle();

    if (stateData && stateData.last_processed_message_id === message_id) {
      console.log(`[Next.js Webhook MSG] Idempotency catch: Msg ${message_id} already processed. Skipping.`);
      return NextResponse.json({ status: 'already_processed' }, { status: 200 });
    }

    // ── Debounce: coalesce rapid messages into one pipeline run ──
    const existing = debounceTimers.get(conversation_id);
    if (existing) {
      clearTimeout(existing.timer);
      existing.latestMessageId = message_id;
      existing.count += 1;
      console.log(`[Debounce] Reset timer for ${conversation_id} (${existing.count} msgs coalesced)`);
    }

    const entry = existing || { latestMessageId: message_id, count: 1, timer: null };
    
    entry.timer = setTimeout(() => {
      debounceTimers.delete(conversation_id);
      console.log(`[Debounce] Firing pipeline for ${conversation_id} (coalesced ${entry.count} msgs)`);
      
      // Execute the AI pipeline
      processConversation(conversation_id, entry.latestMessageId).catch((err: any) => {
          console.error('[Next.js Webhook Pipeline Error]', err);
      });
      
    }, DEBOUNCE_MS);

    if (!existing) debounceTimers.set(conversation_id, entry);

    // Return 200 immediately to not block WhatsApp
    return NextResponse.json({ status: 'queued' }, { status: 200 });

  } catch (e: any) {
    console.error('[Webhook error]', e.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
