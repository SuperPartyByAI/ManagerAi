import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Încarcă Profilul Clientului și Portofoliul său de petreceri
 * Caută clientul după telefon (E.164 form).
 * Extrage și pregătește un JSON compact pentru Prompt-ul Agentului.
 */
export async function loadClientContext(phoneE164, conversationId) {
    let clientProfile = null;
    let clientEvents = [];
    let memorySummary = null;

    // 1. Căutăm Clientul (clients)
    const { data: profiles, error: profileErr } = await supabase
        .from('clients')
        .select('*')
        .eq('telefon', phoneE164)
        .limit(1);

    if (profileErr) {
        console.error(`[MemoryLoader] Error fetching client profile:`, profileErr.message);
        return { error: 'profile_fetch_error' };
    }

    if (!profiles || profiles.length === 0) {
        // Client Complet Nou pe axa de Baze de Date. 
        // Va fi instanțiat cu primul lui eveniment direct din processConversation.
        return {
            is_new_client: true,
            phone_e164: phoneE164,
            active_events_count: 0,
            events: []
        };
    }

    clientProfile = profiles[0];

    // 2. Căutăm Evenimentele (ai_client_events)
    // Aducem toate petrecerile (putem filtra după status ulterior dacă e nevoie)
    const { data: events, error: eventsErr } = await supabase
        .from('ai_client_events')
        .select('*')
        .eq('client_id', clientProfile.id)
        .order('created_at', { ascending: false });

    if (!eventsErr && events) {
        clientEvents = events;
    }

    // 3. Căutăm Client Memory Summary (Safe check if table exists)
    try {
        const { data: summaryData } = await supabase
            .from('ai_client_memory_summary')
            .select('*')
            .eq('client_id', clientProfile.id)
            .limit(1);

        if (summaryData?.length > 0) {
            memorySummary = summaryData[0];
        }
    } catch (summaryErr) {
        console.warn(`[MemoryLoader] Summary table missing or error:`, summaryErr.message);
    }

    // Compunem contextul
    const activeCount = clientEvents.length;
    
    const context = {
        is_new_client: false,
        client: {
            id: clientProfile.id,
            name: clientProfile.nume,
            type: clientProfile.tip_client || 'persoana_fizica',
            phone: clientProfile.telefon,
            billing_preset: null,
            preferences: null
        },
        memory: memorySummary ? memorySummary.summary_text : `Clientul are ${activeCount} evenimente.`,
        active_events_count: activeCount,
        events: clientEvents.map(ev => ({
            id: ev.id,
            status: ev.status,
            date: ev.data_eveniment,
            time: ev.ora_eveniment,
            location: ev.locatie,
            celebrant: ev.nume_sarbatorit
        }))
    };

    return context;
}

/**
 * Creează rapid un Profil Nou de Client și un Eveniment inițial pe baza unui telefon.
 * Se folosește la un First Contact.
 */
export async function createNewClientWithEvent(phoneE164, conversationId) {
    // Insert profil
    const { data: profData, error: profErr } = await supabase
        .from('clients')
        .insert({
            telefon: phoneE164,
            tip_client: 'persoana_fizica'
        })
        .select('id')
        .single();
        
    if (profErr || !profData) {
        console.error(`[MemoryLoader] Create Client Profil Fail:`, profErr?.message);
        throw new Error("Cannot create client profile");
    }

    const clientId = profData.id;

    // Insert Event
    const { data: eventData, error: eventErr } = await supabase
        .from('ai_client_events')
        .insert({
            client_id: clientId,
            status: 'draft',
            updated_at: new Date().toISOString()
        })
        .select('id')
        .single();

    if (eventErr || !eventData) {
        console.error(`[MemoryLoader] Create Event Fail:`, eventErr?.message);
        throw new Error("Cannot create client event");
    }

    // Generam și Summary-ul
    try {
        await supabase.from('ai_client_memory_summary').insert({
            client_id: clientId,
            summary_text: 'Client complet nou. Prima petrecere inițiată.',
            active_events_count: 1,
            active_ids: [eventData.id],
            last_active_id: eventData.id
        });
    } catch (summaryErr) {
        console.warn(`[MemoryLoader] Summary table insert skipped:`, summaryErr.message);
    }

    return {
        client_id: clientId,
        id: eventData.id
    };
}
