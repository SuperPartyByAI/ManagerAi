"use client";

import { useState, useEffect, useCallback } from "react";

interface ClientNotebook {
  id: string;
  phone_number: string;
  wa_number: string;
  brand_key: string | null;
  clean_notebook: any;
  event_drafts: any[];
  summary_updated_at: string;
  created_at: string;
}

// Helper: normalizează clean_notebook — poate fi array sau obiect
function normalizeNotebook(nb: any): Record<string, string> {
  if (!nb) return {};
  if (Array.isArray(nb)) return nb[0] || {}; // backfill vechi a stocat ca array
  return nb;
}

const FIELD_LABELS: Record<string, string> = {
  data_eveniment: "📅 Data eveniment (vechi)",
  data_evenimentului: "📅 Data evenimentului",
  ora_eveniment: "🕐 Ora (vechi)",
  ora_evenimentului: "🕐 Ora",
  serviciu: "🎪 Serviciu",
  personaj: "🦸 Personaj",
  locatie: "📍 Locație (vechi)",
  localitate: "🏙️ Localitate",
  locatie_eveniment: "📍 Locație Eveniment",
  pret_discutat: "💰 Preț discutat",
  nr_copii: "👶 Nr. copii (vechi)",
  numar_copii: "👶 Nr. copii",
  varsta_copil: "🎂 Vârsta copil (vechi)",
  varsta_sarbatoritului: "🎂 Vârsta sărbătoritului",
  metoda_plata: "💳 Metodă plată (vechi)",
  metoda_de_plata: "💳 Metodă plată",
  nr_invitati: "👥 Nr. invitați (vechi)",
  numar_invitati: "👥 Nr. invitați",
  status_confirmat: "✅ Status",
  observatii: "📝 Observații",
  // Mapări pentru Vertex AI (internal keys)
  date: "📅 Data (AI)",
  location: "📍 Locație (AI)",
  duration: "⏱️ Durată (AI)",
  role_title: "🎪 Serviciu (AI)",
  data_nastere_sarbatorit: "🎂 Data naștere sărbătorit",
  exclusions: "🚫 Excluziuni / Fără confetti",
};

