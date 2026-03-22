import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    {
       auth: { persistSession: false },
       global: { fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' as RequestCache }) }
    }
  );

  try {
    // 1. Luam conversatiile acestui client_id
    const { data: convs } = await supabase
      .from('conversations')
      .select('id')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(10);
      
    if (!convs || convs.length === 0) return NextResponse.json({ error: 'Nicio conversație' }, { status: 404 });
    const convIds = convs.map((c: any) => c.id);

    // 2. Fetch ultimele 100 mesaje
    const { data: msgs } = await supabase
      .from('messages')
      .select('content, sender_type, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!msgs || msgs.length === 0) return NextResponse.json({ error: 'Niciun mesaj găsit' }, { status: 404 });

    const messages = msgs.reverse().map((m: any) => `${m.sender_type === 'client' ? 'Client' : 'Noi'}: ${m.content}`).join('\n');

    // 3. Apelam Gemini
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
    const prompt = `Analizează și extrage "memoria agentului" din următoarea conversație WhatsApp.
Ignoră complet zgomotul (salutări, discuții paralele inutile).
Extrage DOAR lucrurile esențiale într-un mod structurat, tehnic, scurt (stil jurnal de notițe administrative).
Include:
- Detalii cheie (Data eveniment, locație, persoană)
- Decizii luate (ce dorește clientul)
- Prețuri discutate sau oferte transmise
- Status curent
Fii extrem de concis și profesionist!

CONVERSAȚIE:
${messages}`;

    let summary = '';
    try {
        const response = await ai.models.generateContent({
            model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
            contents: prompt,
        });
        summary = response.text || "Nu s-a putut genera un rezumat (text returnat vid).";
    } catch (aiErr: any) {
        console.error("Eroare generare Gemini:", aiErr);
        summary = `⚠️ Eroare AI: ${aiErr.message}`;
    }

    // 4. Salvam rezumatul în Notebook-ul existent
    const { data: client } = await supabase.from('clients').select('real_phone_e164, brand_key').eq('id', id).single();
    if (client) {
      const pn = client.real_phone_e164;
      const bk = client.brand_key || '';
      
      const { data: existingNb } = await supabase.from('client_notebooks_v2').select('clean_notebook').eq('phone_number', pn).eq('wa_number', bk).single();
      const currentNb = existingNb?.clean_notebook || {};
      
      currentNb.rezumat_ai = summary;
      
      await supabase.from('client_notebooks_v2').upsert({
         phone_number: pn,
         wa_number: bk,
         clean_notebook: currentNb,
         updated_at: new Date().toISOString()
      }, { onConflict: 'phone_number, wa_number' });
    }

    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    console.error("Eroare Summarize:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
