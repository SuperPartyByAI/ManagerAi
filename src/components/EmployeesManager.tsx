"use client";

import { useState, useEffect, useCallback } from "react";

type Permissions = {
  read_chats: boolean;
  reply: boolean;
  see_prices: boolean;
  manage_events: boolean;
};

type Employee = {
  id: string;
  name: string;
  email: string;
  phone: string;
  brand_keys: string[];
  permissions: Permissions;
  is_active: boolean;
  created_at: string;
};

const BRANDS = ["SUPERPARTY", "GALAXY", "KASSYA", "WOWPARTY", "DIVERTIX", "UNIVERSPARTY"];

const PERM_LABELS: { key: keyof Permissions; label: string; icon: string }[] = [
  { key: "read_chats", label: "Citește conversații", icon: "💬" },
  { key: "reply", label: "Poate răspunde", icon: "✍️" },
  { key: "see_prices", label: "Vede prețurile", icon: "💰" },
  { key: "manage_events", label: "Gestionează petreceri", icon: "🎉" },
];

export default function EmployeesManager() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form
  const [fName, setFName] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fBrands, setFBrands] = useState<string[]>([]);
  const [fPerms, setFPerms] = useState<Permissions>({ read_chats: true, reply: false, see_prices: false, manage_events: false });
  const [saving, setSaving] = useState(false);

  // Edit
  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eBrands, setEBrands] = useState<string[]>([]);
  const [ePerms, setEPerms] = useState<Permissions>({ read_chats: true, reply: false, see_prices: false, manage_events: false });

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch("/api/vertex/employees");
      const d = await res.json();
      setEmployees(d.employees || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  const toggleBrand = (brand: string, list: string[], setter: (b: string[]) => void) => {
    setter(list.includes(brand) ? list.filter(b => b !== brand) : [...list, brand]);
  };

  const togglePerm = (key: keyof Permissions, perms: Permissions, setter: (p: Permissions) => void) => {
    setter({ ...perms, [key]: !perms[key] });
  };

  const resetForm = () => {
    setFName(""); setFEmail(""); setFPhone(""); setFBrands([]);
    setFPerms({ read_chats: true, reply: false, see_prices: false, manage_events: false });
    setShowForm(false);
  };

  const saveNew = async () => {
    if (!fName || !fEmail) return;
    setSaving(true);
    await fetch("/api/vertex/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fName, email: fEmail, phone: fPhone, brand_keys: fBrands, permissions: fPerms }),
    });
    resetForm();
    setSaving(false);
    fetchEmployees();
  };

  const startEdit = (e: Employee) => {
    setEditId(e.id);
    setEName(e.name); setEEmail(e.email); setEPhone(e.phone);
    setEBrands([...(e.brand_keys || [])]); setEPerms({ ...e.permissions });
  };

  const saveEdit = async () => {
    if (!editId) return;
    await fetch("/api/vertex/employees", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editId, name: eName, email: eEmail, phone: ePhone, brand_keys: eBrands, permissions: ePerms }),
    });
    setEditId(null);
    fetchEmployees();
  };

  const toggleActive = async (emp: Employee) => {
    await fetch("/api/vertex/employees", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: emp.id, is_active: !emp.is_active }),
    });
    fetchEmployees();
  };

  const deleteEmp = async (id: string) => {
    if (!confirm("Sigur vrei să ștergi acest angajat?")) return;
    await fetch(`/api/vertex/employees?id=${id}`, { method: "DELETE" });
    fetchEmployees();
  };

  const renderBrands = (selected: string[], toggle: (b: string) => void) => (
    <div className="flex flex-wrap gap-1.5">
      {BRANDS.map(b => (
        <button key={b} onClick={() => toggle(b)}
          className={`text-[10px] px-2 py-1 rounded-lg border transition-all ${
            selected.includes(b)
              ? "bg-violet-500/20 text-violet-400 border-violet-500/40"
              : "bg-black/20 text-[var(--color-dim)] border-[var(--color-border)] hover:border-violet-500/30"
          }`}>
          {b}
        </button>
      ))}
    </div>
  );

  const renderPerms = (perms: Permissions, toggle: (k: keyof Permissions) => void) => (
    <div className="grid grid-cols-2 gap-2">
      {PERM_LABELS.map(p => (
        <button key={p.key} onClick={() => toggle(p.key)}
          className={`flex items-center gap-2 text-[11px] px-3 py-2 rounded-lg border transition-all ${
            perms[p.key]
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : "bg-black/20 text-[var(--color-dim)] border-[var(--color-border)] hover:border-red-500/30"
          }`}>
          <span>{p.icon}</span>
          <span>{p.label}</span>
          <span className="ml-auto">{perms[p.key] ? "✅" : "❌"}</span>
        </button>
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
              <span className="text-3xl">👷</span> Angajați & Permisiuni
            </h2>
            <p className="text-sm text-[var(--color-dim)] mt-1">
              Gestionează angajații și ce pot vedea/face în aplicația de pe telefon.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-indigo-500/20 text-indigo-400 px-3 py-1 rounded-full border border-indigo-500/30">
              {employees.filter(e => e.is_active).length} activi
            </span>
            <button onClick={() => setShowForm(!showForm)}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${showForm ? "bg-red-600 text-white" : "bg-emerald-600 hover:bg-emerald-500 text-white"}`}>
              {showForm ? "✕ Anulează" : "➕ Adaugă Angajat"}
            </button>
          </div>
        </div>

        {/* Add Form */}
        {showForm && (
          <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-5 mb-6 space-y-4">
            <h3 className="font-bold text-emerald-400">👤 Angajat Nou</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] mb-1 block">Nume *</span>
                <input type="text" value={fName} onChange={e => setFName(e.target.value)}
                  className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" placeholder="Maria Popescu" />
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] mb-1 block">Email *</span>
                <input type="email" value={fEmail} onChange={e => setFEmail(e.target.value)}
                  className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" placeholder="maria@superparty.ro" />
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] mb-1 block">Telefon</span>
                <input type="text" value={fPhone} onChange={e => setFPhone(e.target.value)}
                  className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" placeholder="+40722..." />
              </div>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] mb-1.5 block">📱 Branduri Vizibile</span>
              {renderBrands(fBrands, (b: string) => toggleBrand(b, fBrands, setFBrands))}
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] mb-1.5 block">🔐 Permisiuni</span>
              {renderPerms(fPerms, (k: keyof Permissions) => togglePerm(k, fPerms, setFPerms))}
            </div>
            <button onClick={saveNew} disabled={saving || !fName || !fEmail}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-sm transition-all disabled:opacity-50">
              {saving ? "Se salvează..." : "💾 Salvează Angajatul"}
            </button>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="text-center p-8 text-[var(--color-dim)]">Se încarcă...</div>
        ) : employees.length === 0 ? (
          <div className="text-center p-12 text-[var(--color-dim)]">
            <div className="text-4xl mb-4 opacity-30">👷</div>
            <p className="text-sm">Niciun angajat adăugat.<br/>Apasă <strong>➕ Adaugă Angajat</strong> pentru a începe.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {employees.map(emp => {
              const isEd = editId === emp.id;
              return (
                <div key={emp.id} className={`rounded-xl border transition-all ${
                  isEd ? "bg-purple-900/20 border-purple-500/40"
                  : !emp.is_active ? "bg-black/20 border-[var(--color-border)] opacity-50"
                  : "bg-black/30 border-[var(--color-border)] hover:border-indigo-500/30"
                }`}>
                  <div className="px-5 py-4">
                    {isEd ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                          <input type="text" value={eName} onChange={e => setEName(e.target.value)}
                            className="bg-black/40 border border-[var(--color-border)] rounded px-2 py-1.5 text-sm" placeholder="Nume" />
                          <input type="email" value={eEmail} onChange={e => setEEmail(e.target.value)}
                            className="bg-black/40 border border-[var(--color-border)] rounded px-2 py-1.5 text-sm" placeholder="Email" />
                          <input type="text" value={ePhone} onChange={e => setEPhone(e.target.value)}
                            className="bg-black/40 border border-[var(--color-border)] rounded px-2 py-1.5 text-sm" placeholder="Telefon" />
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] mb-1 block">Branduri</span>
                          {renderBrands(eBrands, (b: string) => toggleBrand(b, eBrands, setEBrands))}
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] mb-1 block">Permisiuni</span>
                          {renderPerms(ePerms, (k: keyof Permissions) => togglePerm(k, ePerms, setEPerms))}
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditId(null)} className="text-xs bg-gray-500/10 text-gray-400 px-3 py-1.5 rounded-md hover:bg-gray-500/20 border border-gray-500/20">✕ Anulează</button>
                          <button onClick={saveEdit} className="text-xs bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-md hover:bg-emerald-500/20 border border-emerald-500/20 font-bold">💾 Salvează</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                          emp.is_active ? "bg-indigo-500/20 border border-indigo-500/30" : "bg-gray-500/20 border border-gray-500/30"
                        }`}>
                          {emp.is_active ? "👷" : "🚫"}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-base">{emp.name}</span>
                            {!emp.is_active && <span className="text-[9px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full border border-red-500/30">INACTIV</span>}
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-[var(--color-dim)] mb-2">
                            <span>📧 {emp.email}</span>
                            {emp.phone && <span>📱 {emp.phone}</span>}
                          </div>

                          {/* Brand badges */}
                          {emp.brand_keys?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {emp.brand_keys.map(b => (
                                <span key={b} className="text-[9px] bg-violet-500/15 text-violet-400 px-1.5 py-0.5 rounded border border-violet-500/20">{b}</span>
                              ))}
                            </div>
                          )}

                          {/* Permission badges */}
                          <div className="flex flex-wrap gap-1">
                            {PERM_LABELS.map(p => (
                              <span key={p.key} className={`text-[9px] px-1.5 py-0.5 rounded border ${
                                emp.permissions?.[p.key]
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  : "bg-red-500/10 text-red-400 border-red-500/20"
                              }`}>
                                {p.icon} {emp.permissions?.[p.key] ? "✓" : "✕"}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => toggleActive(emp)}
                            className={`text-xs px-2.5 py-1.5 rounded-md border ${
                              emp.is_active
                                ? "bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20"
                                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                            }`}>
                            {emp.is_active ? "⏸" : "▶️"}
                          </button>
                          <button onClick={() => startEdit(emp)} className="text-xs bg-purple-500/10 text-purple-400 px-2.5 py-1.5 rounded-md hover:bg-purple-500/20 border border-purple-500/20">✏️</button>
                          <button onClick={() => deleteEmp(emp.id)} className="text-xs bg-red-500/10 text-red-400 px-2.5 py-1.5 rounded-md hover:bg-red-500/20 border border-red-500/20">🗑</button>
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
