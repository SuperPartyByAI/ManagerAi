import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://jrfhprnuxxfwkwjwdsez.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Loads the active Party Draft (Event Dossier) for a given conversation.
 * If none exists, creates a fresh draft representing a clean slate.
 */
export async function loadPartyDraft(conversationId, clientId = null) {
    if (!conversationId) throw new Error("conversationId is required to load a party draft.");

    try {
        // 1. Căutăm Draftul Evenimentului (ai_client_events)
        const { data, error } = await supabase
            .from('ai_client_events')
            .select('*')
            .eq('client_id', clientId)
            .eq('status', 'draft')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error(`[loadPartyDraft] DB Error: ${error.message}`);
            return null; // Degrade gracefully
        }

        if (data) {
            return {
                conversation_id: conversationId,
                client_id: data.client_id,
                id: data.id, 
                draft_type: 'party',
                draft_status: data.status || 'discovery',
                comercial: {
                    campuri_obligatorii_lipsa: [], // Column missing fields json does not exist
                    gata_pentru_oferta: false,
                    scor_lead: 0
                },
                structured_data_json: {
                    date: data.data_eveniment, 
                    location: data.locatie, 
                    celebrant: data.nume_sarbatorit,
                    time: data.ora_eveniment 
                },
                detalii_servicii: {},
                services: (Array.isArray(data.servicii_cerute) ? data.servicii_cerute : Object.values(data.servicii_cerute || {}))
                    .map(s => s.role_key || s.service_key || s.ID_Vizual)
                    .filter(Boolean)
            };
        }

        // Return a clean default structure if not found
        // Note: We do not eagerly INSERT here. We save after the NLP processing builds substance.
        return {
            conversation_id: conversationId,
            client_id: clientId,
            draft_type: 'party',
            draft_status: 'discovery',
            comercial: {
                campuri_obligatorii_lipsa: [],
                gata_pentru_oferta: false,
                preluare_umana_activa: false
            },
            istoric_note: []
        };
    } catch (e) {
        console.error(`[loadPartyDraft] Exception: ${e.message}`);
        return null;
    }
}
