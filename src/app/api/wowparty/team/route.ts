import { canManageTeam, GM_EMAILS, jsonError, requireSuperPartyUser, SuperPartyApiError } from "@/lib/superparty/server";

export const dynamic = "force-dynamic";
const TEST_ACCOUNT_RE = /(test|auditor|robot|proof|upsert|agent_test|brand_test)/i;

async function listTeam(auth: Awaited<ReturnType<typeof requireSuperPartyUser>>) {
  const { data: memberships, error } = await auth.admin
    .from("platform_users")
    .select("user_id, access_level, status")
    .eq("platform_id", auth.platformId);
  if (error) throw error;
  const ids = (memberships || []).map((row) => row.user_id).filter(Boolean);
  const { data: profiles, error: profileError } = ids.length
    ? await auth.admin.from("profiles").select("id, full_name, email, role, avatar_url, is_active, status, brand").in("id", ids)
    : { data: [], error: null };
  if (profileError) throw profileError;
  const membershipByUser = new Map((memberships || []).map((row) => [String(row.user_id), row]));
  const team = (profiles || [])
    .filter((profile) => {
      const email = String(profile.email || "");
      return !TEST_ACCOUNT_RE.test(email) && (String(profile.brand || "").toLowerCase() === "wowparty" || GM_EMAILS.has(email.toLowerCase()));
    })
    .map((profile) => {
      const membership = membershipByUser.get(String(profile.id));
      return {
        id: profile.id,
        name: profile.full_name || "Membru echipă",
        email: profile.email || "",
        avatarUrl: profile.avatar_url,
        accessLevel: membership?.access_level || (GM_EMAILS.has(String(profile.email || "").toLowerCase()) ? "owner" : "member"),
        membershipStatus: membership?.status || "inactive",
        profileStatus: profile.status,
        isActive: profile.is_active !== false,
        isGm: GM_EMAILS.has(String(profile.email || "").toLowerCase()),
      };
    })
    .sort((a, b) => Number(b.isGm) - Number(a.isGm) || a.name.localeCompare(b.name, "ro"));
  return { team, canManage: canManageTeam(auth), isGm: auth.isGm };
}

export async function GET(request: Request) {
  try {
    const auth = await requireSuperPartyUser(request);
    return Response.json(await listTeam(auth));
  } catch (error) {
    return jsonError(error, "Echipa nu a putut fi încărcată.");
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireSuperPartyUser(request);
    if (!canManageTeam(auth)) throw new SuperPartyApiError("Doar administratorii echipei pot trimite invitații.", 403);
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const name = String(body?.name || "").trim().slice(0, 120);
    const accessLevel = String(body?.accessLevel || "member").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SuperPartyApiError("Adresa de email nu este validă.", 400);
    if (!name) throw new SuperPartyApiError("Numele este obligatoriu.", 400);
    if (!["manager", "operator", "collaborator", "member"].includes(accessLevel)) throw new SuperPartyApiError("Rolul ales nu este valid.", 400);

    const profileResult = await auth.admin.from("profiles").select("id").ilike("email", email).maybeSingle();
    let profile = profileResult.data;
    const profileError = profileResult.error;
    if (profileError) throw profileError;
    let invited = false;
    if (!profile?.id) {
      const redirectTo = `${new URL(request.url).origin}/wowparty`;
      const { data, error } = await auth.admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { full_name: name, brand: "wowparty", invited_by: auth.user.id },
      });
      if (error || !data.user) throw error || new Error("Invitația nu a creat utilizatorul.");
      profile = { id: data.user.id };
      invited = true;
      await auth.admin.from("profiles").upsert({ id: data.user.id, full_name: name, email, brand: "wowparty" }, { onConflict: "id" });
    }

    const { data: existing, error: existingError } = await auth.admin.from("platform_users").select("id").eq("platform_id", auth.platformId).eq("user_id", profile.id).maybeSingle();
    if (existingError) throw existingError;
    const membershipWrite = existing
      ? auth.admin.from("platform_users").update({ access_level: accessLevel, status: "active" }).eq("id", existing.id)
      : auth.admin.from("platform_users").insert({ platform_id: auth.platformId, user_id: profile.id, access_level: accessLevel, status: "active" });
    const { error: membershipError } = await membershipWrite;
    if (membershipError) throw membershipError;

    return Response.json({ success: true, invited, ...(await listTeam(auth)) });
  } catch (error) {
    return jsonError(error, "Invitația nu a putut fi trimisă.");
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireSuperPartyUser(request);
    if (!canManageTeam(auth)) throw new SuperPartyApiError("Doar administratorii echipei pot modifica accesul.", 403);
    const body = await request.json();
    const userId = String(body?.userId || "");
    if (!userId) throw new SuperPartyApiError("Membrul este obligatoriu.", 400);
    const { data: targetProfile } = await auth.admin.from("profiles").select("email").eq("id", userId).maybeSingle();
    if (GM_EMAILS.has(String(targetProfile?.email || "").toLowerCase()) && !auth.isGm) {
      throw new SuperPartyApiError("Conturile GM pot fi modificate doar de un GM.", 403);
    }
    const updates: Record<string, string> = {};
    if (typeof body?.status === "string" && ["active", "suspended", "pending"].includes(body.status)) updates.status = body.status;
    if (typeof body?.accessLevel === "string" && ["owner", "manager", "operator", "collaborator", "member"].includes(body.accessLevel)) updates.access_level = body.accessLevel;
    if (!Object.keys(updates).length) throw new SuperPartyApiError("Nu există modificări valide.", 400);
    const { error } = await auth.admin.from("platform_users").update(updates).eq("platform_id", auth.platformId).eq("user_id", userId);
    if (error) throw error;
    return Response.json({ success: true, ...(await listTeam(auth)) });
  } catch (error) {
    return jsonError(error, "Accesul membrului nu a putut fi actualizat.");
  }
}
