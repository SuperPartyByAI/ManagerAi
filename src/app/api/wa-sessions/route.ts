/**
 * /api/wa-sessions — Proxy securizat Next.js → Baileys Engine (port 3002)
 * Expune operațiunile de management sesiuni WhatsApp pentru UI-ul Admin.
 */
import { NextRequest, NextResponse } from 'next/server';

const BAILEYS_BASE = process.env.BAILEYS_ENGINE_URL || 'http://localhost:3002';
const API_KEY = process.env.BAILEYS_API_KEY || 'SECRET_TOKEN_CHANGE_ME';

const baileysHeaders = {
  'Content-Type': 'application/json',
  'x-api-key': API_KEY,
};

/**
 * GET /api/wa-sessions — Lista tuturor sesiunilor active
 */
export async function GET() {
  try {
    const res = await fetch(`${BAILEYS_BASE}/api/sessions/status`, {
      headers: baileysHeaders,
      cache: 'no-store',
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'Baileys Engine inaccesibil', details: msg }, { status: 503 });
  }
}

/**
 * POST /api/wa-sessions — Pornește o sesiune nouă cu Pre-Brand Lock
 * Body: { sessionId: string, sessionLabel: string }
 * Exemplu: { sessionId: "wa_superparty", sessionLabel: "Superparty" }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, sessionLabel } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId este obligatoriu' }, { status: 400 });
    }
    if (!sessionLabel || !sessionLabel.trim()) {
      return NextResponse.json({ error: 'sessionLabel (Numele Brandului) este obligatoriu pentru a garanta identitatea corectă a clienților' }, { status: 400 });
    }

    const res = await fetch(`${BAILEYS_BASE}/api/sessions/start`, {
      method: 'POST',
      headers: baileysHeaders,
      body: JSON.stringify({ sessionId, sessionLabel: sessionLabel.trim() }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'Eroare la pornirea sesiunii', details: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/wa-sessions — Logout sesiune
 * Body: { sessionId: string }
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId } = body;
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId este obligatoriu' }, { status: 400 });
    }
    const res = await fetch(`${BAILEYS_BASE}/api/sessions/logout`, {
      method: 'POST',
      headers: baileysHeaders,
      body: JSON.stringify({ sessionId }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'Eroare la logout', details: msg }, { status: 500 });
  }
}
