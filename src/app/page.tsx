"use client";

import { useState, useEffect } from "react";

// Types based on the existing Express schema
type Message = {
  id: string;
  sender_type: "client" | "ai";
  content: string;
  created_at: string;
};

type Notebook = {
  phone_number: string;
  template_key: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extracted_data: Record<string, any>;
  updated_at: string;
};

const API_BASE = "/api/admin";

// Helpers
function formatKeyTitle(key: string) {
  return key.replace(/_/g, " ");
}

function extractColorsFromStrings(text: string) {
  const lower = text.toLowerCase();
  const map = [
    { name: "Roz", kw: ["roz", "pink"], hex: "#ec4899" },
    { name: "Albastru", kw: ["albastru", "albastra", "bleu", "blue"], hex: "#3b82f6" },
    { name: "Auriu", kw: ["auriu", "gold", "aurie"], hex: "#fbbf24" },
    { name: "Argintiu", kw: ["argintiu", "silver", "argintie"], hex: "#d1d5db" },
    { name: "Verde", kw: ["verde", "green"], hex: "#10b981" },
    { name: "Roșu", kw: ["rosu", "red", "rosie"], hex: "#ef4444" },
    { name: "Mov", kw: ["mov", "violet", "purple"], hex: "#8b5cf6" },
  ];
  return map.filter((c) => c.kw.some((k) => lower.includes(k)));
}

