/**
 * partyMissingFieldsEngine.mjs (v2)
 * 
 * Computes explicitly what fields are still missing based on dynamic constraints
 * set by the user in the AI Roles Admin UI (`activeRoles` array).
 */
export function computeMissingPartyFields(partyDraft, activeRoles = []) {
    const missingForQuote = [];
    const missingForBooking = [];
    const optionals = [];
    const requiredOrder = [];

    const roleCompliance = [];

    // Helper to check if a key exists and is not null/empty in the draft structure
    const hasField = (key) => {
        // Primary: check the unified structured_data_json object
        if (partyDraft.structured_data_json) {
            const data = partyDraft.structured_data_json;
            // A field is considered "filled" if it has a value OR if it was explicitly excluded by the client
            const hasValue = data[key] !== undefined && data[key] !== null && data[key] !== '';
            const isExcluded = data.exclusions?.includes(key);
            
            if (hasValue || isExcluded) return true;
        }

        // Fallbacks for legacy/in-flight structures
        if (partyDraft.date_generale && partyDraft.date_generale[key]) return true;
        
        // Dynamic flat structure support (Alternative Naming)
        if (partyDraft.structured_data) {
             let parsed = partyDraft.structured_data;
             if (typeof parsed === 'string') {
                 try { parsed = JSON.parse(parsed); } catch(_) {}
             }
             if (parsed && typeof parsed === 'object' && parsed[key] !== undefined && parsed[key] !== null && parsed[key] !== '') {
                 return true;
             }
        }
        return false;
    };

    // Combine all requirements from all active roles dynamically
    for (const role of activeRoles) {
        if (!role || !role.constraints) continue;
        const roleId = role.role_id || role.knowledge_key;
        const required = role.constraints.must_collect_fields || [];
        
        const roleMissing = [];
        required.forEach(f => {
            if (!hasField(f)) roleMissing.push(f);
            
            // Global tracking
            if (!missingForBooking.includes(f)) missingForBooking.push(f);
            if (!requiredOrder.includes(f)) requiredOrder.push(f);
            if (!missingForQuote.includes(f)) missingForQuote.push(f);
        });

        roleCompliance.push({
            roleId,
            isComplete: roleMissing.length === 0,
            missingFields: roleMissing
        });
    }

    // Filter out fields that are already completed
    const actualMissingForQuote = missingForQuote.filter(f => !hasField(f));
    const actualMissingForBooking = missingForBooking.filter(f => !hasField(f));
    const combinedBooking = [...new Set([...actualMissingForQuote, ...actualMissingForBooking])];

    // Compute Next Field To Ask based on Recommended Order
    let nextFieldToAsk = null;
    if (requiredOrder.length > 0) {
        for (const field of requiredOrder) {
            if (actualMissingForQuote.includes(field) || actualMissingForBooking.includes(field)) {
                nextFieldToAsk = field;
                break;
            }
        }
    }
    
    // Fallback if recommendedOrder didn't catch it
    if (!nextFieldToAsk && actualMissingForQuote.length > 0) nextFieldToAsk = actualMissingForQuote[0];
    if (!nextFieldToAsk && combinedBooking.length > 0) nextFieldToAsk = combinedBooking[0];

    const isReadyForQuote = actualMissingForQuote.length === 0;
    const isReadyForBooking = combinedBooking.length === 0;

    return {
        missingForQuote: actualMissingForQuote,
        missingForBooking: combinedBooking,
        isReadyForQuote,
        isReadyForBooking,
        isFullyComplete: isReadyForBooking, // Changed to rely purely on dynamic constraints arrays
        roleCompliance, // NEW
        allowedOptionals: optionals,
        
        // --- Legacy Interface Mapping for nextBestActionPlanner ---
        readyForQuote: isReadyForQuote,
        missing: actualMissingForQuote.length > 0 ? actualMissingForQuote : actualMissingForBooking,
        nextFieldToAsk: nextFieldToAsk
    };
}
