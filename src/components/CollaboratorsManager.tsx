"use client";

import { useState, useEffect, useCallback } from "react";

type Package = { service: string; price_per_hour: number };

type Collaborator = {
  id: string;
  name: string;
  phone: string;
  brand_key: string;
  contact_person: string;
  default_location: string;
  packages: Package[];
  notes: string;
  is_active: boolean;
  created_at: string;
};

const BRANDS = [
  "SUPERPARTY", "GALAXY", "KASSYA", "WOWPARTY",
  "DIVERTIX", "UNIVERSPARTY"
];

export default function CollaboratorsManager() {
  const [collabs, setCollabs] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fBrand, setFBrand] = useState("");
  const [fContact, setFContact] = useState("");
  const [fLocation, setFLocation] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [fPackages, setFPackages] = useState<Package[]>([{ service: "", price_per_hour: 0 }]);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eBrand, setEBrand] = useState("");
  const [eContact, setEContact] = useState("");
  const [eLocation, setELocation] = useState("");
  const [eNotes, setENotes] = useState("");
  const [ePackages, setEPackages] = useState<Package[]>([]);

  const fetchCollabs = useCallback(async () => {
    try {
      const res = await fetch("/api/vertex/collaborators");
      const d = await res.json();
      setCollabs(d.collaborators || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCollabs(); }, [fetchCollabs]);

  const resetForm = () => {
    setFName(""); setFPhone(""); setFBrand(""); setFContact(""); setFLocation(""); setFNotes("");
    setFPackages([{ service: "", price_per_hour: 0 }]);
    setShowForm(false);
  };

  const saveNew = async () => {
    if (!fName || !fPhone || !fBrand) return;
    setSaving(true);
    await fetch("/api/vertex/collaborators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fName, phone: fPhone, brand_key: fBrand,
        contact_person: fContact, default_location: fLocation,
        packages: fPackages.filter(p => p.service),
        notes: fNotes,
      }),
    });
    resetForm();
    setSaving(false);
    fetchCollabs();
  };

  const startEdit = (c: Collaborator) => {
    setEditId(c.id);
    setEName(c.name); setEPhone(c.phone); setEBrand(c.brand_key);
    setEContact(c.contact_person); setELocation(c.default_location);
    setENotes(c.notes); setEPackages([...(c.packages || [])]);
  };

  const saveEdit = async () => {
    if (!editId) return;
    await fetch("/api/vertex/collaborators", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editId,
        name: eName, phone: ePhone, brand_key: eBrand,
        contact_person: eContact, default_location: eLocation,
        packages: ePackages.filter(p => p.service),
        notes: eNotes,
      }),
    });
    setEditId(null);
    fetchCollabs();
  };

  const deleteCollab = async (id: string) => {
    if (!confirm("Sigur vrei să ștergi acest colaborator?")) return;
    await fetch(`/api/vertex/collaborators?id=${id}`, { method: "DELETE" });
    fetchCollabs();
  };

  const brandColor = (b: string) => {
    if (b.includes("KASS")) return "bg-pink-500/20 text-pink-400 border-pink-500/30";
    if (b.includes("GALAXY")) return "bg-green-500/20 text-green-400 border-green-500/30";
    if (b.includes("WOW")) return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    if (b.includes("DIVER")) return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    if (b.includes("UNIVER")) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    return "bg-purple-500/20 text-purple-400 border-purple-500/30";
  };

  const addPackageRow = (list: Package[], setter: (p: Package[]) => void) => {
    setter([...list, { service: "", price_per_hour: 0 }]);
  };

  const removePackageRow = (list: Package[], setter: (p: Package[]) => void, idx: number) => {
    setter(list.filter((_, i) => i !== idx));
  };

  const updatePackage = (list: Package[], setter: (p: Package[]) => void, idx: number, field: keyof Package, val: string) => {
    const updated = [...list];
    if (field === "price_per_hour") updated[idx] = { ...updated[idx], price_per_hour: Number(val) || 0 };
    else updated[idx] = { ...updated[idx], service: val };
    setter(updated);
  };

  const PackagesEditor = ({ packages, setter }: { packages: Package[]; setter: (p: Package[]) => void }) => (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-dim)]">📦 Pachete & Prețuri/oră</span>
        <button onClick={() => addPackageRow(packages, setter)} className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 hover:bg-emerald-500/20">+ Pachet</button>
      </div>
      {packages.map((p, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input type="text" value={p.service} onChange={e => updatePackage(packages, setter, i, "service", e.target.value)}
            className="flex-1 bg-black/40 border border-[var(--color-border)] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
            placeholder="Animație, Popcorn..." />
          <div className="flex items-center gap-1">
            <input type="number" value={p.price_per_hour || ""} onChange={e => updatePackage(packages, setter, i, "price_per_hour", e.target.value)}
              className="w-20 bg-black/40 border border-[var(--color-border)] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-500 text-right"
              placeholder="150" />
            <span className="text-[10px] text-[var(--color-dim)]">RON/h</span>
          </div>
          {packages.length > 1 && (
            <button onClick={() => removePackageRow(packages, setter, i)} className="text-red-400 text-xs hover:text-red-300">✕</button>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">🤝</span> Colaboratori & Parteneri
            </h2>
            <p className="text-sm text-[var(--color-dim)] mt-1">
              Locuri de joacă, săli și clienți cu prețuri preferențiale. AI-ul îi recunoaște după telefon + brand.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full border border-amber-500/30">
              {collabs.length} parteneri
            </span>
            <button
              onClick={() => setShowForm(!showForm)}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${showForm ? "bg-red-600 text-white" : "bg-emerald-600 hover:bg-emerald-500 text-white"}`}
            >
              {showForm ? "✕ Anulează" : "➕ Adaugă Partener"}
            </button>
          </div>
        </div>

        {/* Add Form */}
        {showForm && (
          <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-5 mb-6 space-y-4">
            <h3 className="font-bold text-emerald-400 flex items-center gap-2">🏢 Partener Nou</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] mb-1 block">Nume partener *</span>
                <input type="text" value={fName} onChange={e => setFName(e.target.value)}
                  className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                  placeholder="Loc de Joacă Happy Kids" />
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] mb-1 block">Telefon *</span>
                <input type="text" value={fPhone} onChange={e => setFPhone(e.target.value)}
                  className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                  placeholder="+40722111222" />
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] mb-1 block">Brand pe care scrie *</span>
                <select value={fBrand} onChange={e => setFBrand(e.target.value)}
                  className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500">
                  <option value="">-- Alege brandul --</option>
                  {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] mb-1 block">👤 Persoană de contact</span>
                <input type="text" value={fContact} onChange={e => setFContact(e.target.value)}
                  className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                  placeholder="Ioana" />
              </div>
              <div className="col-span-2">
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] mb-1 block">📍 Locație fixă</span>
                <input type="text" value={fLocation} onChange={e => setFLocation(e.target.value)}
                  className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                  placeholder="Str. Mihai Viteazu nr. 5, Sector 3, București" />
              </div>
            </div>

            {/* Packages */}
            <PackagesEditor packages={fPackages} setter={setFPackages} />

            <div>
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] mb-1 block">📝 Note</span>
              <input type="text" value={fNotes} onChange={e => setFNotes(e.target.value)}
                className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                placeholder="Observații..." />
            </div>

            <button onClick={saveNew} disabled={saving || !fName || !fPhone || !fBrand}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-sm transition-all disabled:opacity-50">
              {saving ? "Se salvează..." : "💾 Salvează Partenerul"}
            </button>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="text-center p-8 text-[var(--color-dim)]">Se încarcă...</div>
        ) : collabs.length === 0 ? (
          <div className="text-center p-12 text-[var(--color-dim)]">
            <div className="text-4xl mb-4 opacity-30">🤝</div>
            <p className="text-sm">Niciun partener adăugat.<br/>Apasă <strong>➕ Adaugă Partener</strong> pentru a începe.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {collabs.map(c => {
              const isEd = editId === c.id;
              const pkgs = c.packages || [];
              return (
                <div key={c.id} className={`rounded-xl border transition-all ${isEd ? "bg-purple-900/20 border-purple-500/40" : "bg-black/30 border-[var(--color-border)] hover:border-amber-500/30"}`}>
                  {/* Header Row */}
                  <div className="px-5 py-4">
                    {isEd ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <input type="text" value={eName} onChange={e => setEName(e.target.value)}
                            className="bg-black/40 border border-[var(--color-border)] rounded px-2 py-1.5 text-sm" placeholder="Nume partener" />
                          <input type="text" value={ePhone} onChange={e => setEPhone(e.target.value)}
                            className="bg-black/40 border border-[var(--color-border)] rounded px-2 py-1.5 text-sm" placeholder="Telefon" />
                          <select value={eBrand} onChange={e => setEBrand(e.target.value)}
                            className="bg-black/40 border border-[var(--color-border)] rounded px-2 py-1.5 text-sm">
                            {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                          </select>
                          <input type="text" value={eContact} onChange={e => setEContact(e.target.value)}
                            className="bg-black/40 border border-[var(--color-border)] rounded px-2 py-1.5 text-sm" placeholder="Contact" />
                          <input type="text" value={eLocation} onChange={e => setELocation(e.target.value)}
                            className="bg-black/40 border border-[var(--color-border)] rounded px-2 py-1.5 text-sm col-span-2" placeholder="Locație" />
                        </div>
                        <PackagesEditor packages={ePackages} setter={setEPackages} />
                        <input type="text" value={eNotes} onChange={e => setENotes(e.target.value)}
                          className="w-full bg-black/40 border border-[var(--color-border)] rounded px-2 py-1.5 text-sm" placeholder="Note" />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditId(null)} className="text-xs bg-gray-500/10 text-gray-400 px-3 py-1.5 rounded-md hover:bg-gray-500/20 border border-gray-500/20">✕ Anulează</button>
                          <button onClick={saveEdit} className="text-xs bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-md hover:bg-emerald-500/20 border border-emerald-500/20 font-bold">💾 Salvează</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-4">
                        {/* Icon */}
                        <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-xl shrink-0">
                          🏢
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="font-bold text-base">{c.name}</span>
                            <span className={`text-[9px] px-2 py-0.5 rounded-full border uppercase tracking-wider ${brandColor(c.brand_key)}`}>
                              {c.brand_key}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-[var(--color-dim)] mb-2">
                            <span>📱 {c.phone}</span>
                            {c.contact_person && <span>👤 {c.contact_person}</span>}
                            {c.default_location && <span>📍 {c.default_location}</span>}
                          </div>

                          {/* Packages */}
                          {pkgs.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {pkgs.map((p, i) => (
                                <span key={i} className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1">
                                  🎭 {p.service} — <strong>{p.price_per_hour} RON/h</strong>
                                </span>
                              ))}
                            </div>
                          )}

                          {c.notes && <div className="text-[10px] text-[var(--color-dim)] mt-1.5 italic">📝 {c.notes}</div>}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => startEdit(c)} className="text-xs bg-purple-500/10 text-purple-400 px-2.5 py-1.5 rounded-md hover:bg-purple-500/20 border border-purple-500/20">✏️</button>
                          <button onClick={() => deleteCollab(c.id)} className="text-xs bg-red-500/10 text-red-400 px-2.5 py-1.5 rounded-md hover:bg-red-500/20 border border-red-500/20">🗑</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
