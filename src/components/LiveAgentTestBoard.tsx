"use client";

import { useState, useEffect, useRef } from "react";

type Notebook = {
  client_id: string;
  phone_number: string;
  alias?: string | null;
  brand_key?: string | null;
  avatar_url?: string | null;
  last_message_at?: string | null;
};

type Message = {
  id: string;
  sender_type: "client" | "agent" | "ai";
  content: string;
  created_at: string;
};

type AIDecision = {
    id: string;
    suggested_reply: string;
    confidence_score: number;
    conversation_stage: string;
    needs_human_review: boolean;
    can_auto_reply: boolean;
    escalation_reason?: string;
    created_at: string;
};

type AIDraft = {
    id: string;
    draft_type: string;
    structured_data_json: any;
    missing_fields_json: string[];
    updated_at: string;
};

const API_BASE = "/api/admin";

const PREFERRED_FIELD_ORDER = [
  "data",
  "loca",
  "adresa",
  "personajul",
  "detalii",
  "rol",
  "ora",
  "durata",
  "nume_s",
  "v_rst",
  "num_r",
  "metod",
  "situa"
];

const getFieldPriority = (key: string) => {
  const lowerKey = key.toLowerCase();
  for (let i = 0; i < PREFERRED_FIELD_ORDER.length; i++) {
    if (lowerKey.includes(PREFERRED_FIELD_ORDER[i])) return i;
  }
  return 99; // Câmpurile nespecificate se duc la final
};

// Normalize Romanian date strings to a canonical grouping key
// "24 martie 2026", "Marți 24 martie", "24/03/2026", "24.03" → "24-03"
const LUNI_RO: Record<string, string> = {
  ianuarie:'01', ian:'01', january:'01', jan:'01',
  februarie:'02', feb:'02', february:'02',
  martie:'03', mar:'03', march:'03',
  aprilie:'04', apr:'04', april:'04',
  mai:'05', may:'05',
  iunie:'06', jun:'06', june:'06',
  iulie:'07', jul:'07', july:'07',
  august:'08', aug:'08',
  septembrie:'09', sep:'09', sept:'09', september:'09',
  octombrie:'10', oct:'10', october:'10',
  noiembrie:'11', nov:'11', november:'11',
  decembrie:'12', dec:'12', december:'12',
};
const ZILE_RO = ['luni','marți','marti','miercuri','joi','vineri','sâmbătă','sambata','duminică','duminica'];

function normalizeEventDate(raw: string): string {
  if (!raw || raw === 'unknown') return raw;
  const s = raw.trim().toLowerCase();

  // Remove day-of-week prefix: "Marți 24 martie" → "24 martie"
  let cleaned = s;
  for (const zi of ZILE_RO) {
    if (cleaned.startsWith(zi)) { cleaned = cleaned.replace(zi, '').trim(); break; }
  }

  // Try numeric formats: DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY
  const numMatch = cleaned.match(/(\d{1,2})[.\/\-](\d{1,2})(?:[.\/\-]\d{2,4})?/);
  if (numMatch) return `${numMatch[1].padStart(2,'0')}-${numMatch[2].padStart(2,'0')}`;

  // Try "24 martie [2026]" or "martie 24"
  const parts = cleaned.replace(/[,]/g, '').split(/\s+/).filter(Boolean);
  let day: string | null = null;
  let month: string | null = null;
  for (const p of parts) {
    if (/^\d{1,2}$/.test(p) && !day) day = p.padStart(2, '0');
    if (LUNI_RO[p] && !month) month = LUNI_RO[p];
  }
  if (day && month) return `${day}-${month}`;
  if (month && !day) return `??-${month}`;

  // Fallback to raw (will group only exact duplicates)
  return raw.trim().toLowerCase().replace(/^(luni|marți|marti|miercuri|joi|vineri|sâmbătă|sambata|duminică|duminica)\s*/i, '');
}


