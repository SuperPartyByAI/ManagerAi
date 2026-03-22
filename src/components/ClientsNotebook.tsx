"use client";

import { useState, useEffect, useCallback } from "react";

interface ClientNotebook {
  id: string;
  phone_number: string;
  wa_number: string;
  brand_key: string | null;
  clean_notebook: any;
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
  data_eveniment: "📅 Data evenimentului",
  ora_eveniment: "🕐 Ora",
  serviciu: "🎪 Serviciu",
  personaj: "🦸 Personaj",
  locatie: "📍 Locație",
  pret_discutat: "💰 Preț discutat",
  nr_copii: "👶 Nr. copii",
  varsta_copil: "🎂 Vârsta copilului",
  metoda_plata: "💳 Metodă plată",
  status_confirmat: "✅ Status",
  observatii: "📝 Observații",
};

export default function ClientsNotebook() {
  const [clients, setClients] = useState<ClientNotebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [viewAiMemory, setViewAiMemory] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [chatHistory, setChatHistory] = useState<any[] | null>(null);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/client-notebooks?_t=" + Date.now()); // Sursa extinsă: toate QR-urile!
      const data = await res.json();
      if (data.notebooks && Array.isArray(data.notebooks)) {
        const mapped = data.notebooks.map((n: any) => ({
           id: n.client_id,
           phone_number: n.phone_number,
           wa_number: n.brand_key || '',
           brand_key: n.brand_key,
           clean_notebook: n.extracted_data || {},
           summary_updated_at: n.last_message_at || new Date().toISOString(),
           created_at: n.last_message_at || new Date().toISOString(),
           alias: n.alias
        }));
        setClients(mapped);
      } else {
        setClients([]);
      }
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);
  console.log("[ClientsNotebook] Toți clienții primiți:", clients.length);

  // Când schimbăm clientul deschis, încărcăm chat-ul automat
  useEffect(() => {
     setChatHistory(null);
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
            const nbFields = Object.entries(normalizeNotebook(client.clean_notebook)).filter(([k, v]) => v && k !== 'rezumat_ai');

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
                          <div style={{ display: "flex", gap: "10px" }}>
                            <button
                              onClick={e => { e.stopPropagation(); startEdit(client); }}
                              style={{
                                background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)",
                                color: "#a5b4fc", borderRadius: "8px", padding: "6px 14px",
                                cursor: "pointer", fontSize: "13px"
                              }}
                            >✏️ Editează</button>
                            <button
                              onClick={e => { e.stopPropagation(); setViewAiMemory(client.id); }}
                              style={{
                                background: "rgba(168,85,247,0.2)", border: "1px solid rgba(168,85,247,0.4)",
                                color: "#d8b4fe", borderRadius: "8px", padding: "6px 14px",
                                cursor: "pointer", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px"
                              }}
                            >🧠 Adevăr AI</button>
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
                      ) : nbFields.length > 0 ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                          {nbFields.map(([k, v]) => (
                            <div key={k} style={{
                              background: "rgba(255,255,255,0.03)", borderRadius: "8px",
                              padding: k === 'rezumat_ai' || k === 'observatii' ? "14px" : "10px 14px", 
                              border: "1px solid rgba(255,255,255,0.06)",
                              gridColumn: k === 'rezumat_ai' || k === 'observatii' ? "1 / -1" : "auto"
                            }}>
                              <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>
                                {FIELD_LABELS[k] || k}
                              </div>
                              <div style={{ fontSize: "14px", color: "#e2e8f0", fontWeight: 500, whiteSpace: "pre-wrap" }}>
                                {String(v)}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {/* Chat History block */}
                      {chatHistory !== null && (
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
                      )}
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

      {/* AI Memory Modal Overlay */}
      {viewAiMemory && (() => {
         const activeClient = clients.find(c => c.id === viewAiMemory);
         const rezumat = normalizeNotebook(activeClient?.clean_notebook)?.rezumat_ai || "Nicio memorie AI organică nu a fost generată vizibil încă în conversație.";
         return (
         <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "20px" }}>
             <div style={{ background: "#1e1b4b", borderRadius: "16px", padding: "24px", maxWidth: "800px", width: "100%", border: "1px solid rgba(139,92,246,0.5)", boxShadow: "0 10px 40px rgba(0,0,0,0.8)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid rgba(139,92,246,0.2)", paddingBottom: "12px" }}>
                    <h3 style={{ margin: 0, color: "#e0e7ff", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
                      🧠 Creier AI - Sumar {activeClient?.phone_number} (Adevăr Absolut)
                    </h3>
                    <button onClick={() => setViewAiMemory(null)} style={{ background: "transparent", border: "none", color: "#9ca3af", fontSize: "20px", cursor: "pointer" }}>✕</button>
                </div>
                <div style={{ color: "#c7d2fe", fontSize: "16px", lineHeight: "1.6", overflowY: "auto", flex: 1, whiteSpace: "pre-wrap", paddingRight: "8px" }}>
                    {rezumat}
                </div>
             </div>
         </div>
         );
      })()}
    </div>
  );
}
