import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://jrfhprnuxxfwkwjwdsez.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Persists the current state of the Party Draft back to Supabase.
 * Includes optimistic upserts taking advantage of JSONB columns.
 */
export async function savePartyDraft(partyDraft) {
    if (!partyDraft.conversation_id) {
        console.error("[savePartyDraft] Cannot save draft without conversation_id");
        return false;
    }

    try {
        // Map internal object to database columns
        const payload = {
            client_id: partyDraft.client_id,
            conversation_id: partyDraft.conversation_id, // Ensure conversation_id is part of the payload for upsert
            status: partyDraft.draft_status || 'draft',
            servicii_cerute: partyDraft.services?.map(s => ({ role_key: s, role_title: s })) || [],
            data_eveniment: partyDraft.structured_data_json?.date || partyDraft.structured_data_json?.data_eveniment,
            locatie: partyDraft.structured_data_json?.location || partyDraft.structured_data_json?.locatie,
            nume_sarbatorit: partyDraft.structured_data_json?.celebrant || partyDraft.structured_data_json?.nume_sarbatorit,
            ora_eveniment: partyDraft.structured_data_json?.time || partyDraft.structured_data_json?.ora_eveniment,
            updated_at: new Date().toISOString()
        };

        if (partyDraft.id) {
            payload.id = partyDraft.id;
        }

        // Upsert based on the ID if available, otherwise just insert
        const { error } = await supabase
            .from('ai_client_events')
            .upsert(payload);

        if (error) {
            console.error(`[savePartyDraft] DB Error: ${error.message} \nDetails: ${error.details}`);
            return false;
        }

        return true;
    } catch (e) {
        console.error(`[savePartyDraft] Exception: ${e.message}`);
        return false;
    }
}
