import { jsonError, requireSuperPartyUser, SuperPartyApiError } from "@/lib/superparty/server";

export const dynamic = "force-dynamic";

const SESSION_ID = process.env.SUPERPARTY_WHATSAPP_SESSION_ID || "wa_wow";
const SESSION_LABEL = "WowParty";

function baileysConfig() {
  return {
    baseUrl: process.env.BAILEYS_ENGINE_URL || "http://127.0.0.1:3002",
    // Production already uses WA_API_KEY for message dispatch. Keep the
    // management endpoint on the same internal credential while accepting the
    // explicit Baileys name for newer installations.
    apiKey: process.env.WA_API_KEY || process.env.BAILEYS_API_KEY || "",
  };
}

async function baileysRequest(path: string, init?: RequestInit) {
  const { baseUrl, apiKey } = baileysConfig();
  if (!apiKey) throw new SuperPartyApiError("Cheia motorului WhatsApp nu este configurată.", 503);
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...(init?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new SuperPartyApiError(String(data?.error || data?.message || "Motorul WhatsApp nu a răspuns."), response.status);
  return data;
}

function publicStatus(data: Record<string, unknown>) {
  return {
    sessionId: SESSION_ID,
    status: String(data.status || "LOGGED_OUT").toUpperCase(),
    qrCode: typeof data.qrCode === "string" && data.qrCode.startsWith("data:image/") ? data.qrCode : null,
  };
}

export async function GET(request: Request) {
  try {
    const auth = await requireSuperPartyUser(request);
    if (!auth.isGm) throw new SuperPartyApiError("Doar GM poate reconecta WhatsApp.", 403);
    const data = await baileysRequest(`/api/sessions/status/${SESSION_ID}`);
    return Response.json(publicStatus(data));
  } catch (error) {
    return jsonError(error, "Starea WhatsApp nu a putut fi citită.");
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireSuperPartyUser(request);
    if (!auth.isGm) throw new SuperPartyApiError("Doar GM poate reconecta WhatsApp.", 403);
    const data = await baileysRequest("/api/sessions/start", {
      method: "POST",
      body: JSON.stringify({ sessionId: SESSION_ID, sessionLabel: SESSION_LABEL }),
    });
    return Response.json(publicStatus(data));
  } catch (error) {
    return jsonError(error, "Sesiunea WhatsApp nu a putut fi pornită.");
  }
}
