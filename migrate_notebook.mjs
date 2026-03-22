// verificare si migrare directa via Supabase REST
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jrfhprnuxxfwkwjwdsez.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyZmhwcm51eHhmd2t3andkc2V6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzAwMjIzMiwiZXhwIjoyMDg4NTc4MjMyfQ.0SoUFRVD3PyQg45QKvBM0yDoGJMNrsV-1KyGX0TA4yI";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Verifică dacă coloanele există deja
const { data: testData, error: testError } = await supabase
  .from("ai_client_notebooks")
  .select("id, phone_number, wa_number, clean_notebook")
  .limit(1);

if (!testError) {
  console.log("✅ Coloanele wa_number și clean_notebook EXISTĂ deja!");
  console.log("Coloane disponibile:", Object.keys(testData?.[0] || {}).join(", "));
} else if (testError.message.includes("wa_number") || testError.message.includes("clean_notebook")) {
  console.log("❌ Coloanele NU există:", testError.message);
  console.log("\nRulați MANUAL în Supabase SQL Editor (https://supabase.com/dashboard/project/jrfhprnuxxfwkwjwdsez/sql):\n");
  console.log(`
ALTER TABLE ai_client_notebooks ADD COLUMN IF NOT EXISTS wa_number TEXT;
ALTER TABLE ai_client_notebooks ADD COLUMN IF NOT EXISTS clean_notebook JSONB DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS idx_notebooks_phone_wa 
  ON ai_client_notebooks(phone_number, wa_number) 
  WHERE wa_number IS NOT NULL;
  `.trim());
} else {
  // Eroare diferita - poate coloana exista dar alt error
  console.log("Eroare test:", testError.message);
  // Fallback: verificam coloanele via information_schema
  const { data: cols } = await supabase.rpc('get_columns', { table_name: 'ai_client_notebooks' }).catch(() => ({ data: null }));
  console.log("Columns via RPC:", cols);
}

// Verificare suplimentara: citim fara filtre coloane specifice
const { data: all, error: allErr } = await supabase
  .from("ai_client_notebooks")
  .select("*")
  .limit(2);
if (!allErr && all?.length > 0) {
  console.log("\nColoane reale în tabel:", Object.keys(all[0]).join(", "));
  console.log("has wa_number:", 'wa_number' in all[0]);
  console.log("has clean_notebook:", 'clean_notebook' in all[0]);
}
