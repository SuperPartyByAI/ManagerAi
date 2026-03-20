import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const [goals, followups, playbook] = await Promise.all([
    supabase.from('ai_goal_strategies').select('*').order('goal_key'),
    supabase.from('ai_followup_templates').select('*').order('delay_hours'),
    supabase.from('sales_playbooks').select('*').order('key'),
  ]);
  return NextResponse.json({
    goals: goals.data || [],
    followups: followups.data || [],
    playbook: playbook.data || [],
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { table, key_field, key_value, updates } = body;

  const allowed = ['ai_goal_strategies', 'ai_followup_templates', 'sales_playbooks'];
  if (!allowed.includes(table)) {
    return NextResponse.json({ error: 'Table not allowed' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { error } = await sb
    .from(table)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq(key_field, key_value);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
