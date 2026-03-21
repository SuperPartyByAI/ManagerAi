import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/universparty/wa-web-launcher/superparty-manager-ai/.env.local' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("=== MESSAGES TABLE ===");
  const { data: messages } = await supabase
    .from('messages')
    .select('conversation_id, sender_type, content, direction, created_at')
    .ilike('content', '%Imediat verificam%')
    .limit(5);
  console.dir(messages, { depth: null });
  
  if (messages && messages.length > 0) {
      const convId = '84530ba4-f896-4583-a656-0becf3785a5a';
      console.log(`\n=== CONV ${convId} FULL MESSAGES ===`);
      const { data: full } = await supabase
          .from('messages')
          .select('sender_type, content, created_at')
          .eq('conversation_id', convId)
          .order('created_at', { ascending: true })
          .limit(10);
      console.dir(full, { depth: null });
          
      console.log(`\n=== CONV ${convId} AI TRAINING MESSAGES ===`);
      const { data: shadow } = await supabase
          .from('ai_training_messages')
          .select('sender_type, content, created_at')
          .eq('conversation_id', convId)
          .order('created_at', { ascending: true })
          .limit(10);
      console.dir(shadow, { depth: null });
  }
}

run();
