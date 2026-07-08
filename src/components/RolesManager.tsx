"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type Role = {
  id: string;
  title: string;
  content: string;
  is_active: boolean;
  brand_identifier: string;
  policy_config?: any;
};

type ConstraintItem = {
  name: string;
  required: boolean;
  niceToHave: boolean;
};

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

export default function RolesManager() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [editedTitle, setEditedTitle] = useState("");
  const [editServiciu, setEditServiciu] = useState("");
  const [editTaguri, setEditTaguri] = useState("");
  const [constraintItems, setConstraintItems] = useState<ConstraintItem[]>([]);
  const [editCustomPrompts, setEditCustomPrompts] = useState<Record<string, string>>({});

  const dragRef = useRef<{ from: number; list: ConstraintItem[] } | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const fetchRoles = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/roles?brand=GLOBAL");
      if (!res.ok) throw new Error("Fetch warning");
      const data = await res.json();
      const roleSources: Role[] = (data.sources || []);
      setRoles(roleSources);
      if (roleSources.length > 0 && !activeRoleId) setActiveRoleId(roleSources[0].id);
    } catch (err) { console.warn("Could not load roles:", err); }
    finally { setIsLoading(false); }
  }, [activeRoleId]);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  const activeRole = roles.find(r => r.id === activeRoleId) || roles[0] || null;

  useEffect(() => {
    if (!activeRole) return;
    setEditedTitle(activeRole.title);
    const p = parseContent(activeRole.content);
    const conf = activeRole.policy_config || {};
    const isJsonReady = Object.keys(conf).length > 0;

    setEditServiciu(isJsonReady && conf.label ? conf.label : p.serviciu);

    const tags = Array.from(new Set([
      ...(conf.triggers?.service_tags || []),
      ...(conf.triggers?.keywords || []),
    ]));
    setEditTaguri(isJsonReady && tags.length > 0 ? tags.join(', ') : p.taguri);

    const mustFields: string[] = conf.constraints?.must_collect_fields || [];
    const niceFields: string[] = conf.constraints?.nice_to_have_fields || [];
    const allNames = isJsonReady && (mustFields.length > 0 || niceFields.length > 0)
      ? [...new Set([...mustFields, ...niceFields])]
      : p.detalii.split(",").map((f: string) => f.trim()).filter(Boolean);

    setConstraintItems(allNames.map(name => ({
      name,
      required: mustFields.includes(name) || !isJsonReady,
      niceToHave: niceFields.includes(name),
    })));

    setEditCustomPrompts(conf.copy_blocks?.custom_prompts || {});
  }, [activeRole]);

  const saveRole = async () => {
    if (!activeRoleId) return;
    setIsSaving(true);
    const newTags = editTaguri.split(",").map(t => t.trim()).filter(Boolean);
    const mustCollect = constraintItems.filter(c => c.required).map(c => c.name.trim()).filter(Boolean);
    const niceToHave = constraintItems.filter(c => c.niceToHave && !c.required).map(c => c.name.trim()).filter(Boolean);
    const allNames = constraintItems.map(c => c.name.trim()).filter(Boolean);
    const cleanPrompts: Record<string, string> = {};
    for (const f of allNames) { if (editCustomPrompts[f]) cleanPrompts[f] = editCustomPrompts[f]; }

    const policy_config = {
      label: editServiciu,
      active: true,
      priority: activeRole?.policy_config?.priority || 100,
      triggers: {
        keywords: newTags,
        service_tags: activeRole?.policy_config?.triggers?.service_tags || ['generic_tag'],
        min_confidence: activeRole?.policy_config?.triggers?.min_confidence || 0.35
      },
      pricing_rules: activeRole?.policy_config?.pricing_rules || null,
      constraints: {
        allow_discounts: activeRole?.policy_config?.constraints?.allow_discounts || false,
        must_collect_fields: mustCollect,
        nice_to_have_fields: niceToHave,
        must_not_confirm_availability: true,
        must_not_override_approved_prices: true
      },
      copy_blocks: {
        intro: activeRole?.policy_config?.copy_blocks?.intro || "",
        upsell: activeRole?.policy_config?.copy_blocks?.upsell || "",
        custom_prompts: cleanPrompts
      }
    };

    try {
      const res = await fetch("/api/admin/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeRoleId, title: editedTitle, policy_config, is_active: true }),
      });
      if (res.ok) {
        setRoles(prev => prev.map(r => r.id === activeRoleId ? { ...r, title: editedTitle, policy_config } : r));
        alert(`Salvat! 🔴 Câmpuri obligatorii: ${mustCollect.length} | 🟡 Bine de avut: ${niceToHave.length}`);
      } else {
        const d = await res.json();
        alert("Eroare la Salvare: " + (d.error || "Necunoscută"));
      }
    } finally { setIsSaving(false); }
  };

  const createRole = async () => {
    const policy_config = {
      label: "Descriere serviciu nou...",
      triggers: { keywords: ["tag1", "tag2"], service_tags: ["new_service"] },
      constraints: { must_collect_fields: ["Data Evenimentului", "Locația"], nice_to_have_fields: [] },
      copy_blocks: { custom_prompts: {} }
    };
    const res = await fetch("/api/admin/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_identifier: "GLOBAL", title: "Rol Nou", policy_config }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.source) { setRoles(prev => [data.source, ...prev]); setActiveRoleId(data.source.id); }
    }
  };

  const deleteRole = async (id: string) => {
    if (!confirm("Sigur vrei să ștergi acest rol DEFINITIV din Creierul AI?")) return;
    const res = await fetch(`/api/admin/roles`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    if (res.ok) {
      setRoles(prev => prev.filter(r => r.id !== id));
      if (activeRoleId === id) setActiveRoleId(null);
    }
  };

  const tagList = editTaguri.split(",").map(t => t.trim()).filter(Boolean);
  const handleCustomPromptChange = (field: string, val: string) => setEditCustomPrompts(prev => ({ ...prev, [field]: val }));

  const dragStart = (index: number) => { dragRef.current = { from: index, list: [...constraintItems] }; setDragOverIndex(index); };
  const dragEnter = (index: number) => {
    if (!dragRef.current || dragRef.current.from === index) return;
    setDragOverIndex(index);
    const newList = [...dragRef.current.list];
    const [moved] = newList.splice(dragRef.current.from, 1);
    newList.splice(index, 0, moved);
    dragRef.current = { from: index, list: newList };
    setConstraintItems(newList);
  };
  const dragEnd = () => { dragRef.current = null; setDragOverIndex(null); };

  const addConstraint = () => setConstraintItems([...constraintItems, { name: `Câmp Nou ${constraintItems.length + 1}`, required: false, niceToHave: false }]);

  const updateConstraintName = (oldName: string, newName: string, idx: number) => {
    const list = [...constraintItems];
    list[idx] = { ...list[idx], name: newName };
    setConstraintItems(list);
    if (oldName !== newName) {
      setEditCustomPrompts(prev => {
        const d = { ...prev };
        if (d[oldName] !== undefined) { d[newName] = d[oldName]; delete d[oldName]; }
        return d;
      });
    }
  };

  // Mutual exclusive: Obligatoriu XOR Bine de Avut
  const toggleRequired = (idx: number) => {
    const list = [...constraintItems];
    const current = list[idx].required;
    list[idx] = { ...list[idx], required: !current, niceToHave: false };
    setConstraintItems(list);
  };

  const toggleNiceToHave = (idx: number) => {
    const list = [...constraintItems];
    const current = list[idx].niceToHave;
    list[idx] = { ...list[idx], niceToHave: !current, required: false };
    setConstraintItems(list);
  };

  const removeConstraint = (idx: number) => {
    const list = [...constraintItems];
    const removedName = list[idx].name;
    list.splice(idx, 1);
    setConstraintItems(list);
    setEditCustomPrompts(prev => { const d = { ...prev }; delete d[removedName]; return d; });
  };

  const mandatoryCount = constraintItems.filter(c => c.required).length;
  const niceCount = constraintItems.filter(c => c.niceToHave && !c.required).length;

  if (isLoading) {
    return (
      <main className="flex-1 flex overflow-hidden p-4 gap-4">
        <div className="flex-1 flex items-center justify-center text-[var(--color-dim)] animate-pulse">Se sincronizează rolurile cu Creierul AI...</div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex overflow-hidden p-4 gap-4">
      {/* Left: Role List */}
      <section className="w-80 glass-panel rounded-2xl flex flex-col overflow-hidden shrink-0">
        <header className="px-4 py-3 border-b border-[var(--color-border)] bg-black/40 flex justify-between items-center shrink-0">
          <h2 className="font-semibold flex items-center gap-2">
            <span className="text-lg">🤖</span> Model AI
            <span className="bg-purple-600/30 text-purple-300 text-[10px] px-2 py-0.5 rounded-full font-bold">{roles.length}</span>
          </h2>
          <button onClick={createRole} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-2 py-1 rounded transition-colors">+ Nou</button>
        </header>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {roles.map(role => {
            const labelStr = role.policy_config?.label || parseContent(role.content).serviciu || "Nespecificat";
            return (
              <button key={role.id} onClick={() => setActiveRoleId(role.id)}
                className={`w-full text-left p-3 rounded-xl transition-all border ${activeRoleId === role.id ? "bg-purple-600/20 border-purple-500/50" : "bg-black/20 border-transparent hover:bg-white/5 hover:border-[var(--color-border)]"}`}>
                <div className="font-semibold text-sm mb-1 flex items-center gap-2 line-clamp-1">
                  {role.is_active ? "🟢" : "🔴"} {role.title}
                </div>
                <div className="text-[10px] text-[var(--color-dim)] line-clamp-1">{labelStr}</div>
              </button>
            );
          })}
          {roles.length === 0 && <div className="text-center text-[var(--color-dim)] text-sm py-8">Baza de Date goală.</div>}
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
                <div className="text-xs text-[var(--color-dim)] mt-1">Conectat vizual la baza de date nativă de prețuri și roluri din ManagerAI!</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => deleteRole(activeRole.id)}
                  className="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white px-3 py-2 rounded-lg text-sm transition-all border border-red-500/20">
                  🗑 Șterge
                </button>
                <button onClick={saveRole} disabled={isSaving}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-lg font-medium text-sm transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50">
                  {isSaving ? "Se salvează..." : "💾 Salvează în Nativ AI"}
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* 1. Serviciu */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">📋</span>
                  <h3 className="font-bold uppercase tracking-wider text-sm text-[var(--color-dim)]">Serviciu / Label</h3>
                </div>
                <p className="text-[10px] text-[var(--color-dim)] mb-2">Descrierea generală a ofertei (invizibilă publicului, utilă AI).</p>
                <textarea value={editServiciu} onChange={e => setEditServiciu(e.target.value)}
                  className="w-full h-16 bg-black/40 border border-[var(--color-border)] rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all shadow-inner" />
              </div>

              <hr className="border-[var(--color-border)] opacity-50" />

              {/* 2. Tag-uri */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🏷️</span>
                  <h3 className="font-bold uppercase tracking-wider text-sm text-[var(--color-dim)]">Tag-uri de Declansare</h3>
                </div>
                <p className="text-[10px] text-[var(--color-dim)] mb-2">Cuvinte cheie (separate prin virgulă). Prezența lor trezește AI-ul pe această ofertă.</p>
                <input type="text" value={editTaguri} onChange={e => setEditTaguri(e.target.value)}
                  className="w-full bg-black/40 border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500 transition-all font-mono"
                  placeholder="spiderman, popcorn, ursitoare..." />
                {tagList.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {tagList.map(tag => (
                      <span key={tag} className="text-[11px] text-blue-300 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20 font-medium tracking-wide">{tag}</span>
                    ))}
                  </div>
                )}
              </div>

              <hr className="border-[var(--color-border)] opacity-50" />

              {/* 3. Constrângeri cu DOUĂ niveluri */}
              <div className="bg-purple-900/10 p-5 rounded-2xl border border-purple-500/20">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📌</span>
                    <h3 className="font-bold uppercase tracking-wider text-sm text-purple-300">Constangeri & Formula de Întrebare</h3>
                  </div>
                  <div className="flex gap-2 text-[10px] shrink-0">
                    <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 font-bold">🔴 {mandatoryCount} Obligatorii</span>
                    <span className="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 font-bold">🟡 {niceCount} Bine de Avut</span>
                  </div>
                </div>
                <p className="text-xs text-[var(--color-dim)] mb-2">
                  Ordinea vizuală stabilită mai jos dictează SECVENȚA EXACTĂ (1 by 1) în care asistentul virtual va adresa întrebările clientului.
                  <strong className="block mt-1 text-purple-300">Tip: Trageți de carduri cu mouse-ul (Drag & Drop) pentru a reordona prioritățile sistemului!</strong>
                </p>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 text-[10px] mb-4 p-3 bg-black/30 rounded-lg border border-white/5">
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded bg-red-500 border border-red-400 flex items-center justify-center text-[9px] font-black text-white">✓</span>
                    <span className="text-red-300 font-bold">Obligatoriu</span> <span className="text-gray-500">= evenimentul NU trece la Confirmate fără el</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded bg-yellow-500 border border-yellow-400 flex items-center justify-center text-[9px] font-black text-white">✓</span>
                    <span className="text-yellow-300 font-bold">Bine de Avut</span> <span className="text-gray-500">= AI îl colectează dacă poate, nu blochează</span>
                  </span>
                </div>

                <div className="space-y-3 mb-4">
                  {constraintItems.map((item, index) => (
                    <div
                      key={`constraint-${index}`}
                      draggable
                      onDragStart={() => dragStart(index)}
                      onDragEnter={() => dragEnter(index)}
                      onDragEnd={dragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      className={`flex flex-col gap-2 p-3 bg-black/40 rounded-xl border shadow-lg cursor-grab active:cursor-grabbing transition-all hover:bg-white/5 delay-75 group ${
                        dragOverIndex === index ? 'border-purple-500 opacity-60 scale-[0.98]' :
                        item.required ? 'border-red-500/40' :
                        item.niceToHave ? 'border-yellow-500/30' : 'border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Index badge */}
                        <div className={`font-black text-lg h-10 w-10 shrink-0 rounded-lg border shadow-inner flex items-center justify-center transition-all group-hover:scale-105 ${
                          item.required ? 'text-red-400 bg-red-500/10 border-red-500/20 group-hover:bg-red-500/20' :
                          item.niceToHave ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20 group-hover:bg-yellow-500/20' :
                          'text-gray-500 bg-white/5 border-white/10'
                        }`}>
                          {index + 1}
                        </div>

                        {/* Field name */}
                        <div className="flex-1">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => updateConstraintName(item.name, e.target.value, index)}
                            placeholder="Ex: Data Evenimentului"
                            className="w-full bg-transparent font-bold text-white text-base focus:outline-none focus:text-purple-300 focus:border-b focus:border-purple-500/30 pb-1"
                          />
                        </div>

                        {/* Two checkboxes */}
                        <div className="flex gap-4 items-center shrink-0">
                          {/* Obligatoriu */}
                          <div className="flex flex-col items-center gap-1 cursor-pointer" onClick={() => toggleRequired(index)} title="Fără el nu se confirmă rezervarea">
                            <span className="text-[9px] text-red-400 font-bold uppercase leading-none tracking-wide">Obligatoriu</span>
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                              item.required
                                ? 'bg-red-500 border-red-400 shadow-lg shadow-red-500/40'
                                : 'border-red-500/30 bg-black/20 hover:border-red-400/70'
                            }`}>
                              {item.required && <span className="text-white text-[11px] font-black leading-none">✓</span>}
                            </div>
                          </div>

                          {/* Bine de Avut */}
                          <div className="flex flex-col items-center gap-1 cursor-pointer" onClick={() => toggleNiceToHave(index)} title="Colectat dacă posibil, nu blochează">
                            <span className="text-[9px] text-yellow-400 font-bold uppercase leading-none tracking-wide">Bine Avut</span>
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                              item.niceToHave
                                ? 'bg-yellow-500 border-yellow-400 shadow-lg shadow-yellow-500/40'
                                : 'border-yellow-500/30 bg-black/20 hover:border-yellow-400/70'
                            }`}>
                              {item.niceToHave && <span className="text-white text-[11px] font-black leading-none">✓</span>}
                            </div>
                          </div>
                        </div>

                        {/* Drag handle */}
                        <div className="flex flex-col gap-1 items-center shrink-0 opacity-20 group-hover:opacity-100 transition-opacity">
                          <span className="text-[10px] text-gray-400 uppercase tracking-widest leading-none">Drag</span>
                          <span className="text-2xl text-gray-400 rotate-90 scale-y-[2]">॥</span>
                        </div>

                        <button onClick={() => removeConstraint(index)} className="text-red-400/50 hover:text-red-400 px-3 py-1 text-2xl font-light hover:bg-red-500/10 rounded-lg transition-all" title="Șterge">×</button>
                      </div>

                      {/* Custom prompt */}
                      <div className="ml-12 pl-3 border-l-2 border-white/5 flex flex-col gap-2 mt-1">
                        <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span> Tonul (Formula EXACTĂ folosită de AI pentru a întreba):
                        </span>
                        <input type="text"
                          value={editCustomPrompts[item.name] || ""}
                          onChange={e => handleCustomPromptChange(item.name, e.target.value)}
                          className="w-full bg-black/30 border border-white/5 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-emerald-400/50 focus:bg-emerald-900/10 transition-all text-emerald-100 placeholder:text-gray-600 shadow-inner"
                          placeholder={`ex: Vă rog să imi spuneti ${item.name}...`}
                        />
                      </div>
                    </div>
                  ))}
                  {constraintItems.length === 0 && (
                    <p className="text-sm text-[var(--color-dim)] italic text-center py-4 bg-black/20 rounded-xl border border-dashed border-white/10">
                      Nicio constrângere. AI-ul nu va cere detalii suplimentare pentru acest rol.
                    </p>
                  )}
                </div>

                <button onClick={addConstraint} className="w-full py-3.5 mt-2 border-2 border-dashed border-purple-500/30 rounded-xl text-purple-400 font-bold hover:bg-purple-500/10 hover:border-purple-500/50 transition-all flex items-center justify-center gap-2 group shadow-sm">
                  <span className="text-xl group-hover:scale-125 transition-transform">+</span> Adaugă o Nouă Constrângere
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col justify-center items-center text-[var(--color-dim)]">
            <span className="text-4xl mb-4 opacity-50">🤖</span>
            <p>Selectează o procedură pentru a configura asistența cognitivă.</p>
          </div>
        )}
      </section>
    </main>
  );
}
