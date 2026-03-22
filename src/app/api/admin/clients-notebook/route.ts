import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Forțează redare dinamică — nu cachează niciodată
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: toți clienții cu notebook-urile lor
export async function GET() {
  const { data, error } = await supabase
    .from("client_notebooks_v2")
    .select("*")
    .order("summary_updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

// PUT: actualizează clean_notebook pentru un client
export async function PUT(req: Request) {
  const body = await req.json();
  const { phone_number, wa_number, clean_notebook } = body;

  if (!phone_number || !wa_number) {
    return NextResponse.json({ error: "phone_number și wa_number sunt obligatorii" }, { status: 400 });
  }

  const { error } = await supabase
    .from("client_notebooks_v2")
    .upsert({
      phone_number,
      wa_number,
      clean_notebook,
      summary_updated_at: new Date().toISOString(),
    }, { onConflict: "phone_number,wa_number" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE: șterge notebook-ul unui client
export async function DELETE(req: Request) {
  const { phone_number, wa_number } = await req.json();
  const { error } = await supabase
    .from("client_notebooks_v2")
    .delete()
    .eq("phone_number", phone_number)
    .eq("wa_number", wa_number);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
