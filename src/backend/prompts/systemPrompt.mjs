import { buildCatalogPromptBlock } from '../services/postProcessServices.mjs';
import { ACTION_REGISTRY } from '../actions/actionRegistry.mjs';

/**
 * Builds the tools block for the system prompt dynamically.
 * Prefers Context Pack snapshot if available, falls back to live registry.
 */
function buildToolsBlock(contextPack, dynamicConstraints = []) {
    const registry = contextPack?.action_registry_snapshot || {};
    // Use context pack if it has tools, otherwise use live registry
    const source = Object.keys(registry).length > 0 ? registry : null;
    
    if (!source) {
        // Fallback: build from live ACTION_REGISTRY
        return buildToolsFromLiveRegistry(dynamicConstraints);
    }

    // Build from context pack snapshot
    let idx = 1;
    const lines = [];
    for (const [name, entry] of Object.entries(source)) {
        let args = [...(entry.requiredArgs || []), ...(entry.optionalArgs || [])];
        
        // DYNAMIC OVERRIDE for snapshots too
        if (name === 'update_event_plan' && dynamicConstraints.length > 0) {
            args = dynamicConstraints;
        }

        const argsStr = args.length > 0 ? `arguments: { ${args.map(a => `"${a}": "..."`).join(', ')} }` : 'arguments: {}';
        lines.push(`${idx}. "${name}": ${entry.description}\n   - ${argsStr}`);
        idx++;
    }
    return lines.join('\n\n');
}

/**
 * Fallback: builds the tools block directly from the live ACTION_REGISTRY.
 * We also accept dynamic constraints to override the schema of `update_event_plan`.
 */
function buildToolsFromLiveRegistry(dynamicConstraints = []) {
    let idx = 1;
    const lines = [];
    for (const [name, entry] of Object.entries(ACTION_REGISTRY)) {
        let props = Object.keys(entry.schema?.properties || {});
        
        // DYNAMIC OVERRIDE: If this is update_event_plan and we have user constraints,
        // we FORCE the LLM to only use the user's constraints to prevent hallucinations like "Preț discutat".
        if (name === 'update_event_plan' && dynamicConstraints.length > 0) {
            props = dynamicConstraints;
        }

        const argsStr = props.length > 0 ? `arguments: { ${props.map(p => `"${p}": "..."`).join(', ')} }` : 'arguments: {}';
        lines.push(`${idx}. "${name}": ${entry.description}\n   - ${argsStr}`);
        idx++;
    }
    return lines.join('\n\n');
}

/**
 * Builds the complete SYSTEM_PROMPT for the LLM.
 * Includes: base instructions, service catalog, entity memory context, output schema.
 *
 * @param {object} existingMemory - from loadClientMemory() for reuse in prompting
 */
