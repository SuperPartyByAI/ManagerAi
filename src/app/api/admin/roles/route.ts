import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
);

export async function GET(req: NextRequest) {
  try {
    const brand = req.nextUrl.searchParams.get("brand") || "GLOBAL";
    const { data, error } = await supabase
      .from("ai_knowledge_base")
      .select("*")
      .eq("brand_identifier", brand)
      .or('category.eq.rol,knowledge_key.ilike.role_%')
      .order("created_at", { ascending: false });

    if (error) throw error;
    
    // Mapăm formatul structural la formatul dorit de vizual
    const sources = data?.map(kb => ({
       id: kb.id,
       title: kb.answer_template?.split('\n')[0] || kb.knowledge_key,
       content: kb.answer_template || '',
       category: kb.category,
       brand_identifier: kb.brand_identifier || brand,
       is_active: kb.active,
       policy_config: kb.policy_config || {}
    })) || [];
    
    return NextResponse.json({ sources });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, title, policy_config, is_active } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (policy_config !== undefined) updates.policy_config = policy_config;
    if (is_active !== undefined) updates.active = is_active;
    
    // Titlul simbolic: actualizat pe prima linie din answer_template
    if (title) {
      const existing = await supabase.from("ai_knowledge_base").select("answer_template").eq("id", id).single();
      const oldTemplate = existing.data?.answer_template || "";
      const otherLines = oldTemplate.split("\n").slice(1).join("\n");
      updates.answer_template = otherLines ? `${title}\n${otherLines}` : title;
    }

    const { error } = await supabase.from("ai_knowledge_base").update(updates).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title, policy_config, brand } = await req.json();
    const knowledge_key = 'role_' + title.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    const payload = {
        knowledge_key: knowledge_key,
        category: 'rol',
        answer_template: title,
        brand_identifier: brand || "GLOBAL",
        policy_config: policy_config,
        active: true,
        approval_status: 'approved'
    };

    const { data, error } = await supabase.from("ai_knowledge_base").insert(payload).select().single();
    if (error) throw error;
    
    return NextResponse.json({ source: {
        id: data.id, title: data.answer_template, is_active: data.active, policy_config: data.policy_config
    } });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { error } = await supabase.from("ai_knowledge_base").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
