import { jsonError, maskSensitiveText, requireSuperPartyUser, SuperPartyApiError } from "@/lib/superparty/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSuperPartyUser(request);
    const { id } = await context.params;
    const { data: conversation, error: conversationError } = await auth.admin
      .from("conversations")
      .select("id, client_id, session_id, public_alias, custom_name")
      .eq("id", id)
      .maybeSingle();
    if (conversationError || !conversation) throw new SuperPartyApiError("Conversația nu există.", 404);
    const { data: session } = await auth.admin.from("whatsapp_sessions").select("brand_key").eq("session_key", conversation.session_id).maybeSingle();
    if (String(session?.brand_key || "").toLowerCase() !== "wowparty") throw new SuperPartyApiError("Conversația nu aparține WowParty.", 403);

    const [{ data: messages, error: messageError }, { data: events, error: eventError }, { data: client }] = await Promise.all([
      auth.admin.from("messages").select("id, content, direction, sender_type, status, created_at, message_type, media_url, mime_type, quoted_text, quoted_sender").eq("conversation_id", id).order("created_at", { ascending: true }).limit(250),
      auth.admin.from("events").select("id, title, event_date, start_time, event_time, event_location, location_text, status, price_agreed, budget_estimate, services, characters, last_ai_updated_at").eq("conversation_id", id).eq("business_id", "wowparty").eq("is_test", false).order("event_date", { ascending: true }),
      auth.admin.from("clients").select("public_alias, client_alias, alias_index").eq("id", conversation.client_id).maybeSingle(),
    ]);
    if (messageError || eventError) throw messageError || eventError;
    const alias = conversation.public_alias || conversation.custom_name || client?.public_alias || client?.client_alias || `Client #${client?.alias_index || String(conversation.client_id).slice(0, 4)}`;
    return Response.json({
      conversation: { id, clientId: conversation.client_id, alias: maskSensitiveText(alias) },
      messages: (messages || []).map((message) => ({
        id: message.id,
        content: maskSensitiveText(message.content),
        direction: message.direction,
        senderType: message.sender_type,
        status: message.status,
        createdAt: message.created_at,
        messageType: message.message_type,
        mediaUrl: message.media_url,
        mimeType: message.mime_type,
        quotedText: maskSensitiveText(message.quoted_text),
        quotedSender: maskSensitiveText(message.quoted_sender),
      })),
      events: (events || []).map((event) => ({ ...event, client_phone: undefined })),
    });
  } catch (error) {
    return jsonError(error, "Conversația nu a putut fi încărcată.");
  }
}
