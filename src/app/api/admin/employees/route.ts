import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const vtx = createClient(
  process.env.NEXT_PUBLIC_VERTEX_SUPABASE_URL!,
  process.env.VERTEX_SUPABASE_SERVICE_KEY!
);

// GET: List employees with optional status filter
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "all";

  let query = vtx.from("employee_profiles").select("*");
  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ employees: data });
}

// PUT: Approve or reject employee
export async function PUT(req: Request) {
  const body = await req.json();
  const { id, action, rejection_reason } = body;

  if (!id || !action) {
    return NextResponse.json({ error: "id and action required" }, { status: 400 });
  }

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    status: action === "approve" ? "approved" : "rejected",
    approved_at: new Date().toISOString(),
    approved_by: "admin",
  };

  if (action === "reject" && rejection_reason) {
    update.rejection_reason = rejection_reason;
  }

  const { data, error } = await vtx
    .from("employee_profiles")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ employee: data });
}
