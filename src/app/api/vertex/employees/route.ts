import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const vtx = createClient(
  process.env.NEXT_PUBLIC_VERTEX_SUPABASE_URL!,
  process.env.VERTEX_SUPABASE_SERVICE_KEY!
);

export async function GET() {
  const { data, error } = await vtx
    .from("employees")
    .select("*")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ employees: data });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { name, email, phone, brand_keys, permissions } = body;
  if (!name || !email) {
    return NextResponse.json({ error: "name, email required" }, { status: 400 });
  }

  const { data, error } = await vtx
    .from("employees")
    .insert({
      name, email,
      phone: phone || "",
      brand_keys: brand_keys || [],
      permissions: permissions || { read_chats: true, reply: false, see_prices: false, manage_events: false },
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ employee: data });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data, error } = await vtx
    .from("employees")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ employee: data });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await vtx.from("employees").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
