import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const SUPERPARTY_SLUG = "wowparty";
export const GM_EMAILS = new Set([
  "superpartybyai@gmail.com",
  "ursache.andrei1995@gmail.com",
]);

export class SuperPartyApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "SuperPartyApiError";
  }
}

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL_V2 || process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_V2;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new SuperPartyApiError("Configurarea Supabase este incompletă.", 500);
  }
  return { url, anon, service };
}

export function adminClient() {
  const { url, service } = env();
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function scopedClient(token: string) {
  const { url, anon } = env();
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function bearer(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function cookieIdentity() {
  const { url, anon } = env();
  const cookieStore = await cookies();
  const client = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // A read-only route may not be allowed to refresh cookies. Middleware handles it.
        }
      },
    },
  });
  const { data: sessionData } = await client.auth.getSession();
  const token = sessionData.session?.access_token || "";
  if (!token) return null;
  const { data: userData, error } = await client.auth.getUser(token);
  if (error || !userData.user) return null;
  return { token, user: userData.user };
}

export type SuperPartyAuth = {
  user: User;
  token: string;
  admin: SupabaseClient;
  scoped: SupabaseClient;
  platformId: string;
  isGm: boolean;
  accessLevel: string;
};

export async function requireSuperPartyUser(request: Request): Promise<SuperPartyAuth> {
  const admin = adminClient();
  let token = bearer(request);
  let user: User | null = null;
  if (token) {
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (!authError) user = authData.user;
  } else {
    const identity = await cookieIdentity();
    token = identity?.token || "";
    user = identity?.user || null;
  }
  if (!token || !user) throw new SuperPartyApiError("Sesiunea a expirat. Autentifică-te din nou.", 401);
  const email = String(user.email || "").toLocaleLowerCase("ro-RO");
  const isGm = GM_EMAILS.has(email);
  const { data: platform, error: platformError } = await admin
    .from("platforms")
    .select("id")
    .ilike("slug", SUPERPARTY_SLUG)
    .maybeSingle();
  if (platformError || !platform?.id) throw new SuperPartyApiError("Platforma WowParty nu este configurată.", 500);

  const { data: membership, error: membershipError } = await admin
    .from("platform_users")
    .select("access_level, status")
    .eq("platform_id", platform.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) throw new SuperPartyApiError("Nu s-a putut verifica accesul în echipă.", 500);
  if (!isGm && (!membership || membership.status !== "active")) {
    throw new SuperPartyApiError("Contul nu are acces activ la WowParty.", 403);
  }

  return {
    user,
    token,
    admin,
    scoped: scopedClient(token),
    platformId: String(platform.id),
    isGm,
    accessLevel: isGm ? "owner" : String(membership?.access_level || "member"),
  };
}

export function canManageTeam(auth: SuperPartyAuth) {
  return auth.isGm || ["owner", "admin", "manager"].includes(auth.accessLevel.toLowerCase());
}

export function maskSensitiveText(value: unknown) {
  const text = String(value ?? "");
  return text
    .replace(/(?:(?:\+|00)?40[\s.-]*|0[\s.-]*)?7(?:[\s.-]*\d){8}\b/g, "[NUMĂR ASCUNS]")
    .replace(/\b(?:\d[\s.-]*){10,15}\b/g, "[CONTACT ASCUNS]");
}

export function jsonError(error: unknown, fallback: string) {
  if (error instanceof SuperPartyApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(`[superparty] ${fallback}`, error);
  return Response.json({ error: fallback }, { status: 500 });
}
