import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_V2 || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_V2 || '';

export const supabaseV2 = createClient(supabaseUrl, supabaseKey);