export default function CopilotPage() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [activeSession, setActiveSession] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);

  // 1. Fetch active notebooks (sessions) every 5 seconds
  useEffect(() => {
    const fetchNotebooks = async () => {
      try {
        const res = await fetch(`${API_BASE}/client-notebooks`);
        const data = await res.json();
        setNotebooks(data.notebooks || []);
      } catch (err) {
        console.error("Failed to fetch notebooks:", err);
      }
    };

    fetchNotebooks();
    const interval = setInterval(fetchNotebooks, 5000);
    return () => clearInterval(interval);
  }, []);

  // 2. Poll messages for active session
  useEffect(() => {
    let isMounted = true;
    
    const fetchMessages = async () => {
      if (!activeSession) {
        if (isMounted) { setMessages([]); setIsLoadingMessages(false); }
        return;
      }
      try {
        const cRes = await fetch(`${API_BASE}/crm/clients?search=${encodeURIComponent(activeSession)}`);
        const cData = await cRes.json();
        const clientId = cData.clients?.[0]?.id;

        if (clientId && isMounted) {
          const detailRes = await fetch(`${API_BASE}/crm/clients/${clientId}`);
          const detailData = await detailRes.json();
          setMessages([...(detailData.latest_messages || [])].reverse());
          setIsLoadingMessages(false);
        } else if (!clientId && isMounted) {
           setIsLoadingMessages(false);
        }
      } catch (err) {
        console.error("Failed to fetch messages:", err);
        if (isMounted) setIsLoadingMessages(false);
      }
    };

    setIsLoadingMessages(true);
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeSession, messages.length]);

  const activeNotebook = notebooks.find((n) => n.phone_number === activeSession);
  const extData = activeNotebook?.extracted_data || {};
  const occasion = extData["ocazia"] || extData["tipul_petrecerii"] || "Eveniment";
  const occTitle = String(occasion).toUpperCase();

  const ignoreKeys = ["data_evenimentului", "data", "locatia", "localitatea", "judetul", "ocazia", "tipul_petrecerii", "numar_copii", "varsta_copiilor"];
  const services = Object.entries(extData).filter(([k, v]) => !ignoreKeys.includes(k) && v && String(v).trim() !== "" && String(v).toLowerCase() !== "null");

  const colorsFound = extractColorsFromStrings(Object.values(extData).join(" "));
  
  let totalEst = 0;
  const cardsHtml: React.ReactNode[] = [];
  
  const extKeysString = Object.keys(extData).join(" ");
  if (extKeysString.includes("animator") || extKeysString.includes("personaje")) {
     totalEst += 350;
     cardsHtml.push(
       <div key="animator" className="visual-card animate-in fade-in zoom-in duration-300">
         <div className="text-3xl mb-2 drop-shadow-md">🦸‍♂️</div>
         <h4 className="font-bold text-sm mb-1">Animatori</h4>
         <div className="text-[10px] text-[var(--color-dim)]">Activ și Energie</div>
       </div>
     );
  }
  if (extKeysString.includes("baloa") || extKeysString.includes("arcada")) {
    totalEst += 450;
    cardsHtml.push(
      <div key="baloane" className="visual-card animate-in fade-in zoom-in duration-300 delay-100">
        <div className="text-3xl mb-2 drop-shadow-md">🎈</div>
        <h4 className="font-bold text-sm mb-1">Decor Baloane</h4>
        <div className="text-[10px] text-[var(--color-dim)]">Atmosferă Magică</div>
      </div>
    );
  }
  if (extKeysString.includes("ursitoare")) {
    totalEst += 400;
    cardsHtml.push(
      <div key="ursitoare" className="visual-card animate-in fade-in zoom-in duration-300 delay-200">
        <div className="text-3xl mb-2 drop-shadow-md">🧚‍♀️</div>
        <h4 className="font-bold text-sm mb-1">Ursitoare</h4>
        <div className="text-[10px] text-[var(--color-dim)]">Tradiție și Emoție</div>
      </div>
    );
  }
  if (extKeysString.includes("vata") || extKeysString.includes("popcorn") || extKeysString.includes("dulce")) {
    totalEst += 300;
    cardsHtml.push(
      <div key="food" className="visual-card animate-in fade-in zoom-in duration-300 delay-300">
        <div className="text-3xl mb-2 drop-shadow-md">🍭</div>
        <h4 className="font-bold text-sm mb-1">Fun Food</h4>
        <div className="text-[10px] text-[var(--color-dim)]">Vată & Popcorn</div>
      </div>
    );
  }

  if (cardsHtml.length === 0 && services.length > 0) {
    cardsHtml.push(
      <div key="custom" className="visual-card animate-in fade-in zoom-in duration-300 col-span-2">
        <div className="text-3xl mb-2 drop-shadow-md">✨</div>
        <h4 className="font-bold text-sm mb-1">Servicii Personalizate</h4>
        <div className="text-[10px] text-[var(--color-dim)]">Detectate în discuție</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Topbar */}
      <header className="h-14 shrink-0 flex items-center justify-between px-6 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-lg bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg">
            AI
          </div>
          <div>
            <h1 className="font-bold text-base tracking-wide">Manager AI</h1>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-dim)]">
              Superparty Copilot
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
            <span className="text-xs font-medium text-emerald-400">Hub Activ</span>
          </div>

          <div className="text-xs text-[var(--color-dim)] bg-black/50 px-3 py-1.5 rounded-md border border-[var(--color-border)]">
            Sesiune curentă: {activeSession || "Niciuna"}
          </div>
        </div>
      </header>

      {/* Main 4-Column Grid */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 p-4 overflow-hidden h-full">
        {/* Column 1: Conversations List */}
        <section className="glass-panel rounded-2xl flex flex-col h-full overflow-hidden">
          <header className="px-4 py-3 border-b border-[var(--color-border)] bg-black/40 flex justify-between items-center shrink-0">
            <h2 className="font-semibold flex items-center gap-2">
              <span className="text-lg">📇</span> Conversații Active
            </h2>
            <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">{notebooks.length}</span>
          </header>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {notebooks.length === 0 ? (
              <div className="text-center p-4 text-[var(--color-dim)] text-sm">Nu s-au găsit clienți recenți.</div>
            ) : (
              notebooks.map((n) => (
                <button
                  key={n.phone_number}
                  onClick={() => setActiveSession(n.phone_number)}
                  className={`w-full text-left p-3 rounded-xl transition-all border ${
                    activeSession === n.phone_number 
                      ? "bg-purple-600/20 border-purple-500/50" 
                      : "bg-black/20 border-transparent hover:bg-white/5 hover:border-[var(--color-border)]"
                  }`}
                >
                  <div className="font-semibold text-sm mb-1">{n.phone_number}</div>
                  <div className="text-[10px] text-[var(--color-dim)] flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                    {n.template_key}
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Column 2: Live Feed */}
        <section className="glass-panel rounded-2xl flex flex-col h-full overflow-hidden">
          <header className="px-4 py-3 border-b border-[var(--color-border)] bg-black/40 flex justify-between items-center shrink-0">
            <h2 className="font-semibold flex items-center gap-2">
              <span className="text-lg">💬</span> Live Feed WhatsApp
            </h2>
          </header>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {!activeSession && (
              <div className="flex-1 flex flex-col justify-center items-center text-[var(--color-dim)] h-full">
               <div className="text-3xl mb-2 opacity-50">📱</div>
               <p>Selectează o sesiune pentru a vedea chat-ul.</p>
              </div>
            )}
            
            {activeSession && isLoadingMessages && (
              <div className="text-center p-4 text-[var(--color-dim)] flex items-center justify-center gap-2">
                 <div className="w-4 h-4 rounded-full border-2 border-purple-500 border-t-transparent animate-spin"></div>
                 Se încarcă istoricul...
              </div>
            )}
            
            {activeSession && !isLoadingMessages && messages.length === 0 && (
               <div className="text-center p-4 text-[var(--color-dim)] italic">Nu există conversații pentru acest client în sistem.</div>
            )}

            {messages.map((m) => {
              const isClient = m.sender_type === "client";
              const time = new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              return (
                <div key={m.id} className={`max-w-[85%] p-3 rounded-2xl text-sm ${isClient ? "bg-black/40 rounded-tl-sm mr-auto" : "bg-purple-900/30 border border-purple-500/30 rounded-tr-sm ml-auto"}`}>
                  <div className={`text-[10px] mb-1 flex justify-between gap-4 ${isClient ? "text-gray-400" : "text-purple-400 font-bold"}`}>
                    <span>{isClient ? "Client" : "AI Copilot"}</span>
                    <span className="font-normal opacity-50">{time}</span>
                  </div>
                  <div className="leading-relaxed">{m.content}</div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Column 2: AI Notebook */}
        <section className="glass-panel rounded-2xl flex flex-col h-full overflow-hidden">
          <header className="px-4 py-3 border-b border-[var(--color-border)] bg-black/40 flex justify-between items-center shrink-0">
            <h2 className="font-semibold flex items-center gap-2">
              <span className="text-lg">📝</span> AI Notebook
            </h2>
          </header>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {!activeSession ? (
              <div className="flex-1 flex flex-col justify-center items-center text-[var(--color-dim)] h-full min-h-[200px]">
                <p>Aștept date structurate...</p>
              </div>
            ) : (
              <>
                {/* General Details */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-dim)]">Detalii Generale</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-black/30 border border-[var(--color-border)] rounded-lg p-3">
                       <div className="text-[10px] uppercase opacity-70 mb-1">Data</div>
                       <div className="font-medium text-sm">{extData["data_evenimentului"] || extData["data"] || "—"}</div>
                    </div>
                    <div className="bg-black/30 border border-[var(--color-border)] rounded-lg p-3">
                       <div className="text-[10px] uppercase opacity-70 mb-1">Locație</div>
                       <div className="font-medium text-sm truncate">{extData["locatia"] || extData["localitatea"] || extData["judetul"] || "—"}</div>
                    </div>
                    <div className="bg-black/30 border border-[var(--color-border)] rounded-lg p-3">
                       <div className="text-[10px] uppercase opacity-70 mb-1">Ocazie</div>
                       <div className="font-medium text-sm truncate">{occasion !== "Eveniment" ? occasion : "—"}</div>
                    </div>
                    <div className="bg-black/30 border border-[var(--color-border)] rounded-lg p-3">
                       <div className="text-[10px] uppercase opacity-70 mb-1">Nr. Copii / Vârstă</div>
                       <div className="font-medium text-sm truncate">
                         {extData["numar_copii"] || extData["numarul_de_copii"] || "?"} copii (~{extData["varsta_copiilor"] || "?"} ani)
                       </div>
                    </div>
                  </div>
                </div>

                <hr className="border-[var(--color-border)]" />

                {/* Services */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-dim)]">Servicii Cerute</h3>
                    <span className="text-xs font-medium bg-black px-2 py-0.5 rounded-full">{services.length}</span>
                  </div>
                  
                  <div className="space-y-3">
                    {services.length === 0 ? (
                      <div className="text-center py-6 text-xs text-gray-500 italic border border-dashed border-gray-700 rounded-lg">
                         Așteptăm ca AI-ul să extragă serviciile din conversație...
                      </div>
                    ) : (
                      services.map(([sKey, sVal]) => (
                        <div key={sKey} className="bg-black/20 border border-[var(--color-border)] rounded-lg p-3">
                          <div className="text-[10px] uppercase mb-1 text-purple-400 font-bold">{formatKeyTitle(sKey)}</div>
                          <div className="text-sm font-medium">{String(sVal)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Column 3: Visual Party */}
        <section className="glass-panel rounded-2xl flex flex-col h-full overflow-hidden relative">
          <header className="px-4 py-3 border-b border-[var(--color-border)] bg-black/40 flex justify-between items-center shrink-0 z-10">
            <h2 className="font-semibold flex items-center gap-2">
              <span className="text-lg">🎨</span> Visual Board
            </h2>
            <span className="text-[10px] text-[var(--color-dim)] uppercase tracking-wider bg-black/50 px-2 py-1 rounded">Live Build</span>
          </header>
          
          <div className="flex-1 overflow-y-auto p-5 z-10 flex flex-col gap-6">
            {!activeSession || Object.keys(extData).length === 0 ? (
               <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[var(--color-dim)] h-full min-h-[200px]">
                 <div className="text-4xl mb-4 opacity-30">✨</div>
                 <p className="text-sm border border-dashed rounded-lg p-4 border-gray-700">
                   Pe măsură ce AI-ul colectează date,<br/>petrecerea va prinde contur aici.
                 </p>
               </div>
            ) : (
              <>
                <div className="text-center animate-in fade-in slide-in-from-top-4 duration-500">
                   <h3 className="text-2xl font-bold mb-1 tracking-tight text-white">{occTitle}</h3>
                   <p className="text-sm text-[var(--color-dim)]">
                     {extData["data_evenimentului"] || "Dată nesetată"} • {extData["locatia"] || "Locație nesetată"}
                   </p>
                </div>

                {colorsFound.length > 0 && (
                  <div className="animate-in fade-in zoom-in duration-500 delay-150">
                    <h4 className="text-xs font-bold uppercase tracking-wider mb-3 text-center text-[var(--color-dim)]">Paleta de Culori Extrasă</h4>
                    <div className="flex justify-center gap-3">
                       {colorsFound.map(c => (
                         <div key={c.name} className="w-10 h-10 rounded-full border-2 border-white/20 shadow-lg shadow-black/50" style={{ backgroundColor: c.hex }} title={c.name}></div>
                       ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 mt-2">
                   {cardsHtml}
                </div>
              </>
            )}
          </div>
          
          {/* Action Footer */}
          <div className="p-4 border-t border-[var(--color-border)] bg-black/60 shrink-0 z-10 flex justify-between items-center">
            <div className="text-xs font-medium text-[var(--color-dim)]">
              Total estimat: <span className="text-emerald-400 text-lg ml-2 font-bold">{totalEst > 0 ? `~${totalEst} RON` : '--- RON'}</span>
            </div>
            <button className="px-4 py-2 rounded-lg font-medium text-xs border border-[var(--color-border)] hover:bg-white/10 transition-colors" disabled={!activeSession}>
              Generează Ofertă
            </button>
          </div>
        </section>
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        .visual-card {
           background: linear-gradient(145deg, rgba(30, 30, 46, 0.8), rgba(21, 21, 37, 0.8));
           border: 1px solid var(--color-border);
           border-radius: 12px;
           padding: 16px;
           display: flex;
           flex-direction: column;
           align-items: center;
           justify-content: center;
           text-align: center;
           transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .visual-card:hover {
           transform: translateY(-2px);
           box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        }
      `}} />
    </div>
  );
}
