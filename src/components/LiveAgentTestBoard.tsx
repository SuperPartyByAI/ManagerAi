"use client";

import { useState, useEffect, useRef } from "react";

type Notebook = {
  client_id: string;
  phone_number: string;
  alias?: string | null;
  brand_key?: string | null;
  avatar_url?: string | null;
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

export default function LiveAgentTestBoard() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [activeSession, setActiveSession] = useState<string>("");
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [decisions, setDecisions] = useState<AIDecision[]>([]);
  const [shadowChat, setShadowChat] = useState<Message[]>([]);
  const [draft, setDraft] = useState<AIDraft | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shadowEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chats
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
    if (!activeSession) {
      setMessages([]);
      setDecisions([]);
      setShadowChat([]);
      setDraft(null);
      return;
    }
    
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
              setDraft(brainData.drafts[0]);
          } else {
              setDraft(null);
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
    <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 p-4 overflow-hidden h-full">
      {/* COLUMN 1: CONVERSATIONS */}
      <section className="glass-panel rounded-2xl flex flex-col h-full overflow-hidden">
        <header className="px-4 py-3 border-b border-[var(--color-border)] bg-black/40 flex justify-between items-center shrink-0">
          <h2 className="font-semibold flex items-center gap-2">
            <span className="text-lg">📇</span> Clienți (Live)
          </h2>
          <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">{notebooks.length}</span>
        </header>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {notebooks.map((n, idx) => (
            <button
              key={`${n.client_id}-${idx}`}
              onClick={() => setActiveSession(n.client_id)}
              className={`w-full text-left p-3 rounded-xl transition-all border flex gap-3 items-center ${
                activeSession === n.client_id 
                  ? "bg-emerald-600/20 border-emerald-500/50" 
                  : "bg-black/20 border-transparent hover:bg-white/5 hover:border-[var(--color-border)]"
              }`}
            >
              <div className="w-10 h-10 shrink-0 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden flex items-center justify-center">
                 {n.avatar_url ? <img src={n.avatar_url} alt="avatar" className="w-full h-full object-cover" /> : <span className="opacity-50">👤</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm mb-1 truncate">{n.alias || n.phone_number}</div>
                <div className="text-[10px] text-[var(--color-dim)]">{n.phone_number}</div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* COLUMN 2: CHAT HISTORY */}
      <section className="glass-panel rounded-2xl flex flex-col h-full overflow-hidden">
        <header className="px-4 py-3 border-b border-[var(--color-border)] bg-black/40 flex justify-between items-center shrink-0">
          <h2 className="font-semibold flex items-center gap-2 text-blue-400">
            <span className="text-lg">💬</span> Chat Client
          </h2>
        </header>
        <div className="flex-1 bg-black/40 p-4 overflow-y-auto relative flex flex-col gap-3">
          {!activeSession ? (
            <div className="m-auto text-center text-[var(--color-dim)] italic">Selectează un client.</div>
          ) : messages.length === 0 ? (
            <div className="m-auto text-center text-[var(--color-dim)] italic">Niciun mesaj recent.</div>
          ) : (
            messages.slice().reverse().map((m, i) => {
              const isClient = m.sender_type === "client";
              const isAi = m.sender_type === "ai";
              let bubbleColor = "bg-purple-600 text-white rounded-tr-none"; // Agent or manual
              if (isClient) bubbleColor = "bg-white/10 text-white rounded-tl-none";
              if (isAi) bubbleColor = "bg-emerald-600 text-white rounded-tr-none"; // Sent by AI

              return (
                <div key={i} className={`flex w-full ${isClient ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${bubbleColor}`}>
                    {isAi && <div className="text-[8px] uppercase tracking-wider font-bold mb-1 opacity-70">🤖 Trimis de AI</div>}
                    {!isClient && !isAi && <div className="text-[8px] uppercase tracking-wider font-bold mb-1 opacity-70">👤 Trimis de Om</div>}
                    <p className="text-xs whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    <div className="text-[9px] mt-1 opacity-50 text-right">
                      {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </section>

      {/* COLUMN 3: AI BRAIN DECISION / SHADOW CHAT */}
      <section className="glass-panel rounded-2xl flex flex-col h-full overflow-hidden border border-purple-500/20">
        <header className="px-4 py-3 border-b border-purple-500/20 bg-purple-900/10 flex justify-between items-center shrink-0">
          <h2 className="font-semibold flex items-center gap-2 text-purple-400">
            <span className="text-lg">🤖</span> Simulator AI (Shadow)
          </h2>
          {shadowChat.length > 0 && <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-1 rounded">{shadowChat.length} Mesaje Antrenament</span>}
        </header>
        <div className="flex-1 bg-black/40 p-4 overflow-y-auto relative flex flex-col gap-3">
          {shadowChat.length === 0 ? (
            <div className="m-auto text-center text-[var(--color-dim)] italic text-sm">Aștept prima interacțiune pură a AI-ului...</div>
          ) : (
            shadowChat.map((m, i) => {
              const isClient = m.sender_type === "client";
              const isAi = m.sender_type === "ai";
              
              // Corelate AI message to its decision metadata
              const matchedDecision = isAi ? decisions.find(d => 
                 d.suggested_reply.includes(m.content.substring(0, 20)) || m.content.includes(d.suggested_reply.substring(0, 20))
              ) : null;

              return (
                <div key={i} className={`flex w-full flex-col ${isClient ? "items-start" : "items-end"}`}>
                  <div className={`max-w-[90%] rounded-2xl px-3 py-2 ${isClient ? "bg-white/10 text-white rounded-tl-none" : "bg-purple-900/30 border border-purple-600/40 text-white rounded-tr-none"}`}>
                    
                    {isAi && (
                      <div className="flex justify-between items-center mb-1.5 pb-1.5 border-b border-purple-500/30">
                        <div className="text-[8px] uppercase tracking-wider font-bold text-purple-300 flex items-center gap-1">
                          🤖 Răspuns Generat
                        </div>
                        {matchedDecision && (
                          <div className="flex items-center gap-2">
                             <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${matchedDecision.confidence_score >= 75 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-orange-500/20 text-orange-300'}`}>
                                {matchedDecision.confidence_score}% INCREDERE
                             </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {!isClient && !isAi && <div className="text-[8px] uppercase tracking-wider font-bold mb-1 opacity-70">👤 Trimis de Om</div>}
                    <p className="text-xs whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    <div className="text-[9px] mt-1 opacity-50 text-right">
                      {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  
                  {/* Decision Additional Metadata Drawer underneath bubble */}
                  {isAi && matchedDecision && (
                     <div className="max-w-[90%] mt-1 px-2 flex justify-end gap-1">
                       {matchedDecision.can_auto_reply ? (
                         <span className="text-[8px] bg-emerald-900/40 text-emerald-400 px-1 py-0.5 rounded border border-emerald-800/30">✓ Auto-Reply</span>
                       ) : (
                         <span className="text-[8px] bg-red-900/40 text-red-400 px-1 py-0.5 rounded border border-red-800/30">✕ Fără Auto-Reply</span>
                       )}
                       <span className="text-[8px] bg-blue-900/40 text-blue-400 px-1 py-0.5 rounded border border-blue-800/30 capitalize">Etapa: {matchedDecision.conversation_stage}</span>
                       {matchedDecision.escalation_reason && (
                         <span className="text-[8px] bg-orange-900/40 text-orange-400 px-1 py-0.5 rounded border border-orange-800/30 truncate max-w-[150px]">
                           {matchedDecision.escalation_reason}
                         </span>
                       )}
                     </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={shadowEndRef} />
        </div>
      </section>

      {/* COLUMN 4: AI CRM EXTRACTION */}
      <section className="glass-panel rounded-2xl flex flex-col h-full overflow-hidden border border-pink-500/20">
        <header className="px-4 py-3 border-b border-pink-500/20 bg-pink-900/10 flex justify-between items-center shrink-0">
          <h2 className="font-semibold flex items-center gap-2 text-pink-400">
            <span className="text-lg">👁️</span> JSON Creat (CRM)
          </h2>
          {draft && <span className="text-[10px] bg-pink-500/20 text-pink-300 px-2 py-1 rounded">Actualizat la {new Date(draft.updated_at).toLocaleTimeString()}</span>}
        </header>
        <div className="flex-1 bg-black/20 p-4 overflow-y-auto space-y-4">
          {!draft ? (
            <div className="text-[var(--color-dim)] text-center mt-10 text-sm">Nu a extras niciun formular încă...</div>
          ) : (
            <>
              {/* Draft Typ */}
              <div className="bg-black/40 rounded-lg p-3 border border-[var(--color-border)] mb-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase text-[var(--color-dim)]">Tip Eveniment Extras</span>
                  <span className="text-xs font-bold text-pink-400">{draft.draft_type}</span>
                </div>
              </div>

              {/* Missing Fields */}
              {draft.missing_fields_json && draft.missing_fields_json.length > 0 && (
                <div className="bg-red-900/10 rounded-lg p-3 border border-red-500/30 mb-3">
                  <div className="text-[10px] text-red-400 uppercase font-bold mb-2">Informații Lipsă Deducționate</div>
                  <ul className="text-xs text-red-200 list-disc pl-4 space-y-1">
                    {draft.missing_fields_json.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}

              {/* Structured JSON */}
              <div className="bg-black/60 rounded-xl border border-white/5 relative group">
                <div className="absolute top-0 right-0 bg-white/10 px-2 py-1 text-[8px] rounded-bl uppercase tracking-wider text-[var(--color-dim)] font-mono">
                  LIVE JSON
                </div>
                <pre className="text-[10px] text-emerald-300 font-mono p-4 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {JSON.stringify(draft.structured_data_json, null, 2)}
                </pre>
              </div>
            </>
          )}
        </div>
      </section>

    </div>
  );
}
