import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
  
  try {
    let notebooks = [];
    const { data, error } = await supabase.from('ai_client_notebooks')
      .select('*, template:ai_notebook_templates(json_schema)')
      .order('updated_at', { ascending: false })
      .limit(50);
      
    if (error) {
      console.warn("Notebooks table not found. Falling back to ai_client_profiles...", error.message);
      
      const { data: clients } = await supabase.from('ai_client_profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
        
      notebooks = (clients || []).map(c => ({
         phone_number: c.telefon_e164 || c.nume_client || c.client_id,
         template_key: 'fallback_live_feed',
         extracted_data: {}
      }));
    } else {
      notebooks = data || [];
    }
    
    return NextResponse.json({ notebooks });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
