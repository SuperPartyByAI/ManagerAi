import { jsonError, requireSuperPartyUser, SUPERPARTY_SLUG } from "@/lib/superparty/server";

export const dynamic = "force-dynamic";

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isOperationalEvent(event: Record<string, unknown>) {
  const searchable = [event.title, event.client_alias, event.location_text, JSON.stringify(event.services || {})]
    .map((value) => String(value || ""))
    .join(" ");
  return !/(^|[^a-z0-9])(e2e|test|tester|audit|dummy|seed|smoke)([^a-z0-9]|$)/i.test(searchable);
}

export async function GET(request: Request) {
  try {
    const auth = await requireSuperPartyUser(request);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const source = url.searchParams.get("source") || "event";

    if (id) {
      const { data, error } = await auth.scoped.rpc("get_superparty_event_detail", {
        p_record_id: id,
        p_source_kind: source,
        p_platform_slug: SUPERPARTY_SLUG,
      });
      if (error) throw error;
      return Response.json({ event: data });
    }

    const limit = Math.min(Math.max(numberParam(url.searchParams.get("limit"), 150), 1), 250);
    const offset = Math.max(numberParam(url.searchParams.get("offset"), 0), 0);
    const { data, error } = await auth.scoped.rpc("get_superparty_event_cards", {
      p_platform_slug: SUPERPARTY_SLUG,
      p_period: url.searchParams.get("period") || "all",
      p_status: url.searchParams.get("status") || null,
      p_from: url.searchParams.get("from") || null,
      p_to: url.searchParams.get("to") || null,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw error;

    const events = ((data || []) as Array<Record<string, unknown>>).filter(isOperationalEvent);
    const counters = events.reduce((acc: Record<string, number>, event: Record<string, unknown>) => {
      const bucket = String(event.period_bucket || "unscheduled");
      acc[bucket] = (acc[bucket] || 0) + 1;
      if (event.needs_attention) acc.attention = (acc.attention || 0) + 1;
      if (event.access_status === "blocked") acc.blocked = (acc.blocked || 0) + 1;
      return acc;
    }, { past: 0, today: 0, future: 0, unscheduled: 0, attention: 0, blocked: 0 });

    return Response.json({ events, counters, pagination: { limit, offset, hasMore: events.length === limit } });
  } catch (error) {
    return jsonError(error, "Evenimentele nu au putut fi încărcate.");
  }
}
