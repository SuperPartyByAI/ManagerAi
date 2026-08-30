-- Speed up the monthly inbound-message scan used by the SuperParty inbox.
-- The production index was built with CREATE INDEX CONCURRENTLY to avoid
-- blocking writes. This idempotent definition keeps future environments in sync.
CREATE INDEX IF NOT EXISTS messages_month_inbound_created_v1_idx
ON public.messages (created_at DESC NULLS LAST, id DESC)
INCLUDE (conversation_id, session_id, content)
WHERE direction = 'inbound'
  AND (is_test IS NULL OR is_test = false);
