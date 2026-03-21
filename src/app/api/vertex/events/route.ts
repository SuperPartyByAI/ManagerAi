export const dynamic = 'force-dynamic';
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const vtx = createClient(
  process.env.NEXT_PUBLIC_VERTEX_SUPABASE_URL!,
  process.env.VERTEX_SUPABASE_SERVICE_KEY!
);

// GET: Fetch events. ?phone=X → for a client. No phone → ALL events (for events board). ?status=X to filter.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get("phone");
  const status = searchParams.get("status") || "active";

  let query = vtx.from("client_events").select("*");

  if (phone) {
    query = query.eq("client_phone", phone);
  }

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data });
}


// POST: Create new event (always active)
export async function POST(req: Request) {
  const body = await req.json();
  const { client_phone, role_title, event_details, total_amount, notes } = body;
  if (!client_phone || !role_title) {
    return NextResponse.json({ error: "client_phone and role_title required" }, { status: 400 });
  }

  const { data, error } = await vtx
    .from("client_events")
    .insert({
      client_phone, role_title,
      event_details: event_details || {},
      total_amount: total_amount || 0,
      notes: notes || "",
      status: "active",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data });
}

// PUT: Update event details, status, or assignments
export async function PUT(req: Request) {
  const body = await req.json();
  const { id, event_details, total_amount, notes, status, assigned_animator, assigned_prep, event_status } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (event_details !== undefined) update.event_details = event_details;
  if (total_amount !== undefined) update.total_amount = total_amount;
  if (notes !== undefined) update.notes = notes;
  if (status !== undefined) {
    update.status = status;
    if (status === 'cancelled' || status === 'trashed') {
      update.event_status = 'new';
    }
  }
  if (assigned_animator !== undefined) update.assigned_animator = assigned_animator;
  if (assigned_prep !== undefined) update.assigned_prep = assigned_prep;
  if (event_status !== undefined) update.event_status = event_status;


  const { data, error } = await vtx
    .from("client_events")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data });
}

// DELETE: Permanent delete (only from trash — admin only)
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Only allow permanent delete if event is already trashed
  const { data: existing } = await vtx.from("client_events").select("status").eq("id", id).single();
  if (existing?.status !== "trashed") {
    return NextResponse.json({ error: "Doar evenimentele din coșul de gunoi pot fi șterse permanent" }, { status: 403 });
  }

  const { error } = await vtx.from("client_events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
