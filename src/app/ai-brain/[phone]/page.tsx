"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

function normalizeNotebook(nb: any): Record<string, string> {
  if (!nb) return {};
  if (Array.isArray(nb)) return nb[0] || {}; 
  return nb;
}

const FIELD_LABELS: Record<string, string> = {
  data_eveniment: "📅 Data evenimentului",
  ora_eveniment: "🕐 Ora",
  locatie_judet: "🗺️ Județ",
  locatie_oras: "🏙️ Oraș/Comună",
  brand_key: "🏷️ Brand",
  duration: "⏱️ Durată",
  location: "📍 Locație vizată",
  observatii: "📝 Observații",
  pret_discutat: "💰 Preț discutat",
  rol_detectat: "🎭 Rol detectat",
};

export default function AiBrainPage() {
  const { phone } = useParams();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    async function loadClient() {
      try {
        const response = await fetch('/api/admin/client-notebooks?_t=' + Date.now());
        const dataJson = await response.json();
        if (dataJson.notebooks && Array.isArray(dataJson.notebooks)) {
            const mapped = dataJson.notebooks.map((n: any) => ({
               id: n.client_id,
               phone_number: n.phone_number,
               brand_key: n.brand_key,
               clean_notebook: n.extracted_data || {}
            }));
            const foundClient = mapped.find((c: any) => c.phone_number === decodeURIComponent(phone as string));
            setData(foundClient || null);
        } else {
            setData(null);
        }
      } catch (e) {
        console.error("Error loading ai brain", e);
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    loadClient();
  }, [phone]);

  if (loading) {
    return (
      <div style={{ background: "#0f172a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#e2e8f0" }}>
        Se accesează memoria Adevărului Universal...
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ background: "#0f172a", minHeight: "100vh", padding: "40px", color: "#e2e8f0" }}>
        <button onClick={() => router.back()} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", marginBottom: "20px" }}>
          🡐 Înapoi
        </button>
        <h1>404 - Memoria nu a fost găsită</h1>
        <p>Nu există date pentru numărul: {decodeURIComponent(phone as string)}</p>
      </div>
    );
  }

  const cleanNb = normalizeNotebook(data.clean_notebook);
  const rezumat = cleanNb.rezumat_ai || "Nicio memorie AI organică nu a fost generată vizibil încă în conversație.";
  const extractedFields = Object.entries(cleanNb).filter(([k, v]) => v && k.indexOf('rezumat') === -1);

  return (
    <div style={{ background: "#0f172a", minHeight: "100vh", fontFamily: "sans-serif", color: "#e2e8f0" }}>
      {/* Header bar */}
      <div style={{ background: "#1e1b4b", borderBottom: "1px solid rgba(139,92,246,0.3)", padding: "20px 40px", display: "flex", alignItems: "center", gap: "20px" }}>
        <button 
          onClick={() => router.back()} 
          style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}>
          🡐 Către Agendă
        </button>
        <h1 style={{ margin: 0, fontSize: "24px", color: "#e0e7ff", display: "flex", alignItems: "center", gap: "10px" }}>
          🧠 Creier AI - Sumar {data.phone_number} (Adevăr Absolut)
        </h1>
      </div>

      <div style={{ padding: "40px", maxWidth: "1200px", margin: "0 auto" }}>
        
        {/* The Text Summary */}
        <div style={{ background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.4)", borderRadius: "16px", padding: "30px", marginBottom: "40px", boxShadow: "0 10px 40px rgba(0,0,0,0.3)" }}>
          <h2 style={{ fontSize: "16px", color: "#a5b4fc", marginTop: 0, marginBottom: "20px", textTransform: "uppercase", letterSpacing: "1px" }}>
            Rezumarea Conversației
          </h2>
          <div style={{ color: "#c7d2fe", fontSize: "18px", lineHeight: "1.7", whiteSpace: "pre-wrap" }}>
            {rezumat}
          </div>
        </div>

        {/* The Extracted Fields */}
        <div style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", padding: "30px" }}>
          <h2 style={{ fontSize: "16px", color: "#9ca3af", marginTop: 0, marginBottom: "20px", textTransform: "uppercase", letterSpacing: "1px" }}>
            📋 Date Structurate Parametrice Extrase de AI
          </h2>
          
          {extractedFields.length === 0 ? (
            <p style={{ color: "#6b7280" }}>Nu există altă memorie extrasă încă.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              {extractedFields.map(([k, v]) => (
                <div key={k} style={{
                  background: "rgba(255,255,255,0.03)", borderRadius: "12px",
                  padding: k === 'observatii' ? "20px" : "16px 20px", 
                  border: "1px solid rgba(255,255,255,0.06)",
                  gridColumn: k === 'observatii' ? "1 / -1" : "auto"
                }}>
                  <div style={{ fontSize: "13px", color: "#8b5cf6", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "bold" }}>
                    {FIELD_LABELS[k] || k}
                  </div>
                  <div style={{ fontSize: "16px", color: "#f8fafc", fontWeight: 500, whiteSpace: "pre-wrap", lineHeight: "1.5" }}>
                    {String(v)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