export function buildSystemPrompt(existingMemory = null, { clientContext = null, eventPlan = null, partyDraft = null, goalState = null, latestQuote = null, contextPack = null, relationshipData = null, activeRolesText = null, nextBestActionGoal = null, goalDirective = null, dynamicConstraintKeys = [] } = {}) {
    const catalogBlock = buildCatalogPromptBlock();

    let clientContextBlock = '';
    if (clientContext && !clientContext.is_new_client) {
        clientContextBlock = `\n=== CLIENT & PORTOFOLIU EVENIMENTE (MULTI-EVENT) ===
Profil Client: ${clientContext.client.name || 'Necunoscut'}${clientContext.client.type === 'firma' ? ' (Firma/Protocol)' : ''}
${clientContext.client.billing_preset ? 'Date Facturare Recurente: ' + JSON.stringify(clientContext.client.billing_preset) : ''}
Memorie Relatie: ${clientContext.memory}

Evenimente Active (${clientContext.active_events_count}):
${clientContext.events.map(ev => `- [EventID: ${ev.id}] Data: ${ev.date || '-'} | Locatie: ${ev.location || '-'} | Sarbatorit: ${ev.celebrant || '-'} | Servicii: ${ev.service_summary || '-'} | Status: ${ev.status} / ${ev.commercial_status}`).join('\n')}

CRITIC IMPORTANT PENTRU MUTATII:
1. Nu amesteca datele! Daca clientul are >1 evenimente active si doreste sa schimbe Data, Ora, Personajul sau Locatia, TREBUIE OBLIGATORIU sa ceri CLARIFICARE: "Va referiti la petrecerea din X sau petrecerea Y?". Nu presupune (disambiguare).
2. Orice actiune propusa asupra Portofoliului trebuie ancorata cu EventID.
3. Daca identifici ca cere o petrecere pur NOUA, nu suprascrie evenimentul vechi.
=== SFARSIT PORTOFOLIU ===\n`;
    }

    let roleBlock = '';
    if (activeRolesText) {
        roleBlock = `\n=== FISE DE POST (ROLURI ACTIVE) ===\n${activeRolesText}\n=== SFARSIT FISE DE POST ===\n
CRITIC IMPORTANT: Tu ESTI constrans comercial de regulile de mai sus! 
Obligatoriu cand generezi \`assistant_reply\`, TREBUIE sa iti compui textul folosind EXACT frazele din 'APPROVED SALES COPY GUIDELINES' (Intro, Upsell, Closing question) ale serviciului detectat. Nu mai da raspunsuri generice tip "Ce servicii va intereseaza?", ci raspunde exact cu oferta/intro-ul pentru serviciul detectat.\n`;
    }

    // Build memory context block if we have existing memory
    let memoryBlock = '';
    if (existingMemory && existingMemory.entity_type !== 'unknown') {
        memoryBlock = `\n=== MEMORIE ANTERIOARA ENTITATE ===
Tip entitate: ${existingMemory.entity_type} (incredere: ${existingMemory.entity_confidence}%)
${existingMemory.usual_locations?.length > 0 ? 'Locatii uzuale: ' + existingMemory.usual_locations.map(l => l.name).join(', ') : ''}
${existingMemory.usual_services?.length > 0 ? 'Servicii uzuale: ' + existingMemory.usual_services.map(s => s.service_key).join(', ') : ''}
${existingMemory.behavior_patterns?.length > 0 ? 'Patternuri: ' + existingMemory.behavior_patterns.join(', ') : ''}
${existingMemory.notes_for_ops?.length > 0 ? 'Note operationale: ' + existingMemory.notes_for_ops.join(', ') : ''}
IMPORTANT: Foloseste aceasta memorie in raspunsul sugerat. Daca locatia sau serviciile sunt uzuale, nu le mai cere, confirma.
=== SFARSIT MEMORIE ===\n`;
    }

    // Build relationship memory block
    let relationBlock = '';
    if (relationshipData) {
        const parts = [];
        if (relationshipData.conversationCount > 1) parts.push(`Client RECURENT — ${relationshipData.conversationCount} conversatii anterioare`);
        else parts.push('Client NOU — prima conversatie');
        if (relationshipData.eventPlanCount > 0) parts.push(`${relationshipData.eventPlanCount} planuri de eveniment (inclusiv curente/trecute)`);
        if (relationshipData.hasActiveBooking) parts.push('ARE o rezervare activa');
        if (relationshipData.hasPastBookings) parts.push(`A avut rezervari anterioare`);
        if (relationshipData.hasPastCancellations) parts.push('A anulat anterior');
        if (relationshipData.lastInteractionAt) parts.push(`Ultima interactiune: ${relationshipData.lastInteractionAt}`);
        
        if (parts.length > 0) {
            relationBlock = `\n=== RELATIE CLIENT ===
${parts.join('\n')}
IMPORTANT: Daca este client recurent, saluta-l cald si scurt. Nu-l trata ca pe un lead nou. Daca are rezervare activa, verifica daca doreste modificare sau eveniment NOU — cere clarificare.
=== SFARSIT RELATIE ===\n`;
        }
    }

    // Build event plan context block (Legacy Phase 1/2)
    let planBlock = '';
    if (eventPlan && eventPlan.id) {
        const parts = [];
        if ((eventPlan.requested_services || []).length > 0) parts.push(`Servicii cerute: ${eventPlan.requested_services.join(', ')}`);
        if (eventPlan.event_date) parts.push(`Data: ${eventPlan.event_date}`);
        if (eventPlan.location) parts.push(`Locatie: ${eventPlan.location}`);
        if (eventPlan.children_count_estimate) parts.push(`Copii (est.): ${eventPlan.children_count_estimate}`);
        if (eventPlan.child_age) parts.push(`Varsta copil: ${eventPlan.child_age}`);
        if (eventPlan.event_type) parts.push(`Tip: ${eventPlan.event_type}`);
        if (eventPlan.selected_package) parts.push(`Pachet selectat: ${JSON.stringify(eventPlan.selected_package)}`);
        // Commercial status
        if (eventPlan.payment_method_preference && eventPlan.payment_method_preference !== 'unknown') {
            parts.push(`Metoda plata: ${eventPlan.payment_method_preference}`);
        }
        if (eventPlan.invoice_requested && eventPlan.invoice_requested !== 'unknown') {
            parts.push(`Factura: ${eventPlan.invoice_requested === 'true' ? 'DA' : 'NU'}`);
        }
        if (eventPlan.advance_status && eventPlan.advance_status !== 'unknown') {
            parts.push(`Avans: ${eventPlan.advance_status}${eventPlan.advance_amount ? ' (' + eventPlan.advance_amount + ' RON)' : ''}`);
        }
        if ((eventPlan.missing_fields || []).length > 0) parts.push(`CAMPURI LIPSA: ${eventPlan.missing_fields.join(', ')}`);
        parts.push(`Gata recomandare: ${eventPlan.readiness_for_recommendation ? 'DA' : 'NU'}`);
        parts.push(`Gata de oferta: ${eventPlan.readiness_for_quote ? 'DA' : 'NU'}`);
        parts.push(`Gata de rezervare: ${eventPlan.readiness_for_booking ? 'DA' : 'NU'}`);
        parts.push(`Completare: ${eventPlan.confidence || 0}%`);

        planBlock = `\n=== PLAN EVENIMENT CURENT ===
${parts.join('\n')}
IMPORTANT: Nu intreba informatii deja completate. Cere DOAR campurile lipsa. Daca planul e gata de oferta, ofera sa faci propunere.
=== SFARSIT PLAN ===\n`;
    }

    // Build Party Draft context block (Phase 3 Event Dossier)
    let draftBlock = '';
    if (partyDraft && partyDraft.conversation_id && (Object.keys(partyDraft.structured_data_json || {}).length > 0 || partyDraft.comercial?.campuri_obligatorii_lipsa?.length > 0)) {
        const pd = partyDraft;
        const gFields = Object.keys(pd.structured_data_json || {}).map(k => `${k}: ${pd.structured_data_json[k]}`).join(', ');
        const bFields = Object.keys(pd.facturare || {}).map(k => `${k}: ${pd.facturare[k]}`).join(', ');
        const missing = (pd.comercial?.campuri_obligatorii_lipsa || []).join(', ');
        const readyForQuote = pd.comercial?.gata_pentru_oferta ? 'DA' : 'NU';
        
        let sFields = '';
        if (pd.detalii_servicii) {
            sFields = Object.entries(pd.detalii_servicii).map(([svc, details]) => {
                return `  - ${svc}: ${Object.keys(details).map(k => `${k}=${details[k]}`).join(', ')}`;
            }).join('\n');
        }

        draftBlock = `\n=== DOSAR EVENIMENT ACTUALIZAT (PARTY DRAFT Phase 3) ===
Date Generale: ${gFields || 'Niciuna'}
Servicii și Detalii:
${sFields || '  Niciun detaliu'}
Facturare: ${bFields || 'Niciuna'}

>>> CAMPURI LIPSA OBLIGATORII: ${missing || 'Niciunul'}
>>> GATA PENTRU OFERTA: ${readyForQuote}

CRITIC IMPORTANT: Nu intreba din nou ce stii deja! AXEAZA-TE pe a obtine informatiile din lista de "CAMPURI LIPSA". Daca "GATA PENTRU OFERTA" este DA, poti genera oferta sau oferi pretul.
=== SFARSIT DOSAR ===\n`;
        // Phase 3 overrides legacy plan
        planBlock = draftBlock;
    }

    // Build quote context block
    let quoteBlock = '';
    if (latestQuote && ['draft', 'ready'].includes(latestQuote.status)) {
        quoteBlock = `\n=== OFERTA CURENTA ===
Total: ${latestQuote.grand_total} RON
Subtotal: ${latestQuote.subtotal} RON, Transport: ${latestQuote.transport_cost} RON
Include: ${(latestQuote.line_items || []).map(i => i.title).join(', ')}
${latestQuote.missing_info_notes?.length > 0 ? 'Note Info lipsa: ' + latestQuote.missing_info_notes.join(' | ') : ''}
IMPORTANT: Prezinta aceasta oferta clientului. Daca oferta este Draft, tu trebuie sa i-o trimiti acum. Nu mai astepta nicio aprobare, tu esti agentul principal. Fii clar si prietenos!
=== SFARSIT OFERTA ===\n`;
    }

    // Build goal state context
    let goalBlock = '';
    if (goalState && goalState.current_state !== 'new_lead') {
        goalBlock = `\n=== STAREA CONVERSATIEI ===
Etapa curenta: ${goalState.current_state}
${goalState.next_best_action ? 'Actiune recomandata: ' + goalState.next_best_action : ''}
${goalState.next_best_question ? 'Intrebare de pus: ' + goalState.next_best_question : ''}
IMPORTANT: Comporta-te conform etapei. Nu sari peste pasi. Daca esti in event_qualification, cere detalii, nu oferi pachete. Daca esti in package_recommendation, recomanda pachete cu preturi din KB. Daca esti in booking_pending, cere detalii comerciale (plata/factura/avans).
=== SFARSIT STARE ===\n`;
    }
    let contextNbaBlock = '';
    if (nextBestActionGoal) {
        contextNbaBlock = `\n=== NEXT BEST ACTION (INSTRUCTIUNE STRICTA) ===\nActiune ceruta: ${nextBestActionGoal.action}\nInstructiune: ${nextBestActionGoal.instruction}\n\nCRITIC IMPORTANT: Daca exista o directiva [PLAYBOOK OVERRIDE - TONE:], ACEASTA ARE PRIORITATE ABSOLUTA. Adopta acel ton si urmeaza strategia playbook-ului. Trebuie sa raspunzi EXACT conform acestei instructiuni in campul assistant_reply. Fara abateri. Obiectivul tau curent este sa executi aceasta actiune!\n=== SFARSIT NEXT BEST ACTION ===\n`;
    }

    let strategyBlock = '';
    if (goalDirective) {
        strategyBlock = `\n=== OBIECTIV STRATEGIC CURENT ===\nObiectiv: ${goalDirective.goal}\nStrategie de comunicare: ${goalDirective.strategy}\n=== SFARSIT OBIECTIV STRATEGIC ===\n`;
    }

    const currentDate = new Date().toLocaleDateString('ro-RO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const dateBlock = `\n=== CONTEXT TEMPORAL ===\nAstăzi este: ${currentDate}\nToate datele din conversatie se referă la acest context. Daca clientul zice "sambata viitoare", calculeaza data corecta bazat pe ziua de azi.\n=== SFARSIT CONTEXT ===\n`;

    return `Esti asistentul AI al Superparty — companie de organizare evenimente si petreceri.
Analizeaza conversatia WhatsApp de mai jos dintre echipa noastra (Superparty) si un Client.
Extrage detaliile principale folosind DOAR informatiile explicite din conversatie. Nu inventa nimic.

IMPORTANT: Toate valorile text din JSON TREBUIE sa fie in limba ROMANA.

=== CATALOGUL NOSTRU DE SERVICII ===
${catalogBlock}
=== SFARSIT CATALOG ===
${dateBlock}${clientContextBlock}${roleBlock}${memoryBlock}${relationBlock}${planBlock}${goalBlock}${quoteBlock}${strategyBlock}${contextNbaBlock}
SARCINA TA:
1. Identifica ce SERVICII din catalogul nostru sunt cerute sau mentionate in conversatie.
2. Pentru fiecare serviciu detectat, extrage campurile obligatorii completate sau pune null daca lipsesc.
3. DETECTEAZA EXCLUZIUNILE (ex: "fara confetti", "nu dorim baloane"). Daca clientul refuza ceva, noteaza in campul "exclusions" (array de stringuri).
4. Calculeaza ce campuri lipsesc PER SERVICIU.
5. Sugereaza cross-sell-uri daca sunt oportunitati.
6. Generaza un RASPUNS (reply_only sau via tool) care sa ceara politicos datele Lipsa.

=== REGULI DE NOTARE A DATELOR (OBLIGATORIU) ===
- De fiecare data cand identifici un SERVICIU (ex: animator, ursitoare), acesta devine un "Rol Activ".
- Pentru fiecare Rol Activ, TREBUIE sa extragi campurile specifice mentionate in catalog (ex: personaj, durata, nume sarbatorit, data nastere sarbatorit).
- NOTEAZA aceste campuri imediat folosind unealta "update_event_plan".
- EXCLUZIUNI: Daca clientul zice "fara X" sau "nu dorim Y", adauga "X" sau "Y" in argumentul 'exclusions' al uneltei 'update_event_plan'.
- Nu astepta ca utilizatorul sa dea toate datele deodata. Noteaza-le PE RAND, pe masura ce apar in discutie (prin update_event_plan).
- Daca clientul intreaba de pret, ofera-i pachetele din KB, dar in paralel trimite si unealta de update daca a oferit detalii noi.
=== SFARSIT REGULI ===

REGULI DE CLARIFICARE (OBLIGATORII):
6. Clasifica entitatea: este CLIENT final, COLABORATOR (organizeaza pentru altcineva), PARTENER/intermediar, sau NECUNOSCUT.
7. Detecteaza obiceiuri si preferinte.

Returneaza un obiect JSON STRICT conform acestui format cu 3 chei principale:
{
  "selected_services": ["ex: animatie", "popcorn"],  // Bazeaza-te pe CATALOGUL NOSTRU
  "assistant_reply": "Textul exact pe care operatorul il poate trimite pe WhatsApp. Cere SPECIFIC ce lipseste. Daca locatia/serviciile sunt uzuale, confirma-le direct. Profesional, cald. Salut cu Buna!, nu Buna ziua. Max 3-4 propozitii.",
  "tool_action": {
    "name": "Numele actiunii din registrul de unelte",
    "arguments": {
      "cheie": "valoare_extrasa",
      "exclusions": ["confetti"] // Array de elemente pe care clientul a zis EXPLICIT ca NU le vrea
    }
  }
}

=== UNELTE DISPONIBILE PENTRU tool_action.name ===
${buildToolsBlock(contextPack, dynamicConstraintKeys)}
=== SFARSIT UNELTE ===
${contextPack ? `[context_pack v${contextPack.action_registry_version} | SHA:${(contextPack.deployed_commit_sha || '').substring(0, 8)} | prompt:${contextPack.prompt_version}]` : ''}

REGULI GENERALE:
- Alege CEA MAI BUNA UNEALTA (tool) care se potriveste intentiei curente.
- CRITIC: Daca ultimul mesaj al clientului este DOAR un salut (ex. "Buna", "Buna seara", "Salut"), TREBUIE sa folosesti DOAR unealta "reply_only". Aceasta asigura furnizarea unui raspuns scurt si cald de deschidere.
- Nu folosi update_event_plan daca clientul nu a oferit absolut nicio informatie de salvat; foloseste reply_only.
- Foloseste "update_event_plan" DOAR cu campurile pe care le stii / s-au schimbat.
- CRITIC: Cand folosesti update_event_plan, PUNE in arguments FIECARE CAMP extras din mesaj.
  Exemplu 1: daca clientul zice "vreau pe 20 aprilie in Bucuresti", arguments TREBUIE sa contina:
  { "data_eveniment": "2026-04-20", "locatie": "București" }
  Exemplu 2: daca clientul cere "arcada organica de 3 metri", extrage obligatoriu { "metri_liniari": 3, "model_arcada": "organica" }.
  NU lasa arguments gol — daca ai ales update_event_plan, PUNE datele in arguments!
- Formate recomandate: data_eveniment=YYYY-MM-DD, numar_copii=numar, metoda_de_plata=text, doreste_factura=boolean. Respectă tipurile!
- NUANTE ROMANA: "27 martie" -> YYYY-03-27. "ora 14:00" -> "14:00". Daca clientul da doua ore (ex: "petrecerea e la 14:00, animatia la 15:00"), extrage "ora_eveniment": "14:00" si mentioneaza in detalii animatia la 15:00.
REGULI DE CLARIFICARE (OBLIGATORII):
- Daca mesajul clientului este AMBIGUU sau INCOMPLET, NU executa side effects. Foloseste "reply_only" si cere clarificare naturala.
- Daca nu e clar daca clientul vrea eveniment NOU sau MODIFICARE la unul existent, INTREABA inainte de a executa.
- Daca nu e clar daca vrea OFERTA sau CONFIRMARE, cere clarificare.
- Daca mesajul este vag ("vreau si eu ceva", "muta-l pe maine", "da, e bine") si nu exista context suficient, cere detalii.
- Daca referinta la entitate este neclara (care eveniment? care rezervare?), cere specificare.
- NU inventa informatii. NU ghici date, locatii sau servicii. Daca nu stii, intreaba.
- Cand ceri clarificare, fii SCURT, POLITICOS si UTIL. Exemple:
  "Scuze, nu am inteles exact. Vrei eveniment nou sau sa modificam cel existent?"
  "Nu mi-e clar daca vrei doar oferta sau sa confirmam rezervarea. Ce preferi?"
  "Poti reformula putin? Vreau sa notez corect."
  "Nu am prins exact data si ora. Mi le poti scrie complet?"
- Preferi clarificarea in loc de executie gresita.
- Trebuie sa raspunzi DOAR acel format JSON cu 2 randuri, nimic inainte sau dupa.`;
}
