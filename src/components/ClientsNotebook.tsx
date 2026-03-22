"use client";

import { useState, useEffect, useCallback } from "react";

interface ClientNotebook {
  id: string;
  phone_number: string;
  wa_number: string;
  brand_key: string | null;
  clean_notebook: Record<string, string> | Record<string, string>[];
  summary_updated_at: string;
  created_at: string;
}

// Helper: normalizează clean_notebook — poate fi array sau obiect
function normalizeNotebook(nb: Record<string, string> | Record<string, string>[] | null): Record<string, string> {
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
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/clients-notebook");
      const data = await res.json();
      setClients(Array.isArray(data) ? data : []);
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);
  console.log("[ClientsNotebook] Toți clienții primiți:", clients.length);

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

  const deleteClient = async (client: ClientNotebook) => {
    if (!confirm(`Ștergi memoria clientului ${client.phone_number}?`)) return;
    await fetch("/api/admin/clients-notebook", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone_number: client.phone_number, wa_number: client.wa_number }),
    });
    await fetchClients();
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto", overflowY: "auto", maxHeight: "calc(100vh - 180px)" }}>
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
            const nbFields = Object.entries(normalizeNotebook(client.clean_notebook)).filter(([, v]) => v);

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
                          <button
                            onClick={e => { e.stopPropagation(); startEdit(client); }}
                            style={{
                              background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)",
                              color: "#a5b4fc", borderRadius: "8px", padding: "6px 14px",
                              cursor: "pointer", fontSize: "13px"
                            }}
                          >✏️ Editează</button>
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
                        <button
                          onClick={e => { e.stopPropagation(); deleteClient(client); }}
                          style={{
                            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                            color: "#fca5a5", borderRadius: "8px", padding: "6px 14px",
                            cursor: "pointer", fontSize: "13px", marginLeft: "auto"
                          }}
                        >🗑️ Șterge memorie</button>
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
                              padding: "10px 14px", border: "1px solid rgba(255,255,255,0.06)"
                            }}>
                              <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>
                                {FIELD_LABELS[k] || k}
                              </div>
                              <div style={{ fontSize: "14px", color: "#e2e8f0", fontWeight: 500 }}>
                                {String(v)}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ color: "#6b7280", fontSize: "13px", textAlign: "center", padding: "20px 0" }}>
                          📭 Notebook gol — AI-ul va completa automat după 30+ mesaje.
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
    </div>
  );
}
