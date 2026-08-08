import { jsonError, requireSuperPartyUser, SuperPartyApiError } from "@/lib/superparty/server";

export const dynamic = "force-dynamic";

type ConversationAccess = {
  can_reply: boolean;
  reason: string;
  available_balance: number | string | null;
  required_amount: number | string | null;
  shortfall: number | string | null;
};

export async function POST(request: Request) {
  try {
    const auth = await requireSuperPartyUser(request);
    const body = await request.json();
    const conversationId = String(body?.conversationId || "").trim();
    const text = String(body?.text || "").trim();
    if (!conversationId) throw new SuperPartyApiError("Conversația este obligatorie.", 400);
    if (!text || text.length > 10000) throw new SuperPartyApiError("Mesajul trebuie să aibă între 1 și 10.000 de caractere.", 400);

    const { data: profile } = await auth.admin.from("profiles").select("can_reply_whatsapp, is_active, status").eq("id", auth.user.id).maybeSingle();
    if (!auth.isGm && (profile?.can_reply_whatsapp === false || profile?.is_active === false || profile?.status !== "approved")) {
      throw new SuperPartyApiError("Contul nu are permisiunea de a trimite mesaje.", 403);
    }

    const { data: rawAccess, error: accessError } = await auth.scoped.rpc("get_conversation_reply_access", { p_conversation_id: conversationId }).maybeSingle();
    const access = rawAccess as ConversationAccess | null;
    if (accessError) throw new SuperPartyApiError("Nu s-a putut verifica soldul conversației.", 503);
    if (!access?.can_reply) {
      const shortfall = Number(access?.shortfall || 0);
      const required = Number(access?.required_amount || 0);
      const available = Number(access?.available_balance || 0);
      const message = access?.reason === "insufficient_credit"
        ? `Conversația este blocată. Lipsesc ${shortfall.toFixed(2)} lei din comisionul de ${required.toFixed(2)} lei.`
        : `Este necesar credit pozitiv înainte de răspuns. Sold disponibil: ${available.toFixed(2)} lei.`;
      return Response.json({ error: message, code: access?.reason, access }, { status: 402 });
    }

    const { data: conversation, error: conversationError } = await auth.admin.from("conversations").select("id, session_id").eq("id", conversationId).maybeSingle();
    if (conversationError || !conversation?.session_id) throw new SuperPartyApiError("Conversația nu a fost găsită.", 404);
    const { data: session, error: sessionError } = await auth.admin.from("whatsapp_sessions").select("brand_key, port, status").eq("session_key", conversation.session_id).maybeSingle();
    if (sessionError || String(session?.brand_key || "").toLowerCase() !== "wowparty") throw new SuperPartyApiError("Sesiunea nu aparține WowParty.", 403);
    if (String(session?.status || "").toLowerCase() !== "connected") throw new SuperPartyApiError("WhatsApp WowParty este deconectat. Mesajul nu a fost trimis.", 503);

    const apiKey = process.env.WA_API_KEY || process.env.BAILEYS_API_KEY;
    if (!apiKey || apiKey === "SECRET_TOKEN_CHANGE_ME") throw new SuperPartyApiError("Cheia internă Baileys nu este configurată.", 500);
    const port = Number(session?.port || 3002);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new SuperPartyApiError("Portul sesiunii WhatsApp nu este valid.", 500);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let upstream: Response;
    try {
      upstream = await fetch(`http://127.0.0.1:${port}/api/messages/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ sessionId: conversation.session_id, conversationId, text, message_type: "text", sender_type: "agent" }),
        signal: controller.signal,
      });
    } catch {
      throw new SuperPartyApiError("Serviciul WhatsApp nu răspunde momentan.", 502);
    } finally {
      clearTimeout(timeout);
    }
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) throw new SuperPartyApiError(upstream.status === 400 ? String(payload?.error || "Mesaj invalid.") : "Gateway-ul WhatsApp a refuzat expedierea.", upstream.status === 400 ? 400 : 502);
    return Response.json({ success: true, status: "dispatched", messageId: payload?.messageId || payload?.id || null });
  } catch (error) {
    return jsonError(error, "Mesajul nu a putut fi trimis.");
  }
}
