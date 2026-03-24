import { normalizeValue } from './normalizePartyFields.mjs';

/**
 * updatePartyDraftFromMessage.mjs
 * 
 * Merges raw LLM extractions into the persistent Party Draft flat structure.
 * Only accepts fields that match the definitions within active roles, avoiding hallucinations.
 */
export function updatePartyDraftFromMessage(partyDraft, rawExtractedData, activeRoles = []) {
    if (!rawExtractedData || typeof rawExtractedData !== 'object') return partyDraft;

    // Collect all permitted dynamic fields from active roles
    const permittedFields = new Set([
        // Allow built-in basic fields just in case
        'event_type', 'location', 'date', 'time', 'client_name', 'phone_number',
        'nume_sarbatorit', 'numar_copii', 'locatie_eveniment', 'data_eveniment' // fallback
    ]);
    
    for (const role of activeRoles) {
        if (!role || !role.constraints) continue;
        const required = role.constraints.must_collect_fields || [];
        required.forEach(f => permittedFields.add(f));
    }

    // Always permit exclusions and birthday
    permittedFields.add('exclusions');
    permittedFields.add('data_nastere_sarbatorit');

    // Prepare flat structured data object
    if (!partyDraft.structured_data_json) {
        partyDraft.structured_data_json = {};
    } else if (typeof partyDraft.structured_data_json === 'string') {
        try { partyDraft.structured_data_json = JSON.parse(partyDraft.structured_data_json); } catch(e) { partyDraft.structured_data_json = {}; }
    }

    // Update dynamic fields selectively based on permitted fields
    for (const [key, val] of Object.entries(rawExtractedData)) {
         if (permittedFields.has(key)) {
             if (key === 'exclusions' && Array.isArray(val)) {
                 partyDraft.structured_data_json.exclusions = val;
             } else {
                 const normalized = normalizeValue(key, val, 'string');
                 if (normalized !== null && normalized !== '') {
                     partyDraft.structured_data_json[key] = normalized;
                 }
             }
         }
    }

    // Keep legacy support for a bit so frontend UI doesn't crash completely manually-added data
    // but mostly everything uses flat structured_data now.
    
    return partyDraft;
}
