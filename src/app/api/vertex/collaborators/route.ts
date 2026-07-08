import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

function getVtx() {
  return createClient(
    process.env.NEXT_PUBLIC_VERTEX_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.VERTEX_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'fake-key'
  );
}

export async function GET() {
  const vtx = getVtx();
  const { data, error } = await vtx
    .from("collaborators")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ collaborators: data });
}

export async function POST(req: Request) {
  const vtx = getVtx();
  const body = await req.json();
  const { name, phone, brand_key, contact_person, default_location, packages, notes } = body;
  if (!name || !phone || !brand_key) {
    return NextResponse.json({ error: "name, phone, brand_key required" }, { status: 400 });
  }

  const { data, error } = await vtx
    .from("collaborators")
    .insert({
      name, phone, brand_key,
      contact_person: contact_person || "",
      default_location: default_location || "",
      packages: packages || [],
      notes: notes || "",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ collaborator: data });
}

export async function PUT(req: Request) {
  const vtx = getVtx();
  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data, error } = await vtx
    .from("collaborators")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ collaborator: data });
}

export async function DELETE(req: Request) {
  const vtx = getVtx();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await vtx.from("collaborators").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
