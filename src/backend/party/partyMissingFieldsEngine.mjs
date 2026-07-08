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

    // ── MANDATORY fields (🔴 must_collect_fields) — block confirmation ──────────
    const missingMandatory = [];
    // ── NICE-TO-HAVE fields (🟡 nice_to_have_fields) — collected if possible ────
    const missingNiceToHave = [];

    for (const role of activeRoles) {
        if (!role || !role.constraints) continue;
        const roleId = role.role_id || role.knowledge_key;

        // Mandatory fields: BLOCK promotion to active if missing
        const required = role.constraints.must_collect_fields || [];
        const roleMissingMandatory = [];
        required.forEach(f => {
            if (!hasField(f)) {
                roleMissingMandatory.push(f);
                if (!missingMandatory.includes(f)) missingMandatory.push(f);
                if (!missingForBooking.includes(f)) missingForBooking.push(f);
                if (!requiredOrder.includes(f)) requiredOrder.push(f);
                if (!missingForQuote.includes(f)) missingForQuote.push(f);
            }
        });

        // Nice-to-have fields: do NOT block — but AI still asks when possible
        const niceFields = role.constraints.nice_to_have_fields || [];
        niceFields.forEach(f => {
            if (!hasField(f) && !missingNiceToHave.includes(f)) {
                missingNiceToHave.push(f);
                // Add to requiredOrder at the END (lower priority)
                if (!requiredOrder.includes(f)) requiredOrder.push(f);
            }
        });

        roleCompliance.push({
            roleId,
            isComplete: roleMissingMandatory.length === 0, // complete = only mandatory matters
            missingFields: roleMissingMandatory,
            missingNiceToHave: niceFields.filter(f => !hasField(f))
        });
    }

    // Filter out fields that are already completed
    const actualMissingForQuote = missingForQuote.filter(f => !hasField(f));
    const actualMissingForBooking = missingForBooking.filter(f => !hasField(f));
    // Booking/confirmation only requires MANDATORY fields
    const combinedBooking = [...new Set([...actualMissingForQuote, ...actualMissingForBooking])];

    // Next field to ask: mandatory first, then nice-to-have
    let nextFieldToAsk = null;
    for (const field of requiredOrder) {
        if (!hasField(field)) {
            nextFieldToAsk = field;
            break;
        }
    }
    if (!nextFieldToAsk && actualMissingForQuote.length > 0) nextFieldToAsk = actualMissingForQuote[0];
    if (!nextFieldToAsk && combinedBooking.length > 0) nextFieldToAsk = combinedBooking[0];

    const isReadyForQuote = actualMissingForQuote.length === 0;
    // ✅ KEY CHANGE: isReadyForBooking checks ONLY mandatory fields, not nice-to-have
    const isReadyForBooking = combinedBooking.length === 0;

    return {
        missingForQuote: actualMissingForQuote,
        missingForBooking: combinedBooking,
        missingNiceToHave,                        // 🟡 Nice-to-have: AI collects these but doesn't block
        isReadyForQuote,
        isReadyForBooking,
        isFullyComplete: isReadyForBooking,        // ✅ Only mandatory fields required for confirmation
        roleCompliance,
        allowedOptionals: optionals,
        
        // --- Legacy Interface Mapping for nextBestActionPlanner ---
        readyForQuote: isReadyForQuote,
        missing: actualMissingForQuote.length > 0 ? actualMissingForQuote : actualMissingForBooking,
        nextFieldToAsk: nextFieldToAsk
    };
}
