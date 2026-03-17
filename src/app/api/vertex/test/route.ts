import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleAuth } from "google-auth-library";
import path from "node:path";

const vtxSupa = createClient(
  process.env.NEXT_PUBLIC_VERTEX_SUPABASE_URL!,
  process.env.VERTEX_SUPABASE_SERVICE_KEY!
);

const SA_KEY_PATH = path.resolve(process.cwd(), "../vertex-ai-runner-key.json");
const auth = new GoogleAuth({
  keyFilename: SA_KEY_PATH,
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

// POST: send a test message to Vertex AI with brand-specific config + sources + memory
export async function POST(req: NextRequest) {
  try {
    const { phone, message, brand } = await req.json();
    if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

    const brandKey = brand || "GLOBAL";
    const clientPhone = phone || "simulator";

    // Load brand-specific config (fall back to GLOBAL if brand has no config)
    let { data: cfgData } = await vtxSupa
      .from("vertex_config")
      .select("config_key, config_value")
      .eq("brand_key", brandKey);

    // Fallback to GLOBAL config if brand has none
    if (!cfgData || cfgData.length === 0) {
      const resp = await vtxSupa
        .from("vertex_config")
        .select("config_key, config_value")
        .eq("brand_key", "GLOBAL");
      cfgData = resp.data;
    }

    const cfg: Record<string, string> = {};
    (cfgData || []).forEach((c: { config_key: string; config_value: string }) => {
      cfg[c.config_key] = c.config_value;
    });

    // Check global AI kill switch
    if (cfg.ai_enabled === "false") {
      return NextResponse.json({ reply: null, aiDisabled: true });
    }

    const basePrompt = cfg.system_prompt || "Ești asistentul virtual Superparty.";

    // Load brand-specific sources (fall back to GLOBAL)
    let { data: sourcesData } = await vtxSupa
      .from("vertex_sources")
      .select("title, content, category")
      .eq("brand_key", brandKey)
      .eq("is_active", true);

    if (!sourcesData || sourcesData.length === 0) {
      const resp = await vtxSupa
        .from("vertex_sources")
        .select("title, content, category")
        .eq("brand_key", "GLOBAL")
        .eq("is_active", true);
      sourcesData = resp.data;
    }

    // Load conversation history for this client+brand (last 20 messages)
    const sessionId = `${brandKey}-${clientPhone}`;
    const { data: historyData } = await vtxSupa
      .from("vertex_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(20);

    // Build date/time
    const now = new Date();
    const dateStr = now.toLocaleDateString("ro-RO", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const timeStr = now.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });

    // Build full system prompt — DO NOT expose internal brand_key to clients
    let systemPrompt = `Data și ora curentă: ${dateStr}, ora ${timeStr}.\n\n${basePrompt}`;

    if (sourcesData && sourcesData.length > 0) {
      const sourcesText = sourcesData
        .map((s: { title: string; content: string; category: string }) => `### ${s.title} [${s.category}]\n${s.content}`)
        .join("\n\n---\n\n");
      systemPrompt += `\n\n---\n\n📚 SURSE DE CUNOȘTINȚE (răspunde STRICT din aceste informații. Dacă nu găsești răspunsul, spune sincer că trebuie să verifici):\n\n${sourcesText}`;
    }

    // Build conversation contents with history
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    if (historyData && historyData.length > 0) {
      for (const h of historyData) {
        contents.push({
          role: h.role === "user" ? "user" : "model",
          parts: [{ text: h.content }],
        });
      }
    }

    // Add current message
    contents.push({ role: "user", parts: [{ text: message }] });

    const model = cfg.vertex_model || "gemini-2.5-flash-lite";
    const temperature = Number.parseFloat(cfg.temperature || "0.3");
    const maxTokens = Number.parseInt(cfg.max_tokens || "2048", 10);
    const project = process.env.VERTEX_AI_PROJECT || "superparty-vertex-ai";
    const location = process.env.VERTEX_AI_LOCATION || "europe-west1";

    // Get OAuth2 access token
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;

    if (!accessToken) {
      return NextResponse.json({ error: "Failed to get access token" }, { status: 500 });
    }

    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;

    const startTs = Date.now();
    const vertexRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
    });

    const vertexData = await vertexRes.json();
    const latencyMs = Date.now() - startTs;

    if (!vertexRes.ok) {
      const errMsg = vertexData.error?.message || "";
      // Friendly message for rate limiting
      if (vertexRes.status === 429 || errMsg.includes("Resource exhausted")) {
        return NextResponse.json({
          reply: "⏳ Momentan sunt foarte solicitat. Te rog încearcă din nou în câteva secunde.",
          latencyMs,
          rateLimited: true,
        });
      }
      return NextResponse.json({
        reply: "❌ A apărut o eroare temporară. Te rog încearcă din nou.",
        error: errMsg,
        latencyMs,
      });
    }

    const candidate = vertexData.candidates?.[0];
    const reply = candidate?.content?.parts?.[0]?.text || "";
    const functionCall = candidate?.content?.parts?.find(
      (p: { functionCall?: unknown }) => p.functionCall
    )?.functionCall;

    // Save both messages to vertex_messages (with brand + client)
    await vtxSupa.from("vertex_messages").insert([
      {
        session_id: `${brandKey}-${clientPhone}`,
        role: "user",
        content: message,
        brand_key: brandKey,
        client_phone: clientPhone,
      },
      {
        session_id: `${brandKey}-${clientPhone}`,
        role: "model",
        content: reply,
        brand_key: brandKey,
        client_phone: clientPhone,
        function_name: functionCall?.name || null,
        function_args: functionCall?.args || null,
      },
    ]);

    return NextResponse.json({
      reply,
      functionCall: functionCall || null,
      latencyMs,
      model,
      location,
      provider: "Vertex AI",
      brand: brandKey,
      phone: clientPhone,
      historyLength: (historyData?.length || 0) + 1,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET: load conversation history for simulator
export async function GET(req: NextRequest) {
  try {
    const brand = req.nextUrl.searchParams.get("brand") || "GLOBAL";
    const phone = req.nextUrl.searchParams.get("phone") || "simulator";
    const sessionId = `${brand}-${phone}`;

    const { data, error } = await vtxSupa
      .from("vertex_messages")
      .select("role, content, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) throw error;

    const messages = (data || []).map((m: { role: string; content: string; created_at: string }) => ({
      role: m.role === "user" ? "user" : "ai",
      text: m.content,
      time: new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }));

    return NextResponse.json({ messages });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: clear conversation history from Supabase
export async function DELETE(req: NextRequest) {
  try {
    const { brand, phone } = await req.json();
    const brandKey = brand || "GLOBAL";
    const clientPhone = phone || "simulator";
    const sessionId = `${brandKey}-${clientPhone}`;

    const { error } = await vtxSupa
      .from("vertex_messages")
      .delete()
      .eq("session_id", sessionId);

    if (error) throw error;
    return NextResponse.json({ ok: true, deleted: sessionId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
