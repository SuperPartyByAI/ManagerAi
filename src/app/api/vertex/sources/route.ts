import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const vtxSupa = createClient(
  process.env.NEXT_PUBLIC_VERTEX_SUPABASE_URL!,
  process.env.VERTEX_SUPABASE_SERVICE_KEY!
);

// GET: fetch sources (filtered by brand_key)
export async function GET(req: NextRequest) {
  try {
    const brand = req.nextUrl.searchParams.get("brand") || "GLOBAL";

    const { data, error } = await vtxSupa
      .from("vertex_sources")
      .select("*")
      .eq("brand_key", brand)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ sources: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: create a new source (with brand_key)
export async function POST(req: NextRequest) {
  try {
    const { title, content, category, brand } = await req.json();
    if (!title || !content) return NextResponse.json({ error: "title and content required" }, { status: 400 });

    const { data, error } = await vtxSupa
      .from("vertex_sources")
      .insert({
        title,
        content,
        category: category || "general",
        brand_key: brand || "GLOBAL",
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ source: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT: update a source
export async function PUT(req: NextRequest) {
  try {
    const { id, title, content, category, is_active } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (category !== undefined) updates.category = category;
    if (is_active !== undefined) updates.is_active = is_active;

    const { error } = await vtxSupa
      .from("vertex_sources")
      .update(updates)
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: remove a source
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await vtxSupa
      .from("vertex_sources")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
