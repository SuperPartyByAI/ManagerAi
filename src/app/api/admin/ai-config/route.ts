import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const vertexDb = createClient(
  process.env.VERTEX_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.VERTEX_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const [goals, followups, playbook, vertexData] = await Promise.all([
    supabase.from('ai_goal_strategies').select('*').order('goal_key'),
    supabase.from('ai_followup_templates').select('*').order('delay_hours'),
    supabase.from('sales_playbooks').select('*').order('key'),
    vertexDb.from('vertex_config').select('*').eq('brand_key', 'GLOBAL')
  ]);

  const corePrompts = vertexData.data?.filter(c => c.config_key.startsWith('prompt_')) || [];

  return NextResponse.json({
    goals: goals.data || [],
    followups: followups.data || [],
    playbook: playbook.data || [],
    corePrompts: corePrompts,
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { table, key_field, key_value, updates } = body;

  const allowed = ['ai_goal_strategies', 'ai_followup_templates', 'sales_playbooks', 'vertex_config'];
  if (!allowed.includes(table)) {
    return NextResponse.json({ error: 'Table not allowed' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = table === 'vertex_config' ? (vertexDb as any) : (supabase as any);
  
  const updatePayload = table === 'vertex_config' 
    ? { ...updates } // vertex_config might not have updated_at
    : { ...updates, updated_at: new Date().toISOString() };

  // For vertex_config, ensure brand_key='GLOBAL' logic if brand_key is not the key_field
  let query = sb.from(table).update(updatePayload).eq(key_field, key_value);
  if (table === 'vertex_config') {
      query = query.eq('brand_key', 'GLOBAL');
  }

  const { error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
