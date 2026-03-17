import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const vtxSupa = createClient(
  process.env.NEXT_PUBLIC_VERTEX_SUPABASE_URL!,
  process.env.VERTEX_SUPABASE_SERVICE_KEY!
);

// GET: fetch config (filtered by brand_key)
export async function GET(req: NextRequest) {
  try {
    const brand = req.nextUrl.searchParams.get("brand") || "GLOBAL";

    const { data, error } = await vtxSupa
      .from("vertex_config")
      .select("*")
      .eq("brand_key", brand);

    if (error) throw error;
    return NextResponse.json({ config: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT: upsert config key (with brand_key)
export async function PUT(req: NextRequest) {
  try {
    const { key, value, brand } = await req.json();
    if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

    const brandKey = brand || "GLOBAL";

    // Check if exists
    const { data: existing } = await vtxSupa
      .from("vertex_config")
      .select("id")
      .eq("config_key", key)
      .eq("brand_key", brandKey)
      .maybeSingle();

    if (existing) {
      const { error } = await vtxSupa
        .from("vertex_config")
        .update({ config_value: value })
        .eq("config_key", key)
        .eq("brand_key", brandKey);
      if (error) throw error;
    } else {
      const { error } = await vtxSupa
        .from("vertex_config")
        .insert({ config_key: key, config_value: value, brand_key: brandKey });
      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
