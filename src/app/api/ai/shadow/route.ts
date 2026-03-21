import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { brand, phone, messages } = await req.json();

    if (!phone || !messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Missing phone or messages" }, { status: 400 });
    }

    const lastMessage = messages[messages.length - 1]?.text || "";

    // The Dashboard (NextJS) forwards the request to the Live Worker (Express API)
    // The Live Worker API exposes a secure sandbox endpoint that runs the SAME Brain, 
    // but without mutating the Postgres Database!
    const workerPort = process.env.MANAGER_API_PORT || "3001";
    
    // We try to call localhost:3001 first, and fallback to the public URL if needed.
    // Assuming the Live Worker is running on the same VPS machine.
    const apiUrl = `http://127.0.0.1:${workerPort}/api/internal/shadow-run`;

    console.log(`[Shadow AI Proxy] Trimit către Nucleul Central -> ${apiUrl}`);

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand, phone, message: lastMessage, messages })
    });

    if (!res.ok) {
      throw new Error(`Worker API a returnat status ${res.status}: ${await res.text()}`);
    }

    // The result comes back pre-formatted from the Live Worker
    const result = await res.json();

    const responses = messages.map((m: any, idx: number) => ({
        idx,
        sender_type: m.role === 'model' || m.role === 'ai' ? 'ai' : 'client',
        content: m.text || m.content,
        created_at: new Date().toISOString(),
        // Only attach the fresh AI reply to the very last message in the simulated chat
        ai_response: idx === messages.length - 1 ? (result.reply || "Nu am primit un răspuns clar.") : null
    }));

    return NextResponse.json({
      responses,
      latencyMs: result.latencyMs,
      functionCall: result.functionCalls?.length > 0 ? result.functionCalls[0] : null
    });

  } catch (err: any) {
    console.error("[Shadow AI Proxy] Error:", err.message);
    return NextResponse.json(
      { error: "Eroare rețea/AI: " + err.message },
      { status: 500 }
    );
  }
}
