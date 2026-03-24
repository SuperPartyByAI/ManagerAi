/**
 * Detects the type of event mutation from LLM analysis output
 * by comparing against the existing draft state.
 *
 * Pure logic — no LLM call, no DB access.
 *
 * @param {object} analysis       - LLM analysis output
 * @param {object} existingDraft  - current draft from DB (null if none)
 * @returns {object} mutation descriptor
 */
export function detectEventMutation(analysis, existingDraft) {
    const mutationIntent = analysis.mutation_intent || {};
    const eventDraft = analysis.event_draft || {};
    const newServices = analysis.selected_services || [];
    const conversationState = analysis.conversation_state || {};

    // If LLM explicitly provided a mutation_intent, use it
    if (mutationIntent.type && mutationIntent.type !== 'no_mutation') {
        return buildMutation({
            type: mutationIntent.type,
            targetField: mutationIntent.target_field || null,
            oldValue: mutationIntent.old_value || null,
            newValue: mutationIntent.new_value || null,
            addedServices: mutationIntent.added_services || [],
            removedServices: mutationIntent.removed_services || [],
            confidence: mutationIntent.confidence || 70,
            reason: mutationIntent.reason || 'LLM explicit intent'
        });
    }

    // No existing draft → this is a create
    if (!existingDraft || !existingDraft.structured_data_json) {
        if (newServices.length > 0 || newData.data_eveniment || newData.locatie || newData.date) {
            return buildMutation({
                type: 'create_event',
                confidence: 90,
                reason: 'No existing draft, new event data detected'
            });
        }
        return buildMutation({ type: 'no_mutation', confidence: 100, reason: 'No draft, no new data' });
    }

    const existingData = existingDraft.structured_data_json || {};
    const newData = eventDraft.structured_data_json || eventDraft.structured_data || {};
    const existingStatus = existingDraft.draft_status || 'active';

    // Check for cancellation intent
    const intent = conversationState.current_intent?.toLowerCase() || '';
    if (intent.includes('anuleaza') || intent.includes('cancel') || intent.includes('renunt')) {
        return buildMutation({
            type: 'cancel_event',
            confidence: 85,
            reason: `Cancel intent detected: "${conversationState.current_intent}"`
        });
    }

    // Check for reactivation (cancelled draft + new activity)
    if (existingStatus === 'cancelled' && (newServices.length > 0 || newData.data_eveniment || newData.date)) {
        return buildMutation({
            type: 'reactivate_event',
            confidence: 80,
            reason: 'Cancelled draft with new event data'
        });
    }

    // Detect field changes dynamically for any field in newData
    const fieldChanges = [];
    const monitoredFields = new Set([...Object.keys(existingData), ...Object.keys(newData)]);

    for (const field of monitoredFields) {
        const oldVal = existingData[field];
        const newVal = newData[field];

        // Skip if new value is null/empty or same as old
        if (newVal === null || newVal === undefined || newVal === '' || newVal === 'null') continue;
        
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            fieldChanges.push({ field, old: oldVal || null, new: newVal });
        }
    }

    // Detect exclusions changes
    const existingExclusions = existingData.exclusions || [];
    const newExclusions = analysis.exclusions || eventDraft.exclusions || [];
    const addedExclusions = newExclusions.filter(x => !existingExclusions.includes(x));
    
    if (addedExclusions.length > 0) {
        fieldChanges.push({ field: 'exclusions', old: existingExclusions, new: [...new Set([...existingExclusions, ...newExclusions])] });
    }

    // Single field change → specific mutation type
    if (fieldChanges.length === 1) {
        const typeMap = { 
            data_eveniment: 'change_date', 
            data_eveniment: 'change_date', 
            date: 'change_date', 
            locatie: 'change_location', 
            locatie: 'change_location', 
            location: 'change_location', 
            ora_eveniment: 'change_time', 
            ora_eveniment: 'change_time', 
            time: 'change_time' 
        };
        return buildMutation({
            type: typeMap[fieldChanges[0].field] || 'update_event',
            fieldChanges,
            confidence: 85,
            reason: `Changed ${fieldChanges[0].field}: ${fieldChanges[0].old} → ${fieldChanges[0].new}`
        });
    }

    // Multiple field changes → generic update
    if (fieldChanges.length > 1) {
        return buildMutation({
            type: 'update_event',
            fieldChanges,
            confidence: 80,
            reason: `Multiple fields changed: ${fieldChanges.map(f => f.field).join(', ')}`
        });
    }

    // Detect service changes
    const existingServices = existingDraft.services || [];
    const added = newServices.filter(s => !existingServices.includes(s));
    const removed = existingServices.filter(s => !newServices.includes(s));

    if (added.length > 0 && removed.length > 0) {
        return buildMutation({
            type: 'replace_service',
            addedServices: added,
            removedServices: removed,
            confidence: 75,
            reason: `Replaced: -${removed.join(',')} +${added.join(',')}`
        });
    }
    if (added.length > 0) {
        return buildMutation({
            type: 'add_service',
            addedServices: added,
            confidence: 80,
            reason: `Added services: ${added.join(', ')}`
        });
    }
    if (removed.length > 0 && newServices.length > 0) {
        return buildMutation({
            type: 'remove_service',
            removedServices: removed,
            confidence: 75,
            reason: `Removed services: ${removed.join(', ')}`
        });
    }

    // No measurable changes in service or fields
    return buildMutation({ type: 'no_mutation', confidence: 100, reason: 'No detectable changes' });
}

function buildMutation({
    type,
    targetField = null,
    oldValue = null,
    newValue = null,
    addedServices = [],
    removedServices = [],
    fieldChanges = [],
    confidence = 70,
    reason = ''
}) {
    let statusChange = null;
    if (type === 'cancel_event') statusChange = 'cancelled';
    else if (type === 'reactivate_event') statusChange = 'active';

    return {
        mutation_type: type,
        target_field: targetField,
        old_value: oldValue,
        new_value: newValue,
        added_services: addedServices,
        removed_services: removedServices,
        field_changes: fieldChanges,
        event_status_change: statusChange,
        mutation_confidence: confidence,
        needs_review: confidence < 60 || type === 'cancel_event',
        mutation_reason: reason
    };
}
