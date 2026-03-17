"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type ConfigMap = Record<string, string>;
type TestMessage = { role: "user" | "ai"; text: string; time: string; latency?: number; fn?: string };
type Source = { id: string; title: string; content: string; category: string; is_active: boolean; updated_at: string };
type Brand = { session_key: string; label: string; brand_key: string; phone_number: string; status: string };
type SimConv = { phone: string; label: string; messages: TestMessage[] };

let convCounter = 1;

export default function VertexConfig() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>("GLOBAL");
  const [config, setConfig] = useState<ConfigMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [togglingAi, setTogglingAi] = useState(false);
  const [testInput, setTestInput] = useState("");
  const [testing, setTesting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Multi-conversation state
  const [conversations, setConversations] = useState<SimConv[]>([{ phone: "+40700000001", label: "Client 1", messages: [] }]);
  const [activeConvIdx, setActiveConvIdx] = useState(0);
  const activeConv = conversations[activeConvIdx] || conversations[0];
  const testMessages = activeConv?.messages || [];

  const [sources, setSources] = useState<Source[]>([]);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [newSource, setNewSource] = useState({ title: "", content: "", category: "general" });
  const [showAddSource, setShowAddSource] = useState(false);
  const [activeTab, setActiveTab] = useState<"config" | "sources">("config");

  const scrollChat = () => chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollChat(); }, [testMessages.length]);

  // Load brands + global AI status on mount
  useEffect(() => {
    (async () => {
      try {
        const [brandsRes, cfgRes] = await Promise.all([
          fetch("/api/vertex/brands"),
          fetch("/api/vertex/config?brand=GLOBAL"),
        ]);
        const brandsData = await brandsRes.json();
        const cfgData = await cfgRes.json();
        setBrands(brandsData.brands || []);
        const aiCfg = (cfgData.config || []).find((c: { config_key: string }) => c.config_key === "ai_enabled");
        if (aiCfg) setAiEnabled(aiCfg.config_value !== "false");
      } catch (e) { console.error("Load brands:", e); }
    })();
  }, []);

  // Load config + sources when brand changes
  // Load conversation history for a specific phone
  const loadConvHistory = useCallback(async (brand: string, phone: string): Promise<TestMessage[]> => {
    try {
      const r = await fetch(`/api/vertex/test?brand=${brand}&phone=${encodeURIComponent(phone)}`);
      const d = await r.json();
      return d.messages || [];
    } catch { return []; }
  }, []);

  const loadBrandData = useCallback(async (brand: string) => {
    setLoading(true);
    try {
      const [cfgRes, srcRes] = await Promise.all([
        fetch(`/api/vertex/config?brand=${brand}`),
        fetch(`/api/vertex/sources?brand=${brand}`),
      ]);
      const cfgData = await cfgRes.json();
      const srcData = await srcRes.json();

      const map: ConfigMap = {};
      (cfgData.config || []).forEach((c: { config_key: string; config_value: string }) => {
        map[c.config_key] = c.config_value;
      });
      setConfig(map);
      setSources(srcData.sources || []);

      // Load history for first conversation
      const msgs = await loadConvHistory(brand, "+40700000001");
      setConversations(prev => {
        const updated = [...prev];
        if (updated[0]) updated[0].messages = msgs;
        return updated;
      });
    } catch (e) { console.error("Load:", e); }
    setLoading(false);
  }, [loadConvHistory]);

  useEffect(() => { loadBrandData(selectedBrand); }, [selectedBrand, loadBrandData]);

  const save = async (key: string, value: string) => {
    setSaving(key);
    setConfig((prev) => ({ ...prev, [key]: value }));
    try {
      await fetch("/api/vertex/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value, brand: selectedBrand }),
      });
    } catch (e) { console.error("Save:", e); }
    setTimeout(() => setSaving(null), 1500);
  };

  const addSource = async () => {
    if (!newSource.title.trim() || !newSource.content.trim()) return;
    try {
      const res = await fetch("/api/vertex/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newSource, brand: selectedBrand }),
      });
      const data = await res.json();
      if (data.source) {
        setSources((prev) => [data.source, ...prev]);
        setNewSource({ title: "", content: "", category: "general" });
        setShowAddSource(false);
      }
    } catch (e) { console.error("Add source:", e); }
  };

  const updateSource = async (src: Source) => {
    try {
      await fetch("/api/vertex/sources", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(src),
      });
      setSources((prev) => prev.map((s) => (s.id === src.id ? src : s)));
      setEditingSource(null);
    } catch (e) { console.error("Update:", e); }
  };

  const deleteSource = async (id: string) => {
    try {
      await fetch("/api/vertex/sources", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setSources((prev) => prev.filter((s) => s.id !== id));
    } catch (e) { console.error("Delete:", e); }
  };

  const toggleSource = async (src: Source) => {
    await updateSource({ ...src, is_active: !src.is_active });
  };

  const updateConvMessages = (idx: number, updater: (prev: TestMessage[]) => TestMessage[]) => {
    setConversations(prev => {
      const updated = [...prev];
      if (updated[idx]) updated[idx] = { ...updated[idx], messages: updater(updated[idx].messages) };
      return updated;
    });
  };

  const addNewConversation = async () => {
    convCounter++;
    const phone = `+407000000${String(convCounter).padStart(2, "0")}`;
    const label = `Client ${convCounter}`;
    const msgs = await loadConvHistory(selectedBrand, phone);
    setConversations(prev => [...prev, { phone, label, messages: msgs }]);
    setActiveConvIdx(conversations.length);
  };

  const deleteConversation = async (idx: number) => {
    const conv = conversations[idx];
    try {
      await fetch("/api/vertex/test", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: selectedBrand, phone: conv.phone }),
      });
    } catch (e) { console.error("Delete conv:", e); }
    setConversations(prev => prev.filter((_, i) => i !== idx));
    if (activeConvIdx >= idx && activeConvIdx > 0) setActiveConvIdx(activeConvIdx - 1);
  };

  const sendTest = async () => {
    if (!testInput.trim()) return;
    if (!aiEnabled) return; // AI is OFF — do nothing
    const msg = testInput.trim();
    const idx = activeConvIdx;
    const phone = activeConv.phone;
    setTestInput("");
    updateConvMessages(idx, prev => [
      ...prev,
      { role: "user", text: msg, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
    ]);
    setTesting(true);
    try {
      const res = await fetch("/api/vertex/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message: msg, brand: selectedBrand }),
      });
      const data = await res.json();
      updateConvMessages(idx, prev => [
        ...prev,
        {
          role: "ai",
          text: data.reply || data.error || "—",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          latency: data.latencyMs,
          fn: data.functionCall?.name,
        },
      ]);
    } catch (e) {
      updateConvMessages(idx, prev => [
        ...prev,
        { role: "ai", text: `❌ ${e instanceof Error ? e.message : "Error"}`, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
      ]);
    }
    setTesting(false);
  };

  const currentBrand = brands.find((b) => b.brand_key === selectedBrand);
  const activeSources = sources.filter((s) => s.is_active);

  const getCategoryIcon = (cat: string) => {
    if (cat === "servicii") return "🛒";
    if (cat === "reguli") return "📋";
    if (cat === "zone") return "📍";
    if (cat === "faq") return "❓";
    return "📄";
  };

  if (loading && brands.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--color-dim)]">
        <div className="text-center"><div className="text-3xl mb-2 animate-pulse">⏳</div><p>Se încarcă...</p></div>
      </div>
    );
  }

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Brand Selector Bar */}
      <div className="px-4 py-2 border-b border-[var(--color-border)] bg-black/40 flex items-center gap-3 shrink-0">
        {/* AI Kill Switch */}
        <button
          onClick={async () => {
            setTogglingAi(true);
            const newVal = !aiEnabled;
            try {
              await fetch("/api/vertex/config", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: "ai_enabled", value: String(newVal), brand: "GLOBAL" }),
              });
              setAiEnabled(newVal);
            } catch (e) { console.error("Toggle AI:", e); }
            setTogglingAi(false);
          }}
          disabled={togglingAi}
          className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all border-2 ${
            aiEnabled
              ? "bg-emerald-600 border-emerald-400 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-500/30"
              : "bg-red-600 border-red-400 text-white hover:bg-red-500 shadow-lg shadow-red-500/30 animate-pulse"
          }`}
        >
          {togglingAi ? "⏳" : aiEnabled ? "🟢 AI ON" : "🔴 AI OFF"}
        </button>
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] font-bold">Brand:</span>
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setSelectedBrand("GLOBAL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              selectedBrand === "GLOBAL" ? "bg-purple-600 text-white" : "text-[var(--color-dim)] hover:bg-white/5 border border-[var(--color-border)]"
            }`}
          >
            🌐 Global
          </button>
          {brands.filter((b) => b.status === "CONNECTED").map((b) => (
            <button
              key={b.brand_key}
              onClick={() => setSelectedBrand(b.brand_key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedBrand === b.brand_key
                  ? "bg-emerald-600 text-white"
                  : "text-[var(--color-dim)] hover:bg-white/5 border border-[var(--color-border)]"
              }`}
            >
              📱 {b.label}
            </button>
          ))}
        </div>
        {currentBrand && (
          <span className="ml-auto text-[10px] text-[var(--color-dim)] bg-black/50 px-2 py-1 rounded">
            {currentBrand.phone_number}
          </span>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 overflow-hidden">
        {/* LEFT: Config + Sources */}
        <section className="glass-panel rounded-2xl flex flex-col h-full overflow-hidden">
          <header className="px-4 py-3 border-b border-[var(--color-border)] bg-black/40 flex justify-between items-center shrink-0">
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab("config")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "config" ? "bg-purple-600 text-white" : "text-[var(--color-dim)] hover:bg-white/5"
                }`}
              >⚙️ Setări</button>
              <button
                onClick={() => setActiveTab("sources")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  activeTab === "sources" ? "bg-cyan-600 text-white" : "text-[var(--color-dim)] hover:bg-white/5"
                }`}
              >📚 Surse <span className="bg-white/20 px-1.5 rounded text-[10px]">{activeSources.length}</span></button>
            </div>
            <span className="text-[10px] text-emerald-400 uppercase tracking-wider bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
              {selectedBrand === "GLOBAL" ? "🌐 Global" : `📱 ${currentBrand?.label || selectedBrand}`}
            </span>
          </header>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {loading ? (
              <div className="text-center py-8 text-[var(--color-dim)] animate-pulse">⏳ Se încarcă configurația...</div>
            ) : activeTab === "config" ? (
              <>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-[var(--color-dim)] font-bold block mb-1">System Prompt</label>
                  <p className="text-[10px] text-[var(--color-dim)] mb-2 opacity-70">
                    {selectedBrand === "GLOBAL" ? "Prompt global — se aplică dacă brand-ul nu are prompt propriu." : `Prompt specific pentru ${currentBrand?.label || selectedBrand}.`}
                  </p>
                  <textarea
                    value={config.system_prompt || ""}
                    onChange={(e) => setConfig((p) => ({ ...p, system_prompt: e.target.value }))}
                    rows={6}
                    className="w-full bg-black/30 border border-[var(--color-border)] rounded-lg px-3 py-3 text-sm text-[var(--color-text)] font-mono leading-relaxed resize-none focus:outline-none focus:border-purple-500/50"
                    placeholder="Ești asistentul virtual..."
                  />
                  <button onClick={() => save("system_prompt", config.system_prompt || "")}
                    className="w-full mt-2 py-2.5 rounded-lg font-semibold text-sm transition-all bg-purple-600 hover:bg-purple-500 text-white">
                    {saving === "system_prompt" ? "✅ Salvat!" : "💾 Salvează Promptul"}
                  </button>
                </div>
                <div className="bg-black/20 border border-[var(--color-border)] rounded-lg p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-dim)] mb-3">🧠 Model & Parametri</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] uppercase text-[var(--color-dim)] block mb-1">Model</label>
                      <select value={config.vertex_model || "gemini-2.5-flash-lite"}
                        onChange={(e) => save("vertex_model", e.target.value)}
                        className="w-full bg-black/30 border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-purple-500/50 appearance-none cursor-pointer">
                        <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite ⚡</option>
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                        <option value="gemini-2.5-pro">Gemini 2.5 Pro 🧠</option>
                        <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] uppercase text-[var(--color-dim)] block mb-1">Temperatură</label>
                        <input type="number" step="0.1" min="0" max="2" value={config.temperature || "0.3"}
                          onChange={(e) => save("temperature", e.target.value)}
                          className="w-full bg-black/30 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-purple-500/50" />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-[var(--color-dim)] block mb-1">Max Tokeni</label>
                        <input type="number" value={config.max_tokens || "2048"}
                          onChange={(e) => save("max_tokens", e.target.value)}
                          className="w-full bg-black/30 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-purple-500/50" />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-dim)]">📚 Surse {selectedBrand !== "GLOBAL" ? `(${currentBrand?.label})` : "(Global)"}</h3>
                  <button onClick={() => setShowAddSource(!showAddSource)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-all">
                    {showAddSource ? "✕ Anulează" : "+ Adaugă Sursă"}
                  </button>
                </div>
                <p className="text-[10px] text-[var(--color-dim)] -mt-3 opacity-70">
                  {selectedBrand === "GLOBAL" ? "Sursele globale se aplică dacă brand-ul nu are surse proprii." : `Surse specifice doar pentru ${currentBrand?.label || selectedBrand}.`}
                </p>

                {showAddSource && (
                  <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-4 space-y-3">
                    <input type="text" value={newSource.title}
                      onChange={(e) => setNewSource((p) => ({ ...p, title: e.target.value }))}
                      placeholder="Titlu sursă (ex: Servicii și Prețuri)"
                      className="w-full bg-black/30 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-cyan-500/50" />
                    <select value={newSource.category}
                      onChange={(e) => setNewSource((p) => ({ ...p, category: e.target.value }))}
                      className="w-full bg-black/30 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-cyan-500/50 appearance-none cursor-pointer">
                      <option value="servicii">🛒 Servicii & Prețuri</option>
                      <option value="reguli">📋 Reguli Business</option>
                      <option value="zone">📍 Zone Deservite</option>
                      <option value="faq">❓ Întrebări Frecvente</option>
                      <option value="general">📄 General</option>
                    </select>
                    <textarea value={newSource.content}
                      onChange={(e) => setNewSource((p) => ({ ...p, content: e.target.value }))}
                      rows={5} placeholder="Scrie aici conținutul sursă..."
                      className="w-full bg-black/30 border border-[var(--color-border)] rounded-lg px-3 py-3 text-sm text-[var(--color-text)] font-mono leading-relaxed resize-none focus:outline-none focus:border-cyan-500/50" />
                    <button onClick={addSource} disabled={!newSource.title.trim() || !newSource.content.trim()}
                      className="w-full py-2.5 rounded-lg font-semibold text-sm bg-cyan-600 hover:bg-cyan-500 text-white transition-all disabled:opacity-50">
                      📚 Salvează Sursa
                    </button>
                  </div>
                )}

                {sources.length === 0 ? (
                  <div className="text-center py-8 text-[var(--color-dim)]">
                    <div className="text-3xl mb-2 opacity-30">📚</div>
                    <p className="text-sm">Nicio sursă pentru {selectedBrand === "GLOBAL" ? "Global" : currentBrand?.label}.</p>
                    <p className="text-[10px] mt-1">Adaugă prima sursă pentru AI.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sources.map((s) => (
                      <div key={s.id} className={`border rounded-lg p-3 transition-all ${s.is_active ? "bg-black/20 border-[var(--color-border)]" : "bg-black/5 border-gray-700/30 opacity-50"}`}>
                        {editingSource?.id === s.id ? (
                          <div className="space-y-2">
                            <input type="text" value={editingSource.title}
                              onChange={(e) => setEditingSource({ ...editingSource, title: e.target.value })}
                              className="w-full bg-black/30 border border-[var(--color-border)] rounded px-2 py-1.5 text-sm text-[var(--color-text)] focus:outline-none" />
                            <textarea value={editingSource.content}
                              onChange={(e) => setEditingSource({ ...editingSource, content: e.target.value })}
                              rows={4} className="w-full bg-black/30 border border-[var(--color-border)] rounded px-2 py-2 text-sm text-[var(--color-text)] font-mono resize-none focus:outline-none" />
                            <div className="flex gap-2">
                              <button onClick={() => updateSource(editingSource)} className="px-3 py-1 rounded text-xs bg-emerald-600 text-white">✅ Salvează</button>
                              <button onClick={() => setEditingSource(null)} className="px-3 py-1 rounded text-xs bg-gray-600 text-white">✕</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs">{getCategoryIcon(s.category)}</span>
                                <h4 className="font-bold text-sm">{s.title}</h4>
                                {!s.is_active && <span className="text-[9px] bg-red-500/20 text-red-400 px-1.5 rounded">OFF</span>}
                              </div>
                              <div className="flex gap-1">
                                <button onClick={() => toggleSource(s)} className={`px-2 py-0.5 rounded text-[10px] ${s.is_active ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-500/20 text-gray-400"}`}>
                                  {s.is_active ? "ON" : "OFF"}
                                </button>
                                <button onClick={() => setEditingSource({ ...s })} className="px-2 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-400">✏️</button>
                                <button onClick={() => deleteSource(s.id)} className="px-2 py-0.5 rounded text-[10px] bg-red-500/20 text-red-400">🗑</button>
                              </div>
                            </div>
                            <pre className="text-[11px] text-[var(--color-dim)] font-mono whitespace-pre-wrap max-h-[80px] overflow-y-auto leading-relaxed">{s.content}</pre>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* RIGHT: Simulator */}
        <section className="glass-panel rounded-2xl flex flex-col h-full overflow-hidden">
          <header className="px-4 py-2 border-b border-[var(--color-border)] bg-black/40 shrink-0">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-semibold flex items-center gap-2"><span className="text-lg">🧪</span> Simulator</h2>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                {selectedBrand === "GLOBAL" ? "🌐" : "📱"} {activeSources.length} surse
              </span>
            </div>
            <div className="flex gap-1 items-center flex-wrap">
              {conversations.map((c, i) => (
                <div key={c.phone} className="flex items-center">
                  <button
                    onClick={() => setActiveConvIdx(i)}
                    className={`px-2.5 py-1 rounded-t text-[10px] font-bold transition-all ${
                      activeConvIdx === i
                        ? "bg-purple-600 text-white"
                        : "text-[var(--color-dim)] hover:bg-white/5 border border-b-0 border-[var(--color-border)]"
                    }`}
                  >
                    💬 {c.label} <span className="opacity-50">({c.messages.length})</span>
                  </button>
                  {conversations.length > 1 && (
                    <button
                      onClick={() => deleteConversation(i)}
                      className="text-[9px] text-red-400/50 hover:text-red-400 px-1 transition-colors"
                      title="Șterge conversația"
                    >✕</button>
                  )}
                </div>
              ))}
              <button
                onClick={addNewConversation}
                className="px-2.5 py-1 rounded-t text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/10 border border-b-0 border-emerald-500/20 transition-all"
              >+ Nou</button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {testMessages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-dim)] h-full min-h-[200px]">
                <div className="text-4xl mb-4 opacity-30">💬</div>
                <p className="text-sm text-center">Testează AI-ul ca <strong>{activeConv.label}</strong></p>
                <p className="text-[10px] mt-2 text-center opacity-60">Simulează un client nou ({activeConv.phone})</p>
              </div>
            ) : (
              testMessages.map((m, i) => (
                <div key={`msg-${m.role}-${m.time}-${i}`} className={`flex w-full ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${m.role === "user" ? "bg-white/10 text-white rounded-tl-none" : "bg-purple-600/80 text-white rounded-tr-none"}`}>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.text}</p>
                    <div className={`text-[10px] mt-1.5 flex items-center gap-2 ${m.role === "user" ? "text-gray-400" : "text-purple-200"}`}>
                      <span>{m.time}</span>
                      {m.latency && <span>⚡ {m.latency}ms</span>}
                      {m.fn && <span className="bg-white/10 px-1.5 py-0.5 rounded text-[9px]">🔧 {m.fn}</span>}
                    </div>
                  </div>
                </div>
              ))
            )}
            {testing && (
              <div className="flex justify-end"><div className="bg-purple-600/40 rounded-2xl rounded-tr-none px-4 py-3 text-sm animate-pulse text-purple-200">⏳ AI-ul gândește...</div></div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-3 border-t border-[var(--color-border)] bg-black/40 shrink-0">
            {!aiEnabled ? (
              <div className="flex items-center justify-center gap-2 py-3 bg-red-600/20 border border-red-500/30 rounded-lg text-red-400 text-sm font-bold">
                🔴 AI DEZACTIVAT — nu răspunde la mesaje
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); sendTest(); }} className="flex gap-2">
                <input type="text" value={testInput} onChange={(e) => setTestInput(e.target.value)} disabled={testing}
                  className="flex-1 bg-black/30 border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--color-text)] focus:outline-none focus:border-purple-500/50"
                  placeholder={`Scrie ca ${activeConv.label}...`} />
                <button type="submit" disabled={testing || !testInput.trim()}
                  className="px-4 py-2.5 rounded-lg font-semibold text-sm bg-purple-600 hover:bg-purple-500 text-white transition-all disabled:opacity-50">
                  {testing ? "⏳" : "🚀"}
                </button>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
