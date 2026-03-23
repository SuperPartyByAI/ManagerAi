import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../config/env.mjs';
import { insertMutation, updateDraftStatus, incrementDraftVersion } from '../repositories/mutationRepository.mjs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Applies a detected mutation to the event draft.
 *
 * 1. Snapshots current state (before_json)
 * 2. Applies changes to structured_data
 * 3. Snapshots new state (after_json)
 * 4. Computes delta
 * 5. Persists mutation log
 * 6. Updates draft in DB
 *
 * @param {object} params
 * @param {object} params.mutation       - from detectEventMutation()
 * @param {object} params.existingDraft  - current draft row from DB
 * @param {object} params.newDraftData   - LLM's event_draft output
 * @param {object} params.newServices    - LLM's selected_services
 * @param {string} params.conversationId
 * @param {string} params.clientId
 * @returns {object} { applied, draftId, mutationId, afterState }
 */
export async function applyEventMutation({
    mutation,
    existingDraft,
    newDraftData,
    newServices,
    conversationId,
    clientId
}) {
    const mutationType = mutation.mutation_type;

    // Skip if no mutation
    if (mutationType === 'no_mutation') {
        return { applied: false, reason: 'no_mutation' };
    }

    // Map ai_client_events schema
    const rawExistingSvc = existingDraft?.servicii_cerute || [];
    const normalizedExistingSvc = Array.isArray(rawExistingSvc) ? rawExistingSvc : Object.values(rawExistingSvc);

    const beforeState = {
        data_eveniment: existingDraft?.data_eveniment,
        locatie: existingDraft?.locatie,
        nume_sarbatorit: existingDraft?.nume_sarbatorit,
        ora_eveniment: existingDraft?.ora_eveniment,
        servicii_cerute: normalizedExistingSvc,
        exclusions: existingDraft?.structured_data_json?.exclusions || []
    };
    
    // Services in ai_client_events are role keys in servicii_cerute
    const beforeServices = normalizedExistingSvc.map(s => s.role_key || s.ID_Vizual).filter(Boolean);
    const beforeStatus = existingDraft?.status || 'active';

    // ── Build new state ──
    let afterState = { ...beforeState };
    let afterServices = [...beforeServices];
    let afterStatus = beforeStatus;

    const llmStructured = newDraftData.structured_data || {};
    const llmExclusions = newDraftData.exclusions || [];

    switch (mutationType) {
        case 'create_event':
            afterState = {
                data_eveniment: llmStructured.data_eveniment || llmStructured.data_eveniment || llmStructured.date,
                locatie: llmStructured.locatie || llmStructured.locatie || llmStructured.location,
                nume_sarbatorit: llmStructured.nume_sarbatorit || llmStructured.celebrant,
                ora_eveniment: llmStructured.ora_eveniment || llmStructured.ora_eveniment || llmStructured.time,
                exclusions: llmExclusions
            };
            afterServices = newServices || [];
            afterStatus = 'active';
            break;

        case 'cancel_event':
            afterStatus = 'cancelled';
            break;

        case 'reactivate_event':
            afterStatus = 'active';
            break;

        default:
            // Merge fields
            for (const change of (mutation.field_changes || [])) {
                if (change.new !== null && change.new !== undefined) {
                    afterState[change.field] = change.new;
                }
            }
            // Merge any new structured data from LLM
            for (const [key, val] of Object.entries(llmStructured)) {
                if (val && val !== 'null') {
                    afterState[key] = val;
                }
            }
            // Merge exclusions
            if (llmExclusions.length > 0) {
                 const current = afterState.exclusions || [];
                 afterState.exclusions = [...new Set([...current, ...llmExclusions])];
            }

            if (newServices && newServices.length > 0) {
                afterServices = newServices;
            }
            break;
    }

    // ── Prepare Payload for ai_client_events ──
    const payload = {
        client_id: clientId,
        status: afterStatus,
        data_eveniment: llmStructured.data_eveniment || llmStructured.date,
        locatie: llmStructured.locatie || llmStructured.location,
        nume_sarbatorit: llmStructured.nume_sarbatorit || llmStructured.celebrant,
        ora_eveniment: llmStructured.ora_eveniment || llmStructured.time,
        updated_at: new Date().toISOString()
    };

    // --- Conditional Promotion Logic (Draft -> Active) ---
    if (afterStatus === 'draft' || !existingDraft) {
        const { computeMissingPartyFields } = await import('../party/partyMissingFieldsEngine.mjs');
        // We use afterState but we must be careful since computeMissingPartyFields expects structured_data_json
        const { isFullyComplete } = computeMissingPartyFields({ structured_data_json: afterState }, newServices || []);
        
        if (isFullyComplete) {
            payload.status = 'confirmed';
            console.log(`[Mutation] Event ${existingDraft?.id || 'NEW'} promoted to CONFIRMED (Fully Complete)`);
        } else {
            payload.status = 'draft';
        }
    }

    // Prepare servicii_cerute (array of objects)
    const existingSvcObjects = Array.isArray(existingDraft?.servicii_cerute) ? existingDraft?.servicii_cerute : Object.values(existingDraft?.servicii_cerute || {});
    const newSvcObjects = (newServices || []).map(key => {
        const existing = existingSvcObjects.find(s => s.role_key === key);
        return existing || { role_key: key, role_title: key };
    });

    // Add METADATA role to store structured data that doesn't fit in flat columns
    // This allows the frontend to still see birth_date, exclusions, etc.
    const metadataRole = {
        role_key: 'METADATA',
        role_title: 'Metadata AI',
        payload: afterState,
        missing_fields: [] // Will be filled later if needed
    };
    
    payload.servicii_cerute = [...newSvcObjects, metadataRole];

    let draftId = existingDraft?.id;

    if (existingDraft) {
        // Update existing
        const { error } = await supabase
            .from('ai_client_events')
            .update(payload)
            .eq('id', existingDraft.id);
        if (error) console.error('[Mutation] Event update error:', error.message);

        // Update status if changed (this part is redundant but kept for mutation auditing context)
        if (afterStatus !== beforeStatus) {
            await updateDraftStatus(existingDraft.id, afterStatus, 'ai');
        }

        // DISABLED: version column does not exist
        // await incrementDraftVersion(existingDraft.id, existingDraft.version);
    } else {
        // Insert new
        const { data: newRow, error } = await supabase
            .from('ai_client_events')
            .insert({ 
                ...payload
            })
            .select('id')
            .single();
        if (error) console.error('[Mutation] Event insert error:', error.message);
        draftId = newRow?.id;
    }

    // ── Persist mutation log ──
    const mutationId = await insertMutation({
        conversation_id: conversationId,
        event_draft_id: draftId,
        mutation_type: mutationType,
        changed_by: 'ai',
        before_json: { structured_data: beforeState, services: beforeServices, status: beforeStatus },
        after_json: { structured_data: afterState, services: afterServices, status: afterStatus },
        delta_json: delta,
        reason_summary: mutation.mutation_reason,
        confidence: mutation.mutation_confidence
    });

    console.log(`[Mutation] Applied ${mutationType}: ${mutation.mutation_reason} (confidence=${mutation.mutation_confidence}, draft=${draftId}, mutation=${mutationId})`);

    return {
        applied: true,
        draftId,
        mutationId,
        mutation_type: mutationType,
        afterState,
        afterServices,
        afterStatus,
        delta
    };
}
