import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
  try {
    const testPhone = "+40737223155";
    const testData = {
      phone_number: testPhone,
      alias: "Test Animator",
      template_key: "animator",
      extracted_data: {
        "data_evenimentului": "20 Iulie 2026",
        "ora": "15:00",
        "locatia": "Bucuresti, Sector 1",
        "personaj": "Spiderman",
        "nume_copil": "Alex",
        "varsta_copiilor": "5 ani",
        "numar_copii": "10-12 copii",
        "metoda_plata": "Cash la final"
      },
      updated_at: new Date().toISOString()
    };

    const { data: insertData, error: insertErr } = await supabase
      .from('ai_client_notebooks')
      .upsert(testData, { onConflict: 'phone_number' })
      .select();

    return NextResponse.json({ testData: insertData, error: insertErr });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
