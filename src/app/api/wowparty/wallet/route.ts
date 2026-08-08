import { jsonError, requireSuperPartyUser, SuperPartyApiError, SUPERPARTY_SLUG } from "@/lib/superparty/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireSuperPartyUser(request);
    const { data, error } = await auth.scoped.rpc("get_superparty_wallet_summary", { p_platform_slug: SUPERPARTY_SLUG });
    if (error) throw error;
    return Response.json({ wallet: data });
  } catch (error) {
    return jsonError(error, "Soldul nu a putut fi încărcat.");
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireSuperPartyUser(request);
    if (!auth.isGm) throw new SuperPartyApiError("Alimentarea manuală este disponibilă doar GM; plata online va fi conectată separat.", 403);
    const body = await request.json();
    const amount = Math.round(Number(body?.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
      throw new SuperPartyApiError("Suma trebuie să fie între 0,01 și 100.000 lei.", 400);
    }
    const targetEventId = typeof body?.targetEventId === "string" ? body.targetEventId : null;
    const { data, error } = await auth.scoped.rpc("gm_credit_platform_wallet", {
      p_platform_id: auth.platformId,
      p_amount: amount,
      p_external_reference: typeof body?.externalReference === "string" ? body.externalReference.slice(0, 120) : null,
      p_note: typeof body?.note === "string" ? body.note.slice(0, 240) : "Alimentare manuală GM",
      p_target_event_id: targetEventId,
      p_idempotency_key: crypto.randomUUID(),
    });
    if (error) throw error;
    return Response.json({ success: true, wallet: data });
  } catch (error) {
    return jsonError(error, "Soldul nu a putut fi alimentat.");
  }
}
