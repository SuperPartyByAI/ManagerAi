import { jsonError, maskSensitiveText, requireSuperPartyUser } from "@/lib/superparty/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireSuperPartyUser(request);
    const { data: sessions, error: sessionError } = await auth.admin
      .from("whatsapp_sessions")
      .select("session_key, label, status, last_seen_at")
      .ilike("brand_key", "wowparty");
    if (sessionError) throw sessionError;
    const sessionIds = (sessions || []).map((row) => String(row.session_key));
    if (!sessionIds.length) return Response.json({ conversations: [], sessions: [] });

    const { data: conversations, error: conversationError } = await auth.admin
      .from("conversations")
      .select("id, client_id, status, assigned_agent_id, last_message_at, updated_at, session_id, public_alias, custom_name, category")
      .in("session_id", sessionIds)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(100);
    if (conversationError) throw conversationError;
    const conversationIds = (conversations || []).map((row) => String(row.id));
    const clientIds = [...new Set((conversations || []).map((row) => String(row.client_id)).filter(Boolean))];

    const [{ data: messages, error: messageError }, { data: clients, error: clientError }, { data: accessRows, error: accessError }] = await Promise.all([
      conversationIds.length
        ? auth.admin.from("messages").select("id, conversation_id, content, direction, sender_type, status, created_at, message_type").in("conversation_id", conversationIds).order("created_at", { ascending: false }).limit(1000)
        : Promise.resolve({ data: [], error: null }),
      clientIds.length
        ? auth.admin.from("clients").select("id, public_alias, client_alias, alias_index, avatar_url").in("id", clientIds)
        : Promise.resolve({ data: [], error: null }),
      conversationIds.length
        ? auth.admin.from("event_commission_access").select("conversation_id, event_id, access_status, required_amount, reserved_amount, charged_amount").in("conversation_id", conversationIds).neq("access_status", "released")
        : Promise.resolve({ data: [], error: null }),
    ]);
    const firstError = messageError || clientError || accessError;
    if (firstError) throw firstError;

    const latestByConversation = new Map<string, Record<string, unknown>>();
    const unreadByConversation = new Map<string, number>();
    for (const message of messages || []) {
      const id = String(message.conversation_id);
      if (!latestByConversation.has(id)) latestByConversation.set(id, message);
      if (message.direction === "inbound" && message.status !== "read") unreadByConversation.set(id, (unreadByConversation.get(id) || 0) + 1);
    }
    const clientById = new Map((clients || []).map((row) => [String(row.id), row]));
    const blockedByConversation = new Map<string, Record<string, unknown>>();
    for (const access of accessRows || []) {
      if (access.access_status === "blocked") blockedByConversation.set(String(access.conversation_id), access);
    }

    return Response.json({
      sessions: (sessions || []).map((session) => ({ label: session.label || "WowParty", status: session.status, lastSeenAt: session.last_seen_at })),
      conversations: (conversations || []).map((conversation) => {
        const client = clientById.get(String(conversation.client_id));
        const latest = latestByConversation.get(String(conversation.id));
        const blocked = blockedByConversation.get(String(conversation.id));
        const alias = conversation.public_alias || conversation.custom_name || client?.public_alias || client?.client_alias || `Client #${client?.alias_index || String(conversation.client_id).slice(0, 4)}`;
        return {
          id: conversation.id,
          clientId: conversation.client_id,
          alias: maskSensitiveText(alias),
          avatarUrl: client?.avatar_url || null,
          status: blocked ? "blocked" : conversation.status,
          lastMessage: maskSensitiveText(latest?.content || "Conversație nouă"),
          lastMessageAt: latest?.created_at || conversation.last_message_at || conversation.updated_at,
          lastDirection: latest?.direction || null,
          unread: unreadByConversation.get(String(conversation.id)) || 0,
          access: blocked ? {
            eventId: blocked.event_id,
            required: Number(blocked.required_amount || 0),
            covered: Number(blocked.reserved_amount || 0) + Number(blocked.charged_amount || 0),
            shortfall: Math.max(0, Number(blocked.required_amount || 0) - Number(blocked.reserved_amount || 0) - Number(blocked.charged_amount || 0)),
          } : null,
        };
      }),
    });
  } catch (error) {
    return jsonError(error, "Inboxul nu a putut fi încărcat.");
  }
}