export default function ClientsNotebook() {
  const [clients, setClients] = useState<ClientNotebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [viewAiMemory, setViewAiMemory] = useState<string | null>(null);
  const [viewingBrain, setViewingBrain] = useState<string | null>(null);
  const [viewingDrafts, setViewingDrafts] = useState<string | null>(null);
  const [viewingConfirmed, setViewingConfirmed] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [chatHistory, setChatHistory] = useState<any[] | null>(null);

  const fetchClients = useCallback(async () => {
    console.log("[ClientsNotebook] Încep fetchClients...");
    setLoading(true);
    try {
      const url = "/api/admin/client-notebooks?_t=" + Date.now();
      console.log("[ClientsNotebook] Fetching from:", url);
      const res = await fetch(url);
      console.log("[ClientsNotebook] Status răspuns:", res.status);
      const data = await res.json();
      console.log("[ClientsNotebook] Date primite:", data.notebooks?.length || 0, "notebooks");
      if (data.notebooks && Array.isArray(data.notebooks)) {
        const mapped = data.notebooks.map((n: any) => ({
           id: n.client_id,
           phone_number: n.phone_number,
           wa_number: n.brand_key || '',
           brand_key: n.brand_key,
           clean_notebook: n.extracted_data || {},
           event_drafts: n.event_drafts || [],
           summary_updated_at: n.last_message_at || new Date().toISOString(),
           created_at: n.last_message_at || new Date().toISOString(),
           alias: n.alias
        }));
        setClients(mapped);
      } else {
        console.warn("[ClientsNotebook] Format invalid de date:", data);
        setClients([]);
      }
    } catch (err: any) {
      console.error("[ClientsNotebook] Eroare la fetch:", err.message);
      setClients([]);
    } finally {
      setLoading(false);
      console.log("[ClientsNotebook] Gata fetchClients.");
    }
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);
  console.log("[ClientsNotebook] Toți clienții primiți:", clients.length);

  // Când schimbăm clientul deschis, încărcăm chat-ul automat
  useEffect(() => {
     setChatHistory(null);
     setViewingBrain(null); 
     setViewingDrafts(null);
     setViewingConfirmed(null);
     if (expanded) {
         fetch(`/api/admin/crm/clients/${expanded}?_t=${Date.now()}`)
             .then(res => res.json())
             .then(data => { setChatHistory(data.latest_messages || []); })
             .catch(() => { setChatHistory([]); });
     }
  }, [expanded]);

  const filteredClients = clients.filter(c => {
    const phone = c.phone_number || "";
    const wa = c.wa_number || "";
    const notebookStr = JSON.stringify(c.clean_notebook || {}).toLowerCase();
    const search = searchTerm.toLowerCase();

    return phone.includes(search) ||
           wa.includes(search) ||
           notebookStr.includes(search);
  });

  const startEdit = (client: ClientNotebook) => {
    setEditing(client.id);
    setEditData({ ...normalizeNotebook(client.clean_notebook) });
  };

  const saveEdit = async (client: ClientNotebook) => {
    setSaving(true);
    try {
      await fetch("/api/admin/clients-notebook", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: client.phone_number,
          wa_number: client.wa_number,
          clean_notebook: editData,
        }),
      });
      setEditing(null);
      await fetchClients();
    } finally {
      setSaving(false);
    }
  };


  return (
    <div style={{ padding: "20px", maxWidth: "1800px", width: "100%", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: "#fff" }}>
            📋 Clienți AI — Notebook Persistent
          </h2>
          <p style={{ margin: "4px 0 0", color: "#9ca3af", fontSize: "13px" }}>
            Memorie curată extrasă automat de AI din conversații • Izolat per QR/număr WhatsApp
          </p>
        </div>
        <button
          onClick={fetchClients}
          style={{
            background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)",
            color: "#a5b4fc", borderRadius: "8px", padding: "8px 16px", cursor: "pointer", fontSize: "13px"
          }}
        >
          🔄 Reîncarcă
        </button>
      </div>

      {/* Search */}
      <input
        placeholder="Caută după telefon, QR sau date..."
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        style={{
          width: "100%", padding: "10px 14px", marginBottom: "16px",
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "10px", color: "#fff", fontSize: "14px", boxSizing: "border-box"
        }}
      />

      {loading ? (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: "60px 0" }}>
          ⏳ Se încarcă clienții...
        </div>
      ) : filteredClients.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "60px 20px",
          background: "rgba(255,255,255,0.03)", borderRadius: "12px",
          border: "1px solid rgba(255,255,255,0.08)", color: "#6b7280"
        }}>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>🧠</div>
          <p style={{ margin: 0, fontSize: "16px" }}>Nicio memorie de client găsită.</p>
          <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#4b5563" }}>
            Memoria se formează automat după 30+ mesaje cu un client.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filteredClients.map(client => {
            const isExpanded = expanded === client.id;
            const isEditing = editing === client.id;
            const nbFields = Object.entries(normalizeNotebook(client.clean_notebook)).filter(([k, v]) => v && k.indexOf('rezumat') === -1);

            return (
              <div
                key={client.id}
                style={{
                  background: "rgba(255,255,255,0.04)", borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  overflow: "hidden", transition: "border-color 0.2s",
                }}
              >
                {/* Card Header */}
                <div
                  onClick={() => { setExpanded(isExpanded ? null : client.id); setEditing(null); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 18px", cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div style={{
                      background: "rgba(99,102,241,0.2)", borderRadius: "50%",
                      width: "38px", height: "38px", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "18px"
                    }}>👤</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "15px", color: "#e2e8f0" }}>
                        {client.phone_number}
                      </div>
                      <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
                        QR: {client.wa_number || "necunoscut"} •{" "}
                        {nbFields.length} câmpuri •{" "}
                        {new Date(client.summary_updated_at).toLocaleDateString("ro-RO")}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {nbFields.length > 0 && (
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {nbFields.slice(0, 3).map(([k, v]) => (
                          <span key={k} style={{
                            background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)",
                            color: "#6ee7b7", borderRadius: "6px", padding: "2px 8px", fontSize: "11px"
                          }}>
                            {FIELD_LABELS[k]?.split(" ")[0] || k}: {String(v).substring(0, 15)}
                          </span>
                        ))}
                      </div>
                    )}
                    <span style={{ color: "#6b7280", fontSize: "18px" }}>{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Expanded: notebook fields */}
                {isExpanded && (
                  <div style={{ padding: "0 18px 18px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ paddingTop: "14px" }}>
                      {/* Action buttons */}
                      <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                        {!isEditing ? (
                          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                            <button
                              onClick={e => { e.stopPropagation(); startEdit(client); }}
                              style={{
                                background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)",
                                color: "#a5b4fc", borderRadius: "8px", padding: "6px 14px",
                                cursor: "pointer", fontSize: "13px"
                              }}
                            >✏️ Editează</button>
                            
                            {(() => {
                                const localDrafts = (client.event_drafts || []).filter((d: any) => d.status !== 'confirmed' && d.status !== 'booked');
                                const localConf = (client.event_drafts || []).filter((d: any) => d.status === 'confirmed' || d.status === 'booked');
                                return (
                                  <>
                                    <button
                                      onClick={e => { e.stopPropagation(); setViewingDrafts(null); setViewingConfirmed(null); setViewingBrain(prev => prev === client.id ? null : client.id); }}
                                      style={{
                                        background: viewingBrain === client.id ? "rgba(168,85,247,0.4)" : "rgba(168,85,247,0.2)",
                                        border: "1px solid rgba(168,85,247,0.5)",
                                        color: "#d8b4fe", borderRadius: "8px", padding: "6px 14px",
                                        cursor: "pointer", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px"
                                      }}
                                    >{viewingBrain === client.id ? "👀 Vezi Istoric Chat" : "🧠 Adevăr AI"}</button>
                                    
                                    <button
                                      onClick={e => { e.stopPropagation(); setViewingBrain(null); setViewingConfirmed(null); setViewingDrafts(prev => prev === client.id ? null : client.id); }}
                                      style={{
                                        background: viewingDrafts === client.id ? "rgba(245,158,11,0.4)" : "rgba(245,158,11,0.15)",
                                        border: "1px solid rgba(245,158,11,0.5)",
                                        color: "#fcd34d", borderRadius: "8px", padding: "6px 14px",
                                        cursor: "pointer", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px"
                                      }}
                                    >{viewingDrafts === client.id ? "👀 Vezi Istoric Chat" : `🚧 Ciorne (${localDrafts.length})`}</button>
                                    
                                    <button
                                      onClick={e => { e.stopPropagation(); setViewingBrain(null); setViewingDrafts(null); setViewingConfirmed(prev => prev === client.id ? null : client.id); }}
                                      style={{
                                        background: viewingConfirmed === client.id ? "rgba(16,185,129,0.4)" : "rgba(16,185,129,0.15)",
                                        border: "1px solid rgba(16,185,129,0.5)",
                                        color: "#6ee7b7", borderRadius: "8px", padding: "6px 14px",
                                        cursor: "pointer", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px"
                                      }}
                                    >{viewingConfirmed === client.id ? "👀 Vezi Istoric Chat" : `✅ Confirmate (${localConf.length})`}</button>
                                  </>
                                );
                            })()}
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={e => { e.stopPropagation(); saveEdit(client); }}
                              disabled={saving}
                              style={{
                                background: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.4)",
                                color: "#6ee7b7", borderRadius: "8px", padding: "6px 14px",
                                cursor: "pointer", fontSize: "13px"
                              }}
                            >{saving ? "⏳..." : "💾 Salvează"}</button>
                            <button
                              onClick={e => { e.stopPropagation(); setEditing(null); }}
                              style={{
                                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                                color: "#9ca3af", borderRadius: "8px", padding: "6px 14px",
                                cursor: "pointer", fontSize: "13px"
                              }}
                            >✕ Anulează</button>
                          </>
                        )}
                      </div>

                      {/* Fields grid */}
                      {isEditing ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                          {Object.keys(FIELD_LABELS).map(key => (
                            <div key={key}>
                              <label style={{ fontSize: "12px", color: "#9ca3af", display: "block", marginBottom: "4px" }}>
                                {FIELD_LABELS[key]}
                              </label>
                              <input
                                value={editData[key] || ""}
                                onChange={e => setEditData(prev => ({ ...prev, [key]: e.target.value }))}
                                placeholder="—"
                                style={{
                                  width: "100%", padding: "8px 10px",
                                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)",
                                  borderRadius: "8px", color: "#fff", fontSize: "13px", boxSizing: "border-box"
                                }}
                              />
                            </div>
                          ))}
                          <div style={{ gridColumn: "1/-1" }}>
                            <label style={{ fontSize: "12px", color: "#9ca3af", display: "block", marginBottom: "4px" }}>
                              📝 Observații
                            </label>
                            <textarea
                              value={editData.observatii || ""}
                              onChange={e => setEditData(prev => ({ ...prev, observatii: e.target.value }))}
                              rows={3}
                              style={{
                                width: "100%", padding: "8px 10px",
                                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)",
                                borderRadius: "8px", color: "#fff", fontSize: "13px", boxSizing: "border-box", resize: "vertical"
                              }}
                            />
                          </div>
                        </div>
                      ) : null}

                      {/* Toggled Content: AI Brain vs Chat History */}
                      {viewingBrain === client.id ? (
                        <div style={{ marginTop: "20px", background: "rgba(139,92,246,0.05)", borderRadius: "12px", border: "1px solid rgba(139,92,246,0.3)", padding: "20px" }}>
                          {(() => {
                              const cleanNb = normalizeNotebook(client.clean_notebook);
                              const rez = cleanNb.rezumat_ai || "Nicio memorie AI organică nu a fost generată vizibil încă în conversație.";
                              const xtract = Object.entries(cleanNb).filter(([k, v]) => v && k.indexOf('rezumat') === -1);
                              return (
                                <>
                                  <h4 style={{ fontSize: "14px", fontWeight: "bold", color: "#a5b4fc", margin: "0 0 12px 0", textTransform: "uppercase" }}>🧠 Memoria Extinsă a AI-ului (Adevăr Absolut)</h4>
                                  <div style={{ color: "#c7d2fe", fontSize: "15px", lineHeight: "1.6", whiteSpace: "pre-wrap", marginBottom: "20px" }}>
                                    {rez}
                                  </div>
                                  
                                  {xtract.length > 0 && (
                                    <>
                                      <h5 style={{ fontSize: "12px", color: "#8b5cf6", margin: "0 0 10px 0", textTransform: "uppercase" }}>📋 Date Extrase Structurat:</h5>
                                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                        {xtract.map(([k, v]) => (
                                          <div key={k} style={{
                                            background: "rgba(0,0,0,0.3)", borderRadius: "8px",
                                            padding: k === 'observatii' ? "14px" : "10px 14px", 
                                            border: "1px solid rgba(139,92,246,0.3)",
                                            gridColumn: k === 'observatii' ? "1 / -1" : "auto"
                                          }}>
                                            <div style={{ fontSize: "11px", color: "#8b5cf6", marginBottom: "4px" }}>
                                              {FIELD_LABELS[k] || k}
                                            </div>
                                            <div style={{ fontSize: "14px", color: "#e0e7ff", fontWeight: 500, whiteSpace: "pre-wrap" }}>
                                              {String(v)}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </>
                                  )}
                                </>
                              );
                          })()}
                        </div>
                      ) : viewingDrafts === client.id ? (
                        <div style={{ marginTop: "20px", background: "rgba(245,158,11,0.05)", borderRadius: "12px", border: "1px solid rgba(245,158,11,0.3)", padding: "20px" }}>
                          <h4 style={{ fontSize: "14px", fontWeight: "bold", color: "#fcd34d", margin: "0 0 12px 0", textTransform: "uppercase" }}>🚧 Discuții Deschise (Ciorne Incomplete)</h4>
                          {(() => {
                              const localDrafts = (client.event_drafts || []).filter((d: any) => !['active', 'completed', 'confirmed', 'booked'].includes(d.status));
                              if (localDrafts.length === 0) {
                                  return <div style={{ color: "#9ca3af", fontSize: "14px" }}>Nu există nicio ciornă activă pentru acest client.</div>;
                              }
                              return localDrafts.map((draft, idx) => {
                                  // Extract from METADATA role if available
                                  const metadataRole = (draft.servicii_cerute || []).find((s: any) => s.role_key === 'METADATA');
                                  const metadataPayload = metadataRole?.payload || {};

                                  // Combine flat columns with metadata
                                  const viewFields: Record<string, any> = {
                                      data_eveniment: draft.data_eveniment,
                                      ora_eveniment: draft.ora_eveniment,
                                      locatie: draft.locatie,
                                      nume_sarbatorit: draft.nume_sarbatorit,
                                      ...metadataPayload
                                  };

                                  // Deduplicate semantic overlaps (e.g. date vs data_eveniment)
                                  if (viewFields.date && viewFields.data_eveniment) delete viewFields.data_eveniment;
                                  if (viewFields.location && viewFields.locatie) delete viewFields.locatie;
                                  if (viewFields.time && viewFields.ora_eveniment) delete viewFields.ora_eveniment;
                                  if (viewFields.celebrant && viewFields.nume_sarbatorit) delete viewFields.nume_sarbatorit;
                                  if (viewFields['Nume sarbatorit'] && viewFields.nume_sarbatorit) delete viewFields.nume_sarbatorit;
                                  if (viewFields['Locatie'] && viewFields.locatie) delete viewFields.locatie;
                                  if (viewFields['Locatie'] && viewFields.location) delete viewFields.location;
                                  if (viewFields['Data'] && viewFields.data_eveniment) delete viewFields.data_eveniment;
                                  
                                  // Clean falsy values
                                  Object.keys(viewFields).forEach(k => {
                                      if (!viewFields[k]) delete viewFields[k];
                                  });
                                  
                                  const roles = (draft.servicii_cerute || []).filter((s: any) => s.role_key !== 'METADATA');
                                  
                                  return (
                                     <div key={draft.id} style={{ marginBottom: "16px", background: "rgba(0,0,0,0.3)", padding: "14px", borderRadius: "8px", border: "1px solid rgba(245,158,11,0.2)" }}>
                                         <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                                            <span style={{ color: "#fde68a", fontWeight: "bold" }}>Draft #{idx + 1}</span>
                                            <span style={{ color: "#fbbf24", fontSize: "12px", background: "rgba(0,0,0,0.4)", padding: "2px 8px", borderRadius: "4px" }}>{draft.status || 'draft'}</span>
                                         </div>
                                         <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                             {Object.entries(viewFields).filter(([_, v]) => v).map(([k, v]) => (
                                                <div key={k}>
                                                    <div style={{ fontSize: "11px", color: "#fbbf24" }}>{FIELD_LABELS[k] || k.replace(/_/g, ' ')}</div>
                                                    <div style={{ fontSize: "13px", color: "#fef3c7" }}>
                                                        {Array.isArray(v) ? v.join(', ') : String(v)}
                                                    </div>
                                                </div>
                                             ))}
                                         </div>
                                         {roles.length > 0 && (
                                             <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                                                <div style={{ fontSize: "12px", color: "#fcd34d", marginBottom: "8px" }}>📦 Roluri active:</div>
                                                {roles.map((r: any) => (
                                                    <div key={r.role_key} style={{ fontSize: "13px", color: "#fef3c7", marginLeft: "10px", marginBottom: "4px" }}>
                                                        • <b>{r.role_title || r.role_key}</b>
                                                    </div>
                                                ))}
                                             </div>
                                         )}
                                     </div>
                                  );
                              });
                          })()}
                        </div>
                      ) : viewingConfirmed === client.id ? (
                        <div style={{ marginTop: "20px", background: "rgba(16,185,129,0.05)", borderRadius: "12px", border: "1px solid rgba(16,185,129,0.3)", padding: "20px" }}>
                          <h4 style={{ fontSize: "14px", fontWeight: "bold", color: "#6ee7b7", margin: "0 0 12px 0", textTransform: "uppercase" }}>✅ Evenimente Rezervate Final</h4>
                          {(() => {
                              const localConf = (client.event_drafts || []).filter((d: any) => ['active', 'completed', 'confirmed', 'booked'].includes(d.status));
                              if (localConf.length === 0) {
                                  return <div style={{ color: "#9ca3af", fontSize: "14px" }}>Nu există nicio rezervare clară (închisă) pentru acest client.</div>;
                              }
                              return localConf.map((draft, idx) => {
                                  // Extract from METADATA role if available
                                  const metadataRole = (draft.servicii_cerute || []).find((s: any) => s.role_key === 'METADATA');
                                  const metadataPayload = metadataRole?.payload || {};

                                  // Reconstruct fields
                                  const viewFields: Record<string, any> = {
                                      data_eveniment: draft.data_eveniment,
                                      ora_eveniment: draft.ora_eveniment,
                                      locatie: draft.locatie,
                                      nume_sarbatorit: draft.nume_sarbatorit,
                                      ...metadataPayload
                                  };

                                  // Deduplicate semantic overlaps for confirmed view
                                  if (viewFields.date && viewFields.data_eveniment) delete viewFields.data_eveniment;
                                  if (viewFields.location && viewFields.locatie) delete viewFields.locatie;
                                  if (viewFields.time && viewFields.ora_eveniment) delete viewFields.ora_eveniment;
                                  if (viewFields.celebrant && viewFields.nume_sarbatorit) delete viewFields.nume_sarbatorit;
                                  if (viewFields['Nume sarbatorit'] && viewFields.nume_sarbatorit) delete viewFields.nume_sarbatorit;
                                  if (viewFields['Locatie'] && viewFields.locatie) delete viewFields.locatie;
                                  if (viewFields['Locatie'] && viewFields.location) delete viewFields.location;
                                  if (viewFields['Data'] && viewFields.data_eveniment) delete viewFields.data_eveniment;
                                  
                                  // Clean falsy values
                                  Object.keys(viewFields).forEach(k => {
                                      if (!viewFields[k]) delete viewFields[k];
                                  });
                                  
                                  const roles = (draft.servicii_cerute || []).filter((s: any) => s.role_key !== 'METADATA');
                                  
                                  return (
                                     <div key={draft.id} style={{ marginBottom: "16px", background: "rgba(0,0,0,0.3)", padding: "14px", borderRadius: "8px", border: "1px solid rgba(16,185,129,0.2)" }}>
                                         <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                                            <span style={{ color: "#a7f3d0", fontWeight: "bold" }}>Eveniment Confirmat #{idx + 1}</span>
                                            <span style={{ color: "#6ee7b7", fontSize: "12px", background: "rgba(0,0,0,0.4)", padding: "2px 8px", borderRadius: "4px" }}>{draft.status || 'booked'}</span>
                                         </div>
                                         <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                             {Object.entries(viewFields).filter(([_, v]) => v).map(([k, v]) => (
                                                <div key={k}>
                                                    <div style={{ fontSize: "11px", color: "#34d399" }}>{FIELD_LABELS[k] || k.replace(/_/g, ' ')}</div>
                                                    <div style={{ fontSize: "13px", color: "#ecfdf5" }}>
                                                        {Array.isArray(v) ? v.join(', ') : String(v)}
                                                    </div>
                                                </div>
                                             ))}
                                         </div>
                                         {roles.length > 0 && (
                                             <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                                                <div style={{ fontSize: "12px", color: "#6ee7b7", marginBottom: "8px" }}>📦 Roluri Confirmate:</div>
                                                {roles.map((r: any) => (
                                                    <div key={r.role_key} style={{ fontSize: "13px", color: "#ecfdf5", marginLeft: "10px", marginBottom: "4px" }}>
                                                        • <b>{r.role_title || r.role_key}</b>
                                                    </div>
                                                ))}
                                             </div>
                                         )}
                                     </div>
                                  );
                              });
                          })()}
                        </div>
                      ) : chatHistory !== null ? (
                          <div style={{ marginTop: "20px", background: "rgba(0,0,0,0.4)", borderRadius: "12px", padding: "16px", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "75vh", overflowY: "auto" }}>
                              <h4 style={{ fontSize: "14px", fontWeight: "bold", color: "#e2e8f0", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                                💬 Istoric Conversație
                              </h4>
                              {chatHistory.length === 0 ? (
                                  <div style={{ fontSize: "13px", color: "#9ca3af", textAlign: "center", padding: "10px" }}>Niciun mesaj găsit.</div>
                              ) : (
                                  chatHistory.map((m, i) => {
                                      const isClient = m.sender_type === "client";
                                      return (
                                        <div key={i} style={{ marginBottom: "12px", display: "flex", justifyContent: isClient ? "flex-start" : "flex-end", width: "100%" }}>
                                            <div style={{ 
                                                background: isClient ? "rgba(255,255,255,0.1)" : "rgba(147,51,234,0.6)", 
                                                padding: "10px 14px", 
                                                borderRadius: "14px", 
                                                borderTopLeftRadius: isClient ? "4px" : "14px",
                                                borderTopRightRadius: isClient ? "14px" : "4px",
                                                maxWidth: "85%", fontSize: "13px", color: "#fff", whiteSpace: "pre-wrap",
                                                boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
                                            }}>
                                                <div style={{ fontSize: "10px", color: isClient ? "#9ca3af" : "#d8b4fe", marginBottom: "4px", display: "flex", justifyContent: "space-between" }}>
                                                    <span>{isClient ? "👤 Client" : "🤖 / 👷 Noi"}</span>
                                                    <span style={{ marginLeft: "10px" }}>{new Date(m.created_at).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}</span>
                                                </div>
                                                {m.content}
                                            </div>
                                        </div>
                                      );
                                  })
                              )}
                          </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary footer */}
      {!loading && (
        <div style={{ textAlign: "center", color: "#4b5563", fontSize: "12px", marginTop: "20px" }}>
          {filteredClients.length} clienți • Memorie se actualizează automat la fiecare 30 mesaje noi
        </div>
      )}
    </div>
  );
}
