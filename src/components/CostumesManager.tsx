"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type Costume = {
  id: string;
  brand_key: string;
  name: string;
  description: string;
  photo_url: string;
  price: number;
  active: boolean;
  sort_order: number;
};

type Brand = { session_key: string; label: string; brand_key: string; phone_number: string };

export default function CostumesManager() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState("");
  const [costumes, setCostumes] = useState<Costume[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch brands (WhatsApp sessions)
  useEffect(() => {
    fetch("/api/admin/client-notebooks")
      .then((r) => r.json())
      .then((d) => {
        const notebooks = d.notebooks || [];
        const seen = new Set<string>();
        const brandList: Brand[] = [];
        for (const n of notebooks) {
          const bk = n.brand_key || "GLOBAL";
          if (!seen.has(bk)) {
            seen.add(bk);
            brandList.push({ session_key: "", label: bk.replace(/_/g, " "), brand_key: bk, phone_number: "" });
          }
        }
        setBrands(brandList);
        if (brandList.length > 0 && !selectedBrand) setSelectedBrand(brandList[0].brand_key);
      })
      .catch(() => {});
  }, [selectedBrand]);

  // Fetch costumes for selected brand
  const loadCostumes = useCallback(async () => {
    if (!selectedBrand) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/vertex/costumes?brand=${selectedBrand}&all=1`);
      const d = await res.json();
      setCostumes(d.costumes || []);
    } catch { setCostumes([]); }
    setLoading(false);
  }, [selectedBrand]);

  useEffect(() => { loadCostumes(); }, [loadCostumes]);

  // Handle photo upload
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("brand", selectedBrand);
      const res = await fetch("/api/vertex/costumes/upload", { method: "POST", body: form });
      const d = await res.json();
      if (d.url) setUploadedUrl(d.url);
    } catch (err) { console.error("Upload failed:", err); }
    setUploading(false);
  };

  // Add costume
  const addCostume = async () => {
    if (!newName || !selectedBrand) return;
    await fetch("/api/vertex/costumes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand_key: selectedBrand,
        name: newName,
        description: newDescription,
        photo_url: uploadedUrl,
        price: parseFloat(newPrice) || 0,
      }),
    });
    setNewName(""); setNewDescription(""); setNewPrice(""); setUploadedUrl(""); setUploadPreview(""); setShowAddForm(false);
    loadCostumes();
  };

  // Delete costume
  const deleteCostume = async (id: string) => {
    if (!confirm("Ștergi definitiv acest costum?")) return;
    await fetch(`/api/vertex/costumes?id=${id}`, { method: "DELETE" });
    loadCostumes();
  };

  // Toggle active
  const toggleActive = async (c: Costume) => {
    await fetch("/api/vertex/costumes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, active: !c.active }),
    });
    loadCostumes();
  };

  // Edit costume
  const startEdit = (c: Costume) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditPrice(String(c.price || ""));
    setEditDescription(c.description || "");
  };
  const saveEdit = async () => {
    if (!editingId) return;
    await fetch("/api/vertex/costumes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingId, name: editName, price: parseFloat(editPrice) || 0, description: editDescription }),
    });
    setEditingId(null);
    loadCostumes();
  };

  const catalogUrl = selectedBrand ? `${typeof window !== 'undefined' ? window.location.origin : ''}/catalog/${selectedBrand}` : '';

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-3">🎭 Catalog Costume</h2>
          <p className="text-sm text-[var(--color-dim)] mt-1">Gestionează costumele per număr WhatsApp</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Brand selector */}
          <select
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            className="bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
          >
            {brands.map((b) => (
              <option key={b.brand_key} value={b.brand_key}>{b.label}</option>
            ))}
          </select>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${showAddForm ? "bg-red-600 text-white" : "bg-emerald-600 hover:bg-emerald-500 text-white"}`}
          >
            {showAddForm ? "✕ Anulează" : "➕ Adaugă Costum"}
          </button>
        </div>
      </div>

      {/* Catalog Link */}
      {selectedBrand && (
        <div className="mb-4 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-blue-400">
            <span>🔗</span>
            <span>Link catalog public:</span>
            <code className="text-blue-300 bg-black/30 px-2 py-0.5 rounded text-xs">{catalogUrl}</code>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(catalogUrl)}
            className="text-xs bg-blue-500/20 text-blue-400 px-3 py-1.5 rounded-lg hover:bg-blue-500/30 transition-all border border-blue-500/20"
          >
            📋 Copiază
          </button>
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-900/20 border border-emerald-500/30 space-y-3">
          <h3 className="font-bold text-sm text-emerald-400">🎭 Costum Nou pentru {selectedBrand.replace(/_/g, " ")}</h3>

          {/* Photo Upload */}
          <div className="flex items-start gap-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-32 h-32 rounded-xl bg-black/40 border-2 border-dashed border-[var(--color-border)] hover:border-emerald-500 cursor-pointer flex items-center justify-center transition-all overflow-hidden"
            >
              {uploadPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={uploadPreview} alt="preview" className="w-full h-full object-cover" />
              ) : uploading ? (
                <span className="text-sm text-emerald-400 animate-pulse">Se încarcă...</span>
              ) : (
                <div className="text-center text-[var(--color-dim)]">
                  <div className="text-3xl mb-1">📷</div>
                  <div className="text-[10px]">Click pt poză</div>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

            <div className="flex-1 space-y-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] mb-0.5 block">Nume Costum *</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ex: Spider-Man" className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] mb-0.5 block">💰 Preț (RON)</label>
                  <input type="number" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="350" className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] mb-0.5 block">📝 Descriere</label>
                  <input type="text" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="opțional" className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
                </div>
              </div>
              <button
                onClick={addCostume}
                disabled={!newName || uploading}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-sm transition-all disabled:opacity-50"
              >
                {uploading ? "Se încarcă poza..." : "💾 Salvează Costumul"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Costume Grid */}
      {loading ? (
        <div className="text-center py-12 text-[var(--color-dim)]">Se încarcă costumele...</div>
      ) : costumes.length === 0 ? (
        <div className="text-center py-12 text-[var(--color-dim)]">
          <div className="text-5xl mb-3">🎭</div>
          <p>Niciun costum adăugat pentru <strong>{selectedBrand.replace(/_/g, " ")}</strong></p>
          <p className="text-xs mt-1">Apasă &quot;➕ Adaugă Costum&quot; pentru a începe</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {costumes.map((c) => (
            <div key={c.id} className={`rounded-xl border overflow-hidden transition-all group ${c.active ? "bg-black/30 border-[var(--color-border)] hover:border-purple-500/50" : "bg-black/10 border-red-500/20 opacity-60"}`}>
              {/* Photo */}
              <div className="w-full aspect-square bg-black/40 overflow-hidden relative">
                {c.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.photo_url} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-6xl opacity-20">🎭</div>
                )}
                {!c.active && (
                  <div className="absolute top-2 right-2 bg-red-600 text-white text-[9px] px-2 py-0.5 rounded-full font-bold">INACTIV</div>
                )}
              </div>

              {/* Info */}
              <div className="p-3">
                {editingId === c.id ? (
                  <div className="space-y-2">
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full bg-black/40 border border-[var(--color-border)] rounded px-2 py-1 text-sm" />
                    <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="w-full bg-black/40 border border-[var(--color-border)] rounded px-2 py-1 text-sm" placeholder="Preț" />
                    <input type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="w-full bg-black/40 border border-[var(--color-border)] rounded px-2 py-1 text-sm" placeholder="Descriere" />
                    <div className="flex gap-1">
                      <button onClick={saveEdit} className="flex-1 text-xs bg-emerald-600 text-white py-1 rounded font-bold">💾</button>
                      <button onClick={() => setEditingId(null)} className="flex-1 text-xs bg-gray-600 text-white py-1 rounded">✕</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3 className="font-bold text-sm truncate">{c.name}</h3>
                    {c.description && <p className="text-[10px] text-[var(--color-dim)] mt-0.5 truncate">{c.description}</p>}
                    {c.price > 0 && <div className="text-emerald-400 font-bold text-sm mt-1">{c.price} RON</div>}

                    {/* Actions */}
                    <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(c)} className="flex-1 text-[10px] bg-purple-500/10 text-purple-400 py-1 rounded hover:bg-purple-500/20 border border-purple-500/20">✏️</button>
                      <button onClick={() => toggleActive(c)} className="flex-1 text-[10px] bg-orange-500/10 text-orange-400 py-1 rounded hover:bg-orange-500/20 border border-orange-500/20">{c.active ? "🚫" : "✅"}</button>
                      <button onClick={() => deleteCostume(c.id)} className="flex-1 text-[10px] bg-red-500/10 text-red-400 py-1 rounded hover:bg-red-500/20 border border-red-500/20">🗑</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
