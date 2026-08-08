import { jsonError, requireSuperPartyUser, SuperPartyApiError } from "@/lib/superparty/server";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clientAlias(client: { id: unknown; public_alias?: unknown; client_alias?: unknown; alias_index?: unknown }) {
  const raw = String(client.public_alias || client.client_alias || "").trim();
  const fallback = `WowParty ${client.alias_index || String(client.id).slice(0, 4).toUpperCase()}`;
  if (!raw || /@(?:s\.)?whatsapp\.net/i.test(raw) || /^\+?\d{10,}(?:[\s_-]|$)/.test(raw)) return fallback;
  return raw;
}

function isOperationalClient(alias: string) {
  return !/(^|[\s_-])(e2e|test|tester|audit|auditor|dummy|robot|proof|seed|smoke|upsert)([\s_-]|$)/i.test(alias);
}

async function commissionClients(auth: Awaited<ReturnType<typeof requireSuperPartyUser>>) {
  const [{ data: taggedClients, error: clientError }, { data: overrides, error: overrideError }, { data: setting, error: settingError }, { data: events, error: eventsError }, { data: bookings, error: bookingError }] = await Promise.all([
    auth.admin.from("clients").select("id, public_alias, client_alias, alias_index, created_at").or("brand_key.eq.wowparty,brand.eq.wowparty").order("updated_at", { ascending: false }).limit(500),
    auth.admin.from("client_commission_overrides").select("client_id, commission_rate, reason, updated_at"),
    auth.admin.from("commission_settings").select("default_rate").eq("id", 1).maybeSingle(),
    auth.admin.from("events").select("client_id, price_agreed, budget_estimate").eq("business_id", "wowparty").eq("is_test", false),
    auth.admin.from("bookings").select("source_client_id, final_price").ilike("brand_id", "wowparty").not("source_client_id", "is", null).limit(2000),
  ]);
  const firstError = clientError || overrideError || settingError || eventsError || bookingError;
  if (firstError) throw firstError;
  const activeClientIds = [...new Set([
    ...(events || []).map((event) => String(event.client_id || "")),
    ...(bookings || []).map((booking) => String(booking.source_client_id || "")),
  ].filter(UUID_RE.test.bind(UUID_RE)))];
  const taggedById = new Map((taggedClients || []).map((client) => [String(client.id), client]));
  const missingClientIds = activeClientIds.filter((id) => !taggedById.has(id));
  const { data: activeClients, error: activeClientError } = missingClientIds.length
    ? await auth.admin.from("clients").select("id, public_alias, client_alias, alias_index, created_at").in("id", missingClientIds)
    : { data: [], error: null };
  if (activeClientError) throw activeClientError;
  const clients = [...taggedById.values(), ...(activeClients || [])];
  const defaultRate = Number(setting?.default_rate || 18);
  const overrideByClient = new Map((overrides || []).map((row) => [String(row.client_id), row]));
  const stats = new Map<string, { count: number; total: number }>();
  for (const event of events || []) {
    if (!event.client_id) continue;
    const id = String(event.client_id);
    const current = stats.get(id) || { count: 0, total: 0 };
    current.count += 1;
    current.total += Number(event.price_agreed ?? event.budget_estimate ?? 0);
    stats.set(id, current);
  }
  for (const booking of bookings || []) {
    if (!booking.source_client_id) continue;
    const id = String(booking.source_client_id);
    const current = stats.get(id) || { count: 0, total: 0 };
    current.count += 1;
    current.total += Number(booking.final_price ?? 0);
    stats.set(id, current);
  }
  return {
    defaultRate,
    clients: (clients || []).map((client) => {
      const override = overrideByClient.get(String(client.id));
      const stat = stats.get(String(client.id)) || { count: 0, total: 0 };
      return {
        id: client.id,
        alias: clientAlias(client),
        commissionRate: Number(override?.commission_rate ?? defaultRate),
        isPreferred: Boolean(override),
        reason: override?.reason || "",
        updatedAt: override?.updated_at || null,
        eventCount: stat.count,
        totalValue: stat.total,
      };
    }).filter((client) => isOperationalClient(client.alias)).sort((left, right) => {
      const byActivity = Number(right.eventCount > 0) - Number(left.eventCount > 0);
      if (byActivity) return byActivity;
      if (right.eventCount !== left.eventCount) return right.eventCount - left.eventCount;
      return left.alias.localeCompare(right.alias, "ro");
    }),
  };
}

export async function GET(request: Request) {
  try {
    const auth = await requireSuperPartyUser(request);
    if (!auth.isGm) throw new SuperPartyApiError("Doar GM poate vedea și modifica excepțiile de comision.", 403);
    return Response.json(await commissionClients(auth));
  } catch (error) {
    return jsonError(error, "Comisioanele nu au putut fi încărcate.");
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireSuperPartyUser(request);
    if (!auth.isGm) throw new SuperPartyApiError("Doar GM poate modifica excepțiile de comision.", 403);
    const body = await request.json();
    const clientId = String(body?.clientId || "");
    const action = String(body?.action || "save");
    if (!UUID_RE.test(clientId)) throw new SuperPartyApiError("Client invalid.", 400);

    const { data: client, error: clientError } = await auth.admin.from("clients").select("id, public_alias, client_alias, alias_index, brand_key, brand").eq("id", clientId).maybeSingle();
    if (clientError || !client) throw new SuperPartyApiError("Clientul nu a fost găsit.", 404);
    const isTaggedWowParty = [client.brand_key, client.brand].some((value) => String(value || "").toLowerCase() === "wowparty");
    if (!isTaggedWowParty) {
      const [{ count: eventCount, error: eventLinkError }, { count: bookingCount, error: bookingLinkError }] = await Promise.all([
        auth.admin.from("events").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("business_id", "wowparty").eq("is_test", false),
        auth.admin.from("bookings").select("id", { count: "exact", head: true }).eq("source_client_id", clientId).ilike("brand_id", "wowparty"),
      ]);
      if (eventLinkError || bookingLinkError) throw eventLinkError || bookingLinkError;
      if (!eventCount && !bookingCount) throw new SuperPartyApiError("Clientul nu aparține WowParty.", 404);
    }
    if (!isOperationalClient(clientAlias(client))) throw new SuperPartyApiError("Conturile de test nu pot primi comisioane preferențiale.", 400);

    if (action === "reset") {
      const { error } = await auth.admin.from("client_commission_overrides").delete().eq("client_id", clientId);
      if (error) throw error;
    } else {
      const rate = Math.round(Number(body?.commissionRate) * 100) / 100;
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new SuperPartyApiError("Procentul trebuie să fie între 0 și 100.", 400);
      const { error } = await auth.admin.from("client_commission_overrides").upsert({
        client_id: clientId,
        commission_rate: rate,
        reason: String(body?.reason || "Comision preferențial GM").trim().slice(0, 240),
        created_by: auth.user.id,
        updated_by: auth.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "client_id" });
      if (error) throw error;
    }

    const { data: affectedEvents, error: eventError } = await auth.admin.from("events").select("id, price_agreed").eq("client_id", clientId).eq("business_id", "wowparty").not("price_agreed", "is", null);
    if (eventError) throw eventError;
    for (const event of affectedEvents || []) {
      const { error } = await auth.admin.from("events").update({ price_agreed: event.price_agreed }).eq("id", event.id);
      if (error) throw error;
    }
    return Response.json({ success: true, ...(await commissionClients(auth)) });
  } catch (error) {
    return jsonError(error, "Comisionul nu a putut fi salvat.");
  }
}
