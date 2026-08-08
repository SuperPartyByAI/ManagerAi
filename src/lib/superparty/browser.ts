"use client";

import { createClient } from "@supabase/supabase-js";

let singleton: ReturnType<typeof createClient> | null = null;

export function superPartyBrowserClient() {
  if (singleton) return singleton;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL_V2 || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_V2 || "";
  if (!url || !key) throw new Error("Configurarea publică Supabase lipsește.");
  singleton = createClient(url, key);
  return singleton;
}

export async function superPartyApi(input: RequestInfo | URL, init: RequestInit = {}) {
  const supabase = superPartyBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(input, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || `Cererea a eșuat (${response.status}).`) as Error & { status?: number; payload?: unknown };
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}
