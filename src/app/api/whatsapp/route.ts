import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Removed legacy orchestration import
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
    
    entry.timer = setTimeout(async () => {
      debounceTimers.delete(conversation_id);
      console.log(`[Debounce] Firing pipeline for ${conversation_id} (coalesced ${entry.count} msgs)`);
      
      try {
          // 1. Resolve client via conversation
          const { data: conv } = await supabase.from('conversations').select('client_id').eq('id', conversation_id).single();
          if (!conv) return;
          const clientId = conv.client_id;

          const userText = content?.toLowerCase() || '';
          
          // 2. REAL GEMINI: Extract services from user text
          if (userText.trim().length > 0) {
              const geminiKey = process.env.GEMINI_API_KEY;
              if (!geminiKey) {
                  console.error('[AI WEBHOOK API] No GEMINI_API_KEY found in env');
                  return;
              }

              // Always fetch existing draft to give context to Gemini
              const { data: existingDraft } = await supabase.from('ai_client_events')
                  .select('id, servicii_cerute')
                  .eq('client_id', clientId)
                  .eq('status', 'draft')
                  .maybeSingle();

              // Fetch up to 100 messages from ALL conversations of this client to act as the global Notebook
              const { data: clientConvs } = await supabase.from('conversations').select('id').eq('client_id', clientId);
              const convIds = clientConvs && clientConvs.length > 0 ? clientConvs.map(c => c.id) : [conversation_id];

              const { data: recentMsgs } = await supabase.from('messages')
                  .select('content, sender_type, created_at')
                  .in('conversation_id', convIds)
                  .order('created_at', { ascending: false })
                  .limit(100);
                  
              // Sort the messages chronologically and append the current new message at the end
              const historyStr = (recentMsgs || []).reverse().map(m => {
                 const time = new Date(m.created_at).toLocaleTimeString('ro-RO', {hour: '2-digit', minute:'2-digit'});
                 const role = m.sender_type === 'ai' || m.sender_type === 'operator' ? 'Compania' : 'Clientul';
                 return `[${time}] ${role}: ${m.content}`;
              }).join('\n');

              console.log(`[AI WEBHOOK] Calling Gemini 1.5 Flash 8B for ${clientId} with history context...`);
              
              const systemPrompt = `Extrageți serviciile cerute din textul clientului privind organizarea unui eveniment (petreceri copii/botez).
Analizează întreaga istorie a conversației pentru a deduce datele evenimentului (data, ora, număr copii, etc) chair dacă ele au fost menționate de client în mesaje anterioare.
Tu extragi datele strict în format JSON care să poată fi direct salvat în baza de date.
Folosești DOAR următoarele structuri permise și cheile exacte dacă sunt menționate sau deduse clar din text. Dacă clientul "nu mai vrea" sau anulează un serviciu, setează "adaugat": false pentru acel bloc.
Structuri permise în root JSON (adaugate dacă reies din text):
- "animatori": { "adaugat": true/false, "personaj": string, "nume_copil": string, "varsta_copiilor": string, "numar_copii": string, "metoda_plata": string, "data": string, "ora": string, "adresa": string }
- "baloane": { "adaugat": true/false, "tip_baloane": string, "culori_preferate": [string] }
- "ursitoare": { "adaugat": true/false, "nume_copil": string }

Dacă datele lipsesc dintr-un bloc permis pe care clientul îl cere, lasă proprietățile nested lipsă, nu le pune null. Nu inventa date.
Starea curentă a serviciilor în baza de date: ${JSON.stringify(existingDraft?.servicii_cerute || {})}

## ISTORICUL CONVERSATIEI RECENTE (pentru context):
${historyStr}

## ULTIMUL MESAJ PRIMIT:
${userText}`;

              try {
                  let model = 'gemini-2.5-flash-lite';
                  if (model !== 'gemini-2.5-flash-lite') {
                      throw new Error("STRICT POLICY: Utilizarea oricarui alt model in afara de gemini-2.5-flash-lite este INTERZISA!");
                  }
                  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({
                       contents: [{ role: "user", parts: [{ text: "Extrage datele ținând cont de istoricul furnizat în instrucțiuni, bazându-te în special pe ultimul mesaj." }] }],
                       systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
                       generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
                     })
                  });

                  if (!res.ok) {
                      const errText = await res.text();
                      console.error('[AI WEBHOOK API] Gemini Error:', errText);
                      return;
                  }

                  const aiData = await res.json();
                  const extractedText = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
                  
                  if (extractedText) {
                      let extractedData = {};
                      try {
                          extractedData = JSON.parse(extractedText);
                      } catch (e) {
                          console.error('[AI WEBHOOK API] Failed to parse JSON from Gemini:', extractedText);
                          return;
                      }
                  
                  // Only update if the AI actually extracted recognized root keys
                  if (Object.keys(extractedData).length > 0) {
                      if (existingDraft) {
                          await supabase.from('ai_client_events').update({
                              servicii_cerute: { ...(existingDraft.servicii_cerute || {}), ...extractedData },
                              updated_at: new Date().toISOString()
                          }).eq('id', existingDraft.id);
                          console.log(`[AI WEBHOOK] Updated draft via Gemini for ${clientId}`, extractedData);
                      } else {
                          await supabase.from('ai_client_events').insert({
                              client_id: clientId,
                              status: 'draft',
                              servicii_cerute: extractedData
                          });
                          console.log(`[AI WEBHOOK] Created new draft via Gemini for ${clientId}`, extractedData);
                      }
                  }
              }
              } catch (apiErr: any) {
                  console.error('[AI WEBHOOK API] Gemini fetch/parse error:', apiErr);
              }
          }
      } catch (err: any) {
          console.error('[Next.js Webhook Mock Pipeline Error]', err);
      }
      
    }, DEBOUNCE_MS);

    if (!existing) debounceTimers.set(conversation_id, entry);

    // Return 200 immediately to not block WhatsApp
    return NextResponse.json({ status: 'queued' }, { status: 200 });

  } catch (e: any) {
    console.error('[Webhook error]', e.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
