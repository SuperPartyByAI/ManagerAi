import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Main Supabase (where whatsapp_sessions live)
const mainSupa = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: list all WhatsApp brands/sessions
export async function GET() {
  try {
    const { data, error } = await mainSupa
      .from("whatsapp_sessions")
      .select("session_key, label, brand_key, phone_number, status")
      .eq("status", "CONNECTED")
      .order("label");

    if (error) throw error;

    return NextResponse.json({
      brands: (data || []).map((s) => ({
        session_key: s.session_key,
        label: s.label,
        brand_key: s.brand_key || s.label?.toUpperCase() || "UNKNOWN",
        phone_number: s.phone_number,
        status: s.status,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
