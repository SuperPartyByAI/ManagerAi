/**
 * /api/wa-sessions/[sessionId] — Status și QR Code per sesiune
 */
import { NextRequest, NextResponse } from 'next/server';

const BAILEYS_BASE = process.env.BAILEYS_ENGINE_URL || 'http://localhost:3002';
const API_KEY = process.env.BAILEYS_API_KEY || 'SECRET_TOKEN_CHANGE_ME';

const baileysHeaders = {
  'Content-Type': 'application/json',
  'x-api-key': API_KEY,
};

/**
 * GET /api/wa-sessions/[sessionId] — Status + QR Code dacă e în AWAITING_QR
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const res = await fetch(`${BAILEYS_BASE}/api/sessions/status/${sessionId}`, {
      headers: baileysHeaders,
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'Sesiunea nu există' }, { status: 404 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'Baileys Engine inaccesibil', details: msg }, { status: 503 });
  }
}

/**
 * POST /api/wa-sessions/[sessionId] — Rename sesiune (schimbă brand-ul)
 * Body: { newLabel: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const body = await req.json();
    const { newLabel } = body;

    const res = await fetch(`${BAILEYS_BASE}/api/sessions/rename`, {
      method: 'POST',
      headers: baileysHeaders,
      body: JSON.stringify({ sessionId, newLabel }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'Eroare la redenumire', details: msg }, { status: 500 });
  }
}
