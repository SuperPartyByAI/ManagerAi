import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../config/env.mjs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Inserts a mutation record into the append-only log.
 */
export async function insertMutation({
    conversation_id,
    event_draft_id,
    mutation_type,
    changed_by = 'ai',
    before_json,
    after_json,
    delta_json,
    reason_summary,
    confidence
}) {
    // DISABLED: ai_event_mutations table does not exist in DB
    /*
    const { data, error } = await supabase.from('ai_event_mutations').insert({
        conversation_id,
        event_draft_id,
        mutation_type,
        changed_by,
        before_json,
        after_json,
        delta_json,
        reason_summary,
        confidence
    }).select('id').single();

    if (error) {
        console.error('[MutationRepo] Insert error:', error.message);
        return null;
    }
    return data?.id;
    */
    return null;
}

/**
 * Returns the mutation history for a conversation (most recent first).
 */
export async function getMutationHistory(conversationId, limit = 10) {
    const { data, error } = await supabase
        .from('ai_event_mutations')
        .select('id, mutation_type, changed_by, delta_json, reason_summary, confidence, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.warn('[MutationRepo] History query error:', error.message);
        return [];
    }
    return data || [];
}

/**
 * Updates the draft status (soft state change).
 */
export async function updateDraftStatus(draftId, status) {
    const update = {
        status: status,
        updated_at: new Date().toISOString()
    };
    // Map status change to audit columns if they exist, or just use general updated_at
    
    const { error } = await supabase
        .from('ai_client_events')
        .update(update)
        .eq('id', draftId);

    if (error) {
        console.error('[MutationRepo] Status update error:', error.message);
        return false;
    }
    return true;
}

/**
 * Increments the version on a draft (Silently disabled as column doesn't exist)
 */
export async function incrementDraftVersion(draftId, currentVersion = 1) {
    // Note: ai_client_events does not have 'version' column in the current schema.
    return;
}