export default function LiveAgentTestBoard() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [activeSession, setActiveSession] = useState<string>("");
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [decisions, setDecisions] = useState<AIDecision[]>([]);
  const [shadowChat, setShadowChat] = useState<Message[]>([]);
  const [drafts, setDrafts] = useState<AIDraft[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const shadowEndRef = useRef<HTMLDivElement>(null);

  const [aiEnabled, setAiEnabled] = useState(true);
  const [togglingAi, setTogglingAi] = useState(false);
  const [crmEnabled, setCrmEnabled] = useState(false);
  const [togglingCrm, setTogglingCrm] = useState(false);

  useEffect(() => {
    fetch("/api/vertex/config?brand=GLOBAL")
      .then(res => res.json())
      .then(data => {
        const aiCfg = (data.config || []).find((c: any) => c.config_key === "ai_enabled");
        if (aiCfg) setAiEnabled(aiCfg.config_value !== "false");
        
        const crmCfg = (data.config || []).find((c: any) => c.config_key === "crm_enabled");
        if (crmCfg) setCrmEnabled(crmCfg.config_value === "true");
      })
      .catch(console.error);
  }, []);

  const toggleAi = async () => {
    setTogglingAi(true);
    const newVal = !aiEnabled;
    try {
      await fetch("/api/vertex/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "ai_enabled", value: String(newVal), brand: "GLOBAL" }),
      });
      setAiEnabled(newVal);
    } catch (e) {
      console.error("Toggle AI:", e);
    }
    setTogglingAi(false);
  };

  const toggleCrm = async () => {
    setTogglingCrm(true);
    const newVal = !crmEnabled;
    try {
      await fetch("/api/vertex/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "crm_enabled", value: String(newVal), brand: "GLOBAL" }),
      });
      setCrmEnabled(newVal);
    } catch (e) {
      console.error("Toggle CRM:", e);
    }
    setTogglingCrm(false);
  };

  // Auto-scroll to show newest message at bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages.length]);

  useEffect(() => {
    shadowEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [shadowChat.length]);

  // 1. Fetch Conversations (Notebooks)
  useEffect(() => {
    const fetchNotebooks = async () => {
      try {
        const res = await fetch(`${API_BASE}/client-notebooks?_t=${Date.now()}`, { cache: "no-store" });
        const data = await res.json();
        setNotebooks(data.notebooks || []);
      } catch (err) {}
    };
    fetchNotebooks();
    const interval = setInterval(fetchNotebooks, 5000);
    return () => clearInterval(interval);
  }, []);

  // 2. Poll Messages & Brain State for active session
  useEffect(() => {
    if (!activeSession) return;
    
    let isMounted = true;
    const fetchLiveData = async () => {
      try {
        // Fetch Chat
        const detailRes = await fetch(`${API_BASE}/crm/clients/${activeSession}?_t=${Date.now()}`, { cache: "no-store" });
        const detailData = await detailRes.json();
        
        // Fetch Brain
        const brainRes = await fetch(`${API_BASE}/live-agent/brain?client_id=${activeSession}&_t=${Date.now()}`, { cache: "no-store" });
        const brainData = await brainRes.json();

        if (isMounted) {
          setMessages([...(detailData.latest_messages || [])]);
          setDecisions(brainData.decisions || []);
          setShadowChat(brainData.shadow_chat || []);
          if (brainData.drafts && brainData.drafts.length > 0) {
              setDrafts(brainData.drafts); 
          } else {
              setDrafts([]);
          }
        }
      } catch (err) {
        console.error("Failed to fetch live data:", err);
      }
    };

    fetchLiveData();
    const interval = setInterval(fetchLiveData, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeSession]);

  return (
    <div className="flex-1 flex gap-4 p-4 overflow-hidden h-[calc(100vh-56px)] bg-[#0b0c10]">
      {/* LEFT SIDEBAR: CONVERSATIONS */}
      <section className="w-[280px] bg-[#14161a] rounded-2xl border border-white/5 flex flex-col overflow-hidden shrink-0 shadow-2xl h-full">
        <header className="px-5 py-3 border-b border-white/5 bg-black/20 flex justify-between items-center shrink-0">
          <h2 className="font-bold text-sm text-gray-200">📇 Clienți (Live)</h2>
          <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded font-mono">{notebooks.length}</span>
        </header>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {notebooks.map((n, idx) => (
            <button
              key={`${n.client_id}-${idx}`}
              onClick={() => {
                 setActiveSession(n.client_id);
                 setMessages([]);
                 setDecisions([]);
                 setShadowChat([]);
                 setDrafts([]);
              }}
              className={`w-full text-left p-3 rounded-xl transition-all border flex gap-3 items-center ${
                activeSession === n.client_id 
                  ? "bg-emerald-600/20 border-emerald-500/50" 
                  : "bg-black/20 border-transparent hover:bg-white/5"
              }`}
            >
              <div className="w-10 h-10 shrink-0 rounded-full bg-gray-800 border border-white/10 overflow-hidden flex items-center justify-center">
                 {n.avatar_url ? <img src={n.avatar_url} alt="avatar" className="w-full h-full object-cover" /> : <span className="opacity-50">👤</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate text-white mb-0.5">{n.alias || n.phone_number}</div>
                <div className="flex justify-between items-center gap-1">
                  <div className="text-[10px] text-gray-400 truncate">{n.phone_number}</div>
                  {n.last_message_at && (
                    <div className="text-[10px] text-emerald-400 shrink-0 whitespace-nowrap font-mono">
                      {new Date(n.last_message_at as string).toLocaleDateString('ro-RO', {day:'2-digit',month:'2-digit'})}{' '}
                      {new Date(n.last_message_at as string).toLocaleTimeString('ro-RO', {hour:'2-digit',minute:'2-digit'})}
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* RIGHT AREA: 2x2 GRID */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-4 h-full min-w-0">
        
        {/* TOP LEFT: Chat Client */}
        <section className="bg-[#14161a] rounded-2xl border border-white/5 flex flex-col overflow-hidden shadow-xl">
          <header className="p-3 border-b border-white/5 bg-black/20 flex justify-between items-center shrink-0">
            <h2 className="font-bold text-sm text-gray-200 flex items-center gap-2">💬 Chat Client</h2>
            <button onClick={toggleAi} disabled={togglingAi} className={`px-3 py-1 rounded text-[9px] font-black tracking-widest uppercase transition-all ${aiEnabled ? "bg-emerald-600 border border-emerald-400 text-white shadow-emerald-500/30" : "bg-red-500/10 text-red-500 border border-red-500/20 animate-pulse"}`}>
               {togglingAi ? "⏳" : aiEnabled ? "● AI ON (LIVE)" : "● AI OFF (SHADOW)"}
            </button>
          </header>
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 relative flex flex-col">
            {!activeSession ? (
              <div className="m-auto text-center text-gray-500 italic text-sm">Selectează un client din stânga.</div>
            ) : messages.length === 0 ? (
              <div className="m-auto text-center text-gray-500 italic text-sm">Niciun mesaj recent.</div>
            ) : (
              messages.slice().map((m, i) => {
                const isClient = m.sender_type === "client";
                const isAi = m.sender_type === "ai";
                let wrapCss = isClient ? "items-start" : "items-end";
                let bubbleCss = isClient ? "bg-white/10 text-white rounded-tl-none border border-white/5" : isAi ? "bg-emerald-900/40 text-emerald-100 rounded-tr-none border border-emerald-500/30" : "bg-purple-900/40 text-white rounded-tr-none border border-purple-500/30";
                return (
                  <div key={i} className={`flex flex-col w-full ${wrapCss}`}>
                    {!isClient && <div className={`text-[8px] font-bold uppercase tracking-widest mb-1 ml-1 ${isAi ? "text-emerald-400" : "text-purple-400"}`}>{isAi ? "🤖 Trimis de AI" : "👤 Trimis de Om"}</div>}
                    {isClient && <div className="text-[8px] font-bold text-purple-400 uppercase tracking-widest mb-1 ml-1">👤 TRIMIS DE OM</div>}
                    <div className={`p-3 rounded-2xl max-w-[85%] text-[13px] leading-relaxed ${bubbleCss}`}>
                      {m.content}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </section>

        {/* TOP RIGHT: Acțiuni CRM (Real) */}
        <section className="bg-gradient-to-br from-[#14161a] to-emerald-900/10 rounded-2xl border border-emerald-500/20 flex flex-col overflow-hidden shadow-[0_0_30px_rgba(16,185,129,0.05)]">
          <header className="p-3 border-b border-emerald-500/20 bg-emerald-900/20 flex justify-between items-center shrink-0">
            <h2 className="font-bold text-sm text-emerald-400 flex items-center gap-2">✅ Acțiuni CRM (Realizate)</h2>
            <button onClick={toggleCrm} disabled={togglingCrm} className={`px-4 py-1.5 rounded text-[10px] font-black tracking-widest uppercase shadow-lg ${crmEnabled ? "bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20" : "bg-red-500 text-white hover:bg-red-400 shadow-red-500/20"}`}>
                {togglingCrm ? "⏳" : crmEnabled ? "CREARE ON" : "CREARE OFF"}
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {drafts.length === 0 ? (
               <div className="m-auto text-center text-gray-500 text-sm italic py-10">În așteptarea extracției...</div>
            ) : !crmEnabled ? (
               <div className="m-auto text-center py-10">
                 <span className="text-3xl block mb-2">⛔</span>
                 <div className="font-bold text-red-500 uppercase tracking-wider text-xs">Creare Blocată</div>
                 <p className="text-xs text-gray-500 mt-2">Funcția de scriere activă în CRM este oprită manual.</p>
               </div>
            ) : (
                <>
                  {(() => {
                    // Group drafts by event date → show one grouped card per event
                    const grouped = new Map<string, AIDraft[]>();
                    for (const draft of drafts) {
                      const data = draft.structured_data_json || {};
                      const rawDate = Object.entries(data).find(([k]) => k.toLowerCase().includes('data'))?.[1] as string || 'unknown';
                      const dateKey = normalizeEventDate(rawDate);
                      if (!grouped.has(dateKey)) grouped.set(dateKey, []);
                      grouped.get(dateKey)!.push(draft);
                    }
                    return Array.from(grouped.entries()).map(([eventDate, group], gIdx) => {
                      const first = group[0].structured_data_json || {};
                      const location = Object.entries(first).find(([k]) => k.toLowerCase().includes('loca'))?.[1] as string || '';
                      const occasion = Object.entries(first).find(([k]) => k.toLowerCase().includes('sarbator') || k.toLowerCase().includes('srbt'))?.[1] as string || '';
                      return (
                        <div key={gIdx} className="bg-black/80 rounded-xl p-4 text-emerald-100 border-2 border-emerald-500/50 shadow-lg relative" style={{borderColor: "rgba(16, 185, 129, 0.5)", boxShadow: "inset 0 0 20px rgba(16,185,129,0.05)}"}}>
                          <div className="absolute top-0 right-0 bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded-bl-xl font-bold text-[9px] uppercase border-b border-l border-emerald-500/50">VERIFICAT DB</div>
                          {/* Header — date + location */}
                          <div className="mb-3 pb-2 border-b border-emerald-500/30">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-lg">🎉</span>
                              <span className="font-bold text-white text-[13px] tracking-wide">{eventDate}</span>
                              <span className="text-[10px] text-emerald-400 opacity-70">{group.length} servicii</span>
                            </div>
                            {location && <div className="text-[10px] text-emerald-300/70">📍 {location}{occasion ? ` · 🎂 ${occasion}` : ''}</div>}
                          </div>
                          {/* One sub-row per service/personaj */}
                          <div className="space-y-2">
                            {group.map((draft, sIdx) => {
                              const d = draft.structured_data_json || {};
                              const personaj = Object.entries(d).find(([k]) => k.toLowerCase().includes('personaj'))?.[1] as string || '';
                              const ora = Object.entries(d).find(([k]) => k.toLowerCase().includes('ora'))?.[1] as string || '';
                              const dur = Object.entries(d).find(([k]) => k.toLowerCase().includes('durata') || k.toLowerCase().includes('durat'))?.[1] as string || '';
                              const slotLabel = String.fromCharCode(65 + sIdx); // A, B, C...
                              return (
                                <div key={sIdx} className="flex items-center gap-2 bg-emerald-900/20 rounded-lg px-3 py-2 border border-emerald-700/30">
                                  <span className="font-mono text-[10px] font-bold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded shrink-0">{slotLabel}</span>
                                  <span className="font-bold text-emerald-200 text-[12px]">{draft.draft_type}</span>
                                  {personaj && <span className="text-[11px] text-emerald-300/80">— {personaj}</span>}
                                  {ora && <span className="text-[10px] text-emerald-400/60 ml-auto">⏰ {ora}</span>}
                                  {dur && <span className="text-[10px] text-emerald-400/60">⌛ {dur}h</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </>
            )}
          </div>
        </section>

        {/* BOTTOM LEFT: AI BRAIN DECISION / SHADOW CHAT */}
        <section className="bg-[#14161a] rounded-2xl border border-white/5 flex flex-col overflow-hidden shadow-xl">
          <header className="p-3 border-b border-white/5 bg-black/20 flex justify-between items-center shrink-0">
            <h2 className="font-bold text-sm text-gray-200 flex items-center gap-2">🤖 Simulator AI (Shadow)</h2>
            <div className="bg-gray-800 text-gray-300 px-3 py-1 rounded text-[9px] font-bold tracking-widest uppercase">{shadowChat.length} MSJ PREGĂTITE</div>
          </header>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 relative flex flex-col">
            {shadowChat.length === 0 ? (
              <div className="m-auto text-center text-gray-500 italic text-sm">Aștept prima interacțiune pură a AI-ului...</div>
            ) : (
              shadowChat.map((m, i) => {
                const isClient = m.sender_type === "client";
                const isAi = m.sender_type === "ai";
                const matchedDecision = isAi ? decisions.find(d => d.suggested_reply.includes(m.content.substring(0, 20)) || m.content.includes(d.suggested_reply.substring(0, 20))) : null;

                return (
                  <div key={i} className={`flex w-full flex-col ${isClient ? "items-start" : "items-end"}`}>
                     {!isClient && !isAi && <div className="text-[8px] font-bold text-purple-400 uppercase tracking-widest mb-1 ml-1">👤 Trimis de Om</div>}
                     {isClient && <div className="text-[8px] font-bold text-purple-400 uppercase tracking-widest mb-1 ml-1">👤 TRIMIS DE OM</div>}
                    
                     <div className={`max-w-[90%] rounded-2xl px-3 py-2 ${isClient ? "bg-white/10 text-white rounded-tl-none border border-white/5" : "bg-[#1e1c27] text-gray-200 rounded-tr-none border border-purple-500/20 shadow-lg leading-relaxed text-[13px]"}`}>
                      {isAi && (
                        <div className="flex justify-between items-center mb-1.5 pb-1.5 border-b border-purple-500/30">
                          <div className="text-[8px] uppercase tracking-wider font-bold text-gray-500 flex items-center gap-1">
                            🤖 Răspuns Generat
                          </div>
                          {matchedDecision && (
                            <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${matchedDecision.confidence_score >= 75 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' : 'bg-orange-500/20 text-orange-400 border-orange-500/20'}`}>
                               {matchedDecision.confidence_score}% ÎNCREDERE
                            </div>
                          )}
                        </div>
                      )}
                      
                      {m.content}
                    </div>
                    
                    {isAi && matchedDecision && (
                       <div className="max-w-[90%] mt-2 px-1 flex flex-wrap justify-end gap-1">
                         {matchedDecision.can_auto_reply ? (
                           <span className="text-[8px] bg-emerald-900/40 text-emerald-400 px-2 py-0.5 rounded font-bold uppercase border border-emerald-800/30">✓ Auto-Reply</span>
                         ) : (
                           <span className="text-[8px] bg-red-900/40 text-red-500 px-2 py-0.5 rounded font-bold uppercase border border-red-800/30">✕ Fără Auto-Reply</span>
                         )}
                         <span className="text-[8px] bg-blue-900/40 text-blue-400 px-2 py-0.5 rounded font-bold uppercase border border-blue-800/30">Etapa: {matchedDecision.conversation_stage}</span>
                       </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={shadowEndRef} />
          </div>
        </section>

        {/* BOTTOM RIGHT: SIMULATED DRAFTS */}
        <section className="bg-[#24151f] rounded-2xl border border-pink-500/30 flex flex-col overflow-hidden shadow-xl">
          <header className="p-3 border-b border-pink-500/30 bg-[#301625] flex justify-between items-center shrink-0">
            <h2 className="font-bold text-sm text-pink-500 flex items-center gap-2 opacity-90">👁️ Extragere AI (Pre-Salvare)</h2>
            <div className="text-[9px] text-[#ec4899] opacity-70 bg-pink-900/40 px-2 py-0.5 rounded border border-pink-500/30 font-mono tracking-widest">
               {drafts.length > 0 ? `ACTUALIZAT: ${new Date(drafts[0].updated_at).toLocaleTimeString()}` : "AȘTEAPTĂ CONFIRMĂRI"}
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {drafts.length === 0 ? (
              <div className="text-[var(--color-dim)] text-center mt-10 text-sm italic">Nu a extras niciun formular încă...</div>
            ) : (
                <>
                  {(() => {
                    // Group drafts by event date
                    const grouped = new Map<string, AIDraft[]>();
                    for (const draft of drafts) {
                      const data = draft.structured_data_json || {};
                      const rawDate = Object.entries(data).find(([k]) => k.toLowerCase().includes('data'))?.[1] as string || 'unknown';
                      const dateKey = normalizeEventDate(rawDate);
                      if (!grouped.has(dateKey)) grouped.set(dateKey, []);
                      grouped.get(dateKey)!.push(draft);
                    }
                    return Array.from(grouped.entries()).map(([eventDate, group], gIdx) => {
                      const first = group[0].structured_data_json || {};
                      const location = Object.entries(first).find(([k]) => k.toLowerCase().includes('loca'))?.[1] as string || '';
                      const allMissing = Array.from(new Set(group.flatMap(d => d.missing_fields_json || [])));
                      return (
                        <div key={gIdx} className="bg-black/60 rounded-xl p-3 text-pink-100 border border-pink-500/40 border-dashed w-full relative" style={{boxShadow: "inset 0 0 20px rgba(236, 72, 153, 0.05)}"}}>
                          <div className="absolute top-0 right-0 bg-pink-500/20 text-pink-400 px-2 py-0.5 rounded-bl-xl font-bold text-[8px] uppercase border-b border-l border-pink-500/50">DRAFT (AI)</div>
                          {/* Header */}
                          <div className="font-bold text-pink-400 uppercase tracking-wider text-[11px] flex items-center gap-2 mb-2 border-b border-pink-500/20 pb-2">
                            <span>📝</span>
                            <span>{eventDate}</span>
                            {group.length > 1 && <span className="text-pink-300/60 normal-case font-normal">{group.length} servicii</span>}
                          </div>
                          {location && <div className="text-[10px] text-pink-300/60 mb-2">📍 {location}</div>}
                          {allMissing.length > 0 && (
                            <div className="bg-red-900/20 rounded p-2 mb-2 border border-red-500/30">
                              <div className="text-[9px] text-red-400 uppercase font-bold mb-1">Câmpuri Lipsă:</div>
                              <ul className="text-[10px] text-red-300 list-disc pl-4 space-y-0.5">
                                {allMissing.map((f, i) => <li key={i}>{f}</li>)}
                              </ul>
                            </div>
                          )}
                          {/* Sub-rows per service */}
                          <div className="space-y-1.5">
                            {group.map((draft, sIdx) => {
                              const d = draft.structured_data_json || {};
                              const personaj = Object.entries(d).find(([k]) => k.toLowerCase().includes('personaj'))?.[1] as string || '';
                              const ora = Object.entries(d).find(([k]) => k.toLowerCase().includes('ora'))?.[1] as string || '';
                              const dur = Object.entries(d).find(([k]) => k.toLowerCase().includes('durata') || k.toLowerCase().includes('durat'))?.[1] as string || '';
                              const slotLabel = String.fromCharCode(65 + sIdx);
                              return (
                                <div key={sIdx} className="flex items-center gap-2 bg-pink-900/20 rounded-lg px-2 py-1.5 border border-pink-700/30">
                                  <span className="font-mono text-[9px] font-bold bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded shrink-0">{slotLabel}</span>
                                  <span className="font-bold text-pink-200 text-[11px]">{draft.draft_type}</span>
                                  {personaj && <span className="text-[10px] text-pink-300/70">— {personaj}</span>}
                                  {ora && <span className="text-[10px] text-pink-400/50 ml-auto">⏰ {ora}</span>}
                                  {dur && <span className="text-[10px] text-pink-400/50">⌛ {dur}h</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
