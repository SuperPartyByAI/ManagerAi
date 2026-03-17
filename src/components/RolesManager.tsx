"use client";

import { useState, useEffect, useCallback } from "react";

type Role = {
  id: string;
  title: string;
  content: string;
  is_active: boolean;
  brand_key: string;
};

/* Parse content into 3 parts */
function parseContent(c: string) {
  const lines = c.split("\n");
  let serviciu = "", taguri = "", detalii = "";
  for (const l of lines) {
    const lower = l.toLowerCase();
    if (lower.startsWith("serviciu:")) serviciu = l.replace(/^serviciu:\s*/i, "").trim();
    else if (lower.startsWith("tag-uri:") || lower.startsWith("taguri:")) taguri = l.replace(/^tag-?uri:\s*/i, "").trim();
    else if (lower.includes("obligatorii")) detalii = l.split(":").slice(1).join(":").trim();
  }
  return { serviciu, taguri, detalii };
}

function buildContent(serviciu: string, taguri: string, detalii: string) {
  return `Serviciu: ${serviciu}\nTag-uri: ${taguri}\nDetalii obligatorii de colectat: ${detalii}`;
}

export default function RolesManager() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [editedTitle, setEditedTitle] = useState("");
  const [editServiciu, setEditServiciu] = useState("");
  const [editTaguri, setEditTaguri] = useState("");
  const [editDetalii, setEditDetalii] = useState("");

  const fetchRoles = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/vertex/sources?brand=GLOBAL");
      const data = await res.json();
      const roleSources: Role[] = (data.sources || [])
        .filter((s: { category: string }) => s.category === "rol")
        .map((s: { id: string; title: string; content: string; is_active: boolean; brand_key: string }) => ({
          id: s.id, title: s.title || "Rol", content: s.content || "",
          is_active: s.is_active !== false, brand_key: s.brand_key || "GLOBAL",
        }));
      setRoles(roleSources);
      if (roleSources.length > 0 && !activeRoleId) setActiveRoleId(roleSources[0].id);
    } catch (err) { console.warn("Could not load roles:", err); }
    finally { setIsLoading(false); }
  }, [activeRoleId]);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  const activeRole = roles.find(r => r.id === activeRoleId) || roles[0] || null;

  useEffect(() => {
    if (activeRole) {
      setEditedTitle(activeRole.title);
      const p = parseContent(activeRole.content);
      setEditServiciu(p.serviciu);
      setEditTaguri(p.taguri);
      setEditDetalii(p.detalii);
    }
  }, [activeRole]);

  const saveRole = async () => {
    if (!activeRoleId) return;
    setIsSaving(true);
    const content = buildContent(editServiciu, editTaguri, editDetalii);
    try {
      const res = await fetch("/api/vertex/sources", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeRoleId, title: editedTitle, content }),
      });
      if (res.ok) {
        setRoles(prev => prev.map(r => r.id === activeRoleId ? { ...r, title: editedTitle, content } : r));
      } else {
        const d = await res.json();
        alert("Eroare: " + (d.error || "Necunoscută"));
      }
    } finally { setIsSaving(false); }
  };

  const createRole = async () => {
    const content = buildContent("Descriere serviciu nou...", "tag1, tag2", "Data Evenimentului, Locația");
    const res = await fetch("/api/vertex/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand: "GLOBAL", title: "Rol Nou", content, category: "rol" }),
    });
    const data = await res.json();
    if (res.ok && data.source) {
      const nr: Role = { id: data.source.id, title: data.source.title, content: data.source.content, is_active: true, brand_key: "GLOBAL" };
      setRoles(prev => [...prev, nr]);
      setActiveRoleId(nr.id);
    }
  };

  const deleteRole = async (id: string) => {
    if (!confirm("Sigur vrei să ștergi acest rol?")) return;
    const res = await fetch(`/api/vertex/sources?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setRoles(prev => prev.filter(r => r.id !== id));
      if (activeRoleId === id) setActiveRoleId(null);
    }
  };

  const tagList = editTaguri.split(",").map(t => t.trim()).filter(Boolean);
  const detaliiList = editDetalii.split(",").map(t => t.trim()).filter(Boolean);

  if (isLoading) {
    return (
      <main className="flex-1 flex overflow-hidden p-4 gap-4">
        <div className="flex-1 flex items-center justify-center text-[var(--color-dim)] animate-pulse">Se încarcă rolurile...</div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex overflow-hidden p-4 gap-4">
      {/* Left: Role List */}
      <section className="w-80 glass-panel rounded-2xl flex flex-col overflow-hidden shrink-0">
        <header className="px-4 py-3 border-b border-[var(--color-border)] bg-black/40 flex justify-between items-center shrink-0">
          <h2 className="font-semibold flex items-center gap-2">
            <span className="text-lg">🤖</span> Roluri Servicii
            <span className="bg-purple-600/30 text-purple-300 text-[10px] px-2 py-0.5 rounded-full font-bold">{roles.length}</span>
          </h2>
          <button onClick={createRole} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-2 py-1 rounded transition-colors">+ Nou</button>
        </header>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {roles.map(role => (
            <button key={role.id} onClick={() => setActiveRoleId(role.id)}
              className={`w-full text-left p-3 rounded-xl transition-all border ${activeRoleId === role.id ? "bg-purple-600/20 border-purple-500/50" : "bg-black/20 border-transparent hover:bg-white/5 hover:border-[var(--color-border)]"}`}>
              <div className="font-semibold text-sm mb-1 flex items-center gap-2">
                {role.is_active ? "🟢" : "🔴"} {role.title}
              </div>
              <div className="text-[10px] text-[var(--color-dim)] line-clamp-1">{parseContent(role.content).serviciu}</div>
            </button>
          ))}
          {roles.length === 0 && <div className="text-center text-[var(--color-dim)] text-sm py-8">Niciun rol. Apasă <strong>+ Nou</strong>.</div>}
        </div>
      </section>

      {/* Right: Editor */}
      <section className="flex-1 glass-panel rounded-2xl flex flex-col overflow-hidden">
        {activeRole ? (
          <>
            <header className="px-6 py-4 border-b border-[var(--color-border)] bg-black/40 flex justify-between items-center shrink-0">
              <div className="flex-1 mr-4">
                <input type="text" value={editedTitle} onChange={e => setEditedTitle(e.target.value)}
                  className="text-xl font-bold bg-transparent border-b border-transparent hover:border-purple-500/30 focus:border-purple-500 focus:outline-none transition-all w-full" />
                <div className="text-xs text-[var(--color-dim)] mt-1">Brand: {activeRole.brand_key}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => deleteRole(activeRole.id)}
                  className="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white px-3 py-2 rounded-lg text-sm transition-all border border-red-500/20">
                  🗑 Șterge
                </button>
                <button onClick={saveRole} disabled={isSaving}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-lg font-medium text-sm transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50">
                  {isSaving ? "Se salvează..." : "💾 Salvează"}
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* 1. Serviciu */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">📋</span>
                  <h3 className="font-bold uppercase tracking-wider text-sm text-[var(--color-dim)]">Serviciu</h3>
                </div>
                <p className="text-[10px] text-[var(--color-dim)] mb-2">Descrierea serviciului — ce oferim clientului.</p>
                <textarea value={editServiciu} onChange={e => setEditServiciu(e.target.value)}
                  className="w-full h-20 bg-black/40 border border-[var(--color-border)] rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all" />
              </div>

              <hr className="border-[var(--color-border)]" />

              {/* 2. Tag-uri */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🏷️</span>
                  <h3 className="font-bold uppercase tracking-wider text-sm text-[var(--color-dim)]">Tag-uri</h3>
                </div>
                <p className="text-[10px] text-[var(--color-dim)] mb-2">Cuvinte cheie separate prin virgulă. AI-ul caută aceste cuvinte în mesajele clienților pentru a identifica serviciul.</p>
                <input type="text" value={editTaguri} onChange={e => setEditTaguri(e.target.value)}
                  className="w-full bg-black/40 border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all"
                  placeholder="animator, elsa, spiderman, mascota..." />
                {tagList.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {tagList.map(tag => (
                      <span key={tag} className="text-[11px] text-blue-300 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20 font-medium">
                        🏷️ {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <hr className="border-[var(--color-border)]" />

              {/* 3. Detalii Obligatorii */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">📌</span>
                  <h3 className="font-bold uppercase tracking-wider text-sm text-[var(--color-dim)]">Detalii Obligatorii</h3>
                </div>
                <p className="text-[10px] text-[var(--color-dim)] mb-2">Ce informații trebuie colectate de AI înainte de a face ofertă. Separate prin virgulă.</p>
                <input type="text" value={editDetalii} onChange={e => setEditDetalii(e.target.value)}
                  className="w-full bg-black/40 border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all"
                  placeholder="Data Evenimentului, Locația, Număr Copii..." />
                {detaliiList.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {detaliiList.map(d => (
                      <span key={d} className="text-[11px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 font-medium">
                        ✅ {d}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col justify-center items-center text-[var(--color-dim)]">
            <p>Selectează un rol din stânga pentru a-l edita.</p>
          </div>
        )}
      </section>
    </main>
  );
}
