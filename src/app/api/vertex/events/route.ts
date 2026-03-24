export const dynamic = 'force-dynamic';
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const vtx = createClient(
  process.env.NEXT_PUBLIC_VERTEX_SUPABASE_URL!,
  process.env.VERTEX_SUPABASE_SERVICE_KEY!
);

const main = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: Fetch events. ?phone=X → for a client. No phone → ALL events (for events board). ?status=X to filter.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get("phone");
  const status = searchParams.get("status") || "active";

  try {
    // 1. Fetch from Vertex Supabase (Legacy/Vertex-specific)
    let vtxQuery = vtx.from("client_events").select("*");
    if (phone) vtxQuery = vtxQuery.eq("client_phone", phone);
    if (status !== "all") vtxQuery = vtxQuery.eq("status", status);
    
    // 2. Fetch from Main Supabase (New AI Agent drafts)
    // Map status 'active' to include 'draft' for the AI table
    let mainQuery = main.from("ai_client_events").select("event_id, status_eveniment, servicii_cerute, buget_estimat, notes, event_status, created_at, data_evenimentului, ora_evenimentului, localitate, clients(real_phone_e164)");
    if (status !== "all") {
        if (status === 'active') {
            mainQuery = mainQuery.in("status", ["active", "draft"]);
        } else {
            mainQuery = mainQuery.eq("status", status);
        }
    }

    const [vtxRes, mainRes] = await Promise.all([
      vtxQuery.order("created_at", { ascending: false }),
      mainQuery.order("created_at", { ascending: false })
    ]);

    if (vtxRes.error) throw vtxRes.error;
    if (mainRes.error) throw mainRes.error;

    // 3. Normalize and merge
    const normalizedMain = (mainRes.data || []).map((ev: any) => {
        const services = (ev.servicii_cerute as Record<string, Record<string, any>>) || {};
        const firstService = Object.values(services)[0] || {};
        return {
            id: ev.event_id || ev.id,
            client_phone: (ev.clients as any)?.real_phone_e164 || phone || "Unknown",
            role_title: firstService.role_title || "Serviciu AI",
            event_details: {
                ...firstService,
                date: ev.data_evenimentului,
                time: ev.ora_evenimentului,
                location: ev.localitate
            },
            total_amount: ev.buget_estimat || 0,
            notes: ev.notes || "",
            status: ev.status_eveniment || ev.status || "draft",
            event_status: ev.event_status || "new",
            created_at: ev.created_at,
            source: 'main_supabase'
        };
    });

    const merged = [...(vtxRes.data || []), ...normalizedMain].sort((a,b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return NextResponse.json({ events: merged });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
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

async function updateMainEvent(id: string, update: Record<string, any>, event_details?: any) {
  const mainUpdate: Record<string, any> = { ...update };
  
  if (event_details) {
    const { data: existing } = await main.from("ai_client_events").select("servicii_cerute").eq("id", id).single();
    if (existing) {
      const services = (existing.servicii_cerute as Record<string, any>) || {};
      const slotId = Object.keys(services)[0] || 'SLOT_001';
      services[slotId] = { ...services[slotId], ...event_details };
      mainUpdate.servicii_cerute = services;
    }
  }

  return main.from("ai_client_events").update(mainUpdate).eq("id", id).select().single();
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
    if (status === 'cancelled' || status === 'trashed') update.event_status = 'new';
  }
  if (assigned_animator !== undefined) update.assigned_animator = assigned_animator;
  if (assigned_prep !== undefined) update.assigned_prep = assigned_prep;
  if (event_status !== undefined) update.event_status = event_status;

  // 1. Try Vertex database first
  const { data, error } = await vtx.from("client_events").update(update).eq("id", id).select().single();
  if (!error && data) return NextResponse.json({ event: data });

  // 2. Fallback to Main database (AI Schema)
  const mainUpdate: Record<string, any> = { updated_at: new Date().toISOString() };
  if (total_amount !== undefined) mainUpdate.buget_estimat = total_amount;
  if (status !== undefined) mainUpdate.status_eveniment = status;
  if (event_status !== undefined) mainUpdate.event_status = event_status;
  if (notes !== undefined) mainUpdate.notes = notes;

  const { data: mainData, error: mainErr } = await updateMainEvent(id, mainUpdate, event_details);

  if (mainErr) return NextResponse.json({ error: mainErr.message }, { status: 500 });
  return NextResponse.json({ event: mainData });
}

// DELETE: Permanent delete (only from trash — admin only)
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Try Vertex first
  const { data: existingVtx } = await vtx.from("client_events").select("status").eq("id", id).single();
  if (existingVtx) {
      if (existingVtx.status !== "trashed") {
        return NextResponse.json({ error: "Doar evenimentele din coșul de gunoi pot fi șterse permanent" }, { status: 403 });
      }
      const { error } = await vtx.from("client_events").delete().eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
  }

  // Try Main
  const { data: existingMain } = await main.from("ai_client_events").select("status_eveniment").eq("event_id", id).single();
  if (existingMain) {
      if (existingMain.status_eveniment !== "trashed") {
        return NextResponse.json({ error: "Doar evenimentele din coșul de gunoi pot fi șterse permanent" }, { status: 403 });
      }
      const { error } = await main.from("ai_client_events").delete().eq("event_id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Evenimentul nu a fost găsit" }, { status: 404 });
}
