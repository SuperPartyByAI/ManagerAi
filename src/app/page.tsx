"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useCallback } from "react";
import RolesManager from "../components/RolesManager";
import VertexConfig from "../components/VertexConfig";
import CollaboratorsManager from "../components/CollaboratorsManager";
import EmployeesManager from "../components/EmployeesManager";
import EmployeesBoard from "../components/EmployeesBoard";
import EventsBoard from "../components/EventsBoard";
import AiConfigManager from "../components/AiConfigManager";
import CostumesManager from "../components/CostumesManager";
import LiveAgentTestBoard from "../components/LiveAgentTestBoard";

type RoleDef = { id: string; title: string; detalii: string[] };
type ClientEvent = { id: string; role_title: string; event_details: Record<string, string>; total_amount: number; notes: string; created_at: string; status?: string };

// Types based on the existing Express schema
type Message = {
  id: string;
  sender_type: "client" | "ai";
  content: string;
  created_at: string;
};

type Notebook = {
  client_id: string;
  phone_number: string;
  alias?: string | null;
  template_key: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extracted_data: Record<string, any>;
  updated_at: string;
  avatar_url?: string | null;
  brand_key?: string | null;
};

const API_BASE = "/api/admin";

// Helpers
function formatKeyTitle(key: string) {
  return key.replaceAll("_", " ");
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
  const [currentView, setCurrentView] = useState<"whatsapp" | "roles" | "collaborators" | "employees" | "events" | "costumes" | "vertex" | "testclient" | "live_agent_test" | "aiconfig">(() => {
    if (typeof window !== "undefined") {
      const savedView = localStorage.getItem("superparty_admin_view");
      if (savedView) return savedView as any;
    }
    return "whatsapp";
  });

  // Save tab state whenever the user navigates
  useEffect(() => {
    localStorage.setItem("superparty_admin_view", currentView);
  }, [currentView]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Add Party state
  const [showAddParty, setShowAddParty] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<RoleDef[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [partyFields, setPartyFields] = useState<Record<string, string>>({});
  const [partyTotal, setPartyTotal] = useState("");
  const [partyNotes, setPartyNotes] = useState("");
  const [savingParty, setSavingParty] = useState(false);
  const [clientEvents, setClientEvents] = useState<ClientEvent[]>([]);

  // Inline edit state
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState<Record<string, string> | null>(null);
  const [editingTotal, setEditingTotal] = useState("");
  const [editingNotes, setEditingNotes] = useState("");

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages[0]?.id]);

  // 1. Fetch active notebooks (sessions) every 5 seconds
  useEffect(() => {
    const fetchNotebooks = async () => {
      try {
        const res = await fetch(`${API_BASE}/client-notebooks?_t=${Date.now()}`, { cache: "no-store" });
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
    
    const fetchMessages = async (showLoading: boolean) => {
      if (showLoading && isMounted) setIsLoadingMessages(true);
      
      if (!activeSession) {
        if (isMounted) { setMessages([]); setIsLoadingMessages(false); }
        return;
      }
      try {
        const clientId = activeSession;

        if (clientId && isMounted) {
          const detailRes = await fetch(`${API_BASE}/crm/clients/${clientId}?_t=${Date.now()}`, { cache: "no-store" });
          const detailData = await detailRes.json();
          if (isMounted) {
            setMessages([...(detailData.latest_messages || [])]);
            setIsLoadingMessages(false);
          }
        } else if (!clientId && isMounted) {
           setIsLoadingMessages(false);
        }
      } catch (err) {
        console.error("Failed to fetch messages:", err);
        if (isMounted) setIsLoadingMessages(false);
      }
    };

    fetchMessages(true);
    const interval = setInterval(() => fetchMessages(false), 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeSession]);

  // Load roles — refresh when switching to whatsapp view
  const loadRoles = useCallback(() => {
    fetch("/api/vertex/sources?brand=GLOBAL")
      .then(r => r.json())
      .then(d => {
        const roles = (d.sources || [])
          .filter((s: { category: string }) => s.category === "rol")
          .map((s: { id: string; title: string; content: string }) => {
            const line = s.content?.split("\n").find((l: string) => l.toLowerCase().includes("obligatorii")) || "";
            const detalii = line.split(":").slice(1).join(":").split(",").map((x: string) => x.trim()).filter(Boolean);
            return { id: s.id, title: s.title, detalii };
          });
        setAvailableRoles(roles);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { loadRoles(); }, [loadRoles, currentView]);

  // Load client events when active session changes
  const loadClientEvents = useCallback(async () => {
    const nb = notebooks.find(n => n.client_id === activeSession);
    if (!nb?.phone_number) { setClientEvents([]); return; }
    try {
      const res = await fetch(`/api/vertex/events?phone=${encodeURIComponent(nb.phone_number)}&status=all`);
      const d = await res.json();
      setClientEvents(d.events || []);
    } catch { setClientEvents([]); }
  }, [activeSession, notebooks]);

  useEffect(() => { loadClientEvents(); }, [loadClientEvents]);

  const selectedRole = availableRoles.find(r => r.id === selectedRoleId);

  const handleRoleChange = (roleId: string) => {
    setSelectedRoleId(roleId);
    setPartyFields({});
    setPartyTotal("");
    setPartyNotes("");
  };

  const saveParty = async () => {
    const nb = notebooks.find(n => n.client_id === activeSession);
    if (!nb || !selectedRole) return;
    setSavingParty(true);
    try {
      await fetch("/api/vertex/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_phone: nb.phone_number,
          role_title: selectedRole.title,
          event_details: partyFields,
          total_amount: parseFloat(partyTotal) || 0,
          notes: partyNotes,
        }),
      });
      setShowAddParty(false);
      setSelectedRoleId("");
      setPartyFields({});
      setPartyTotal("");
      setPartyNotes("");
      loadClientEvents();
    } finally { setSavingParty(false); }
  };

  // Inline edit functions
  const startEditEvent = (ev: ClientEvent) => {
    setEditingEventId(ev.id);
    // Build edit details using role template as source of truth
    const roleDef = availableRoles.find(r => r.title === ev.role_title);
    const roleFields = roleDef?.detalii || [];
    const saved = ev.event_details || {};
    const merged: Record<string, string> = {};
    if (roleFields.length > 0) {
      for (const f of roleFields) merged[f] = saved[f] || '';
    } else {
      Object.assign(merged, saved);
    }
    setEditingDetails(merged);
    setEditingTotal(String(ev.total_amount || ""));
    setEditingNotes(ev.notes || "");
  };

  const cancelEditEvent = () => {
    setEditingEventId(null);
    setEditingDetails(null);
  };

  const saveEditEvent = async (id: string) => {
    await fetch("/api/vertex/events", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, event_details: editingDetails, total_amount: Number.parseFloat(editingTotal) || 0, notes: editingNotes }),
    });
    setEditingEventId(null);
    setEditingDetails(null);
    loadClientEvents();
  };

  const trashEvent = async (id: string) => {
    if (!confirm("Mută petrecerea în coșul de gunoi?")) return;
    await fetch("/api/vertex/events", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "trashed" }),
    });
    loadClientEvents();
  };

  const cancelEvent = async (id: string) => {
    if (!confirm("Marchează petrecerea ca ANULATĂ? (rămâne în istoric)")) return;
    await fetch("/api/vertex/events", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "cancelled" }),
    });
    loadClientEvents();
  };

  const restoreEvent = async (id: string) => {
    await fetch("/api/vertex/events", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "active" }),
    });
    loadClientEvents();
  };

  const permanentDeleteEvent = async (id: string) => {
    if (!confirm("ȘTERGERE PERMANENTĂ! Nu se mai poate recupera. Continui?")) return;
    await fetch(`/api/vertex/events?id=${id}`, { method: "DELETE" });
    loadClientEvents();
  };

  const activeEvents = clientEvents.filter(e => e.status === 'active' || !e.status);
  const cancelledEvents = clientEvents.filter(e => e.status === 'cancelled');
  const trashedEvents = clientEvents.filter(e => e.status === 'trashed');
  const eventsTotal = activeEvents.reduce((s, e) => s + (e.total_amount || 0), 0);

  const activeNotebook = notebooks.find((n) => n.client_id === activeSession);
  const extData = activeNotebook?.extracted_data || {};
  const occasion = extData["ocazia"] || extData["tipul_petrecerii"] || "Eveniment";
  const occTitle = String(occasion).toUpperCase();

  const ignoreKeys = new Set(["data_evenimentului", "data", "locatia", "localitatea", "judetul", "ocazia", "tipul_petrecerii", "numar_copii", "varsta_copiilor"]);
  const services = Object.entries(extData).filter(([k, v]) => !ignoreKeys.has(k) && v && String(v).trim() !== "" && String(v).toLowerCase() !== "null");

  const colorsFound = extractColorsFromStrings(Object.values(extData).join(" "));
  
  let totalEst = 0;
  const cardsHtml: React.ReactNode[] = [];
  
  const aniData = extData?.animatori;
  if (aniData && aniData.adaugat !== false) {
     totalEst += 350;
     const hasDate = !!(aniData.data_evenimentului || aniData.data);
     const hasTime = !!aniData.ora;
     const hasAddress = !!(aniData.locatia || aniData.localitatea || aniData.adresa);
     const hasCharacter = !!aniData.personaj;
     const hasChildName = !!(aniData.nume_copil || aniData.nume_sarbatorit);
     const hasAge = !!(aniData.varsta_copiilor || aniData.varsta_sarbatorit);
     const hasNumKids = !!(aniData.numar_copii || aniData.numarul_de_copii || aniData.numar_copii_aprox);
     const hasPayment = !!aniData.metoda_plata;

     cardsHtml.push(
       <div key="animator" className="role-card animate-in fade-in slide-in-from-right-4 duration-300">
         <div className="flex items-center gap-3 mb-3 border-b border-white/10 pb-2">
           <div className="w-8 h-8 rounded bg-blue-500/20 flex items-center justify-center text-lg">🦸‍♂️</div>
           <div className="flex-1 text-left">
             <h4 className="font-bold text-sm leading-tight text-blue-400">Serviciu: Animatori</h4>
             <div className="text-[10px] text-[var(--color-dim)]">+350 RON adăugat la ofertă</div>
           </div>
         </div>
         <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px] text-left mt-2">
           <div className={`flex items-center gap-1.5 ${hasDate ? 'text-emerald-400' : 'text-orange-400'}`}>
             {hasDate ? '✅' : '⏳'} Data {hasDate && <span className="text-white ml-auto font-bold truncate max-w-[60px]">{aniData.data_evenimentului || aniData.data}</span>}
           </div>
           <div className={`flex items-center gap-1.5 ${hasTime ? 'text-emerald-400' : 'text-orange-400'}`}>
             {hasTime ? '✅' : '⏳'} Ora {hasTime && <span className="text-white ml-auto font-bold">{aniData.ora}</span>}
           </div>
           <div className={`col-span-2 flex items-center gap-1.5 ${hasAddress ? 'text-emerald-400' : 'text-orange-400'}`}>
             {hasAddress ? '✅' : '⏳'} Adresa {hasAddress && <span className="text-white ml-auto font-bold truncate max-w-[140px]">{aniData.locatia || aniData.adresa}</span>}
           </div>
           <div className={`col-span-2 flex items-center gap-1.5 ${hasCharacter ? 'text-emerald-400' : 'text-orange-400'}`}>
             {hasCharacter ? '✅' : '⏳'} Personaj {hasCharacter && <span className="text-white ml-auto font-bold truncate max-w-[140px]">{aniData.personaj}</span>}
           </div>
           <div className={`flex items-center gap-1.5 ${hasChildName ? 'text-emerald-400' : 'text-orange-400'}`}>
             {hasChildName ? '✅' : '⏳'} Nume {hasChildName && <span className="text-white ml-auto font-bold truncate max-w-[60px]">{aniData.nume_copil || aniData.nume_sarbatorit}</span>}
           </div>
           <div className={`flex items-center gap-1.5 ${hasAge ? 'text-emerald-400' : 'text-orange-400'}`}>
             {hasAge ? '✅' : '⏳'} Vârstă {hasAge && <span className="text-white ml-auto font-bold">{aniData.varsta_copiilor || aniData.varsta_sarbatorit}</span>}
           </div>
           <div className={`flex items-center gap-1.5 ${hasNumKids ? 'text-emerald-400' : 'text-orange-400'}`}>
             {hasNumKids ? '✅' : '⏳'} Nr. Copii {hasNumKids && <span className="text-white ml-auto font-bold">{aniData.numar_copii || aniData.numar_copii_aprox}</span>}
           </div>
           <div className={`flex items-center gap-1.5 ${hasPayment ? 'text-emerald-400' : 'text-orange-400'}`}>
             {hasPayment ? '✅' : '⏳'} Cum se încasează {hasPayment && <span className="text-white ml-auto font-bold">{aniData.metoda_plata}</span>}
           </div>
         </div>
       </div>
     );
  }

  const balData = extData?.baloane || extData?.decor_baloane;
  if (balData && balData.adaugat !== false) {
     totalEst += 450;
     const hasColors = colorsFound.length > 0;
     const hasType = !!balData.tip_baloane;
     cardsHtml.push(
       <div key="baloane" className="role-card animate-in fade-in slide-in-from-right-4 duration-300 delay-100">
         <div className="flex items-center gap-3 mb-3 border-b border-white/10 pb-2">
           <div className="w-8 h-8 rounded bg-pink-500/20 flex items-center justify-center text-lg">🎈</div>
           <div className="flex-1 text-left">
             <h4 className="font-bold text-sm leading-tight text-pink-400">Serviciu: Decor Baloane</h4>
             <div className="text-[10px] text-[var(--color-dim)]">+450 RON adăugat la ofertă</div>
           </div>
         </div>
         <div className="space-y-1.5 text-xs text-left">
           <div className={`flex items-center gap-2 ${hasColors ? 'text-emerald-400' : 'text-orange-400'}`}>
             {hasColors ? '✅' : '⏳'} Culori preferate {hasColors && <span className="text-white ml-auto font-bold truncate max-w-[80px]">{colorsFound.map(c => c.name).join(', ')}</span>}
           </div>
           <div className={`flex items-center gap-2 ${hasType ? 'text-emerald-400' : 'text-orange-400'}`}>
             {hasType ? '✅' : '⏳'} Tip decor specific
           </div>
         </div>
       </div>
     );
  }

  const ursData = extData?.ursitoare;
  if (ursData && ursData.adaugat !== false) {
     totalEst += 400;
     const hasName = !!(ursData.nume_copil || ursData.nume_sarbatorit);
     cardsHtml.push(
       <div key="ursitoare" className="role-card animate-in fade-in slide-in-from-right-4 duration-300 delay-200">
         <div className="flex items-center gap-3 mb-3 border-b border-white/10 pb-2">
           <div className="w-8 h-8 rounded bg-purple-500/20 flex items-center justify-center text-lg">🧚‍♀️</div>
           <div className="flex-1 text-left">
             <h4 className="font-bold text-sm leading-tight text-purple-400">Serviciu: Ursitoare</h4>
             <div className="text-[10px] text-[var(--color-dim)]">+400 RON adăugat la ofertă</div>
           </div>
         </div>
         <div className="space-y-1.5 text-xs text-left">
           <div className={`flex items-center gap-2 ${hasName ? 'text-emerald-400' : 'text-orange-400'}`}>
             {hasName ? '✅' : '⏳'} Nume bebeluș {hasName && <span className="text-white ml-auto font-bold">{ursData.nume_copil || ursData.nume_sarbatorit}</span>}
           </div>
           <div className={`flex items-center gap-2 text-orange-400`}>
             ⏳ Biserică (opțional)
           </div>
         </div>
       </div>
     );
  }

  if (cardsHtml.length === 0 && services.length > 0) {
    cardsHtml.push(
      <div key="custom" className="role-card col-span-1 animate-in fade-in zoom-in duration-300">
        <div className="flex items-center gap-3 mb-3 border-b border-white/10 pb-2">
           <div className="w-8 h-8 rounded bg-gray-500/20 flex items-center justify-center text-lg">✨</div>
           <div className="flex-1 text-left">
             <h4 className="font-bold text-sm leading-tight text-gray-300">Asistent General</h4>
             <div className="text-[10px] text-[var(--color-dim)]">Colectare standard</div>
           </div>
         </div>
         <div className="space-y-1.5 text-xs text-left text-orange-400">
           ⏳ Aștept menționarea serviciilor...
         </div>
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
            Sesiune curentă: {activeNotebook?.phone_number || "Niciuna"}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar Navigation */}
        <aside className="w-20 shrink-0 border-r border-[var(--color-border)] bg-black/30 flex flex-col items-center py-6 gap-6 z-20 overflow-y-auto custom-scrollbar">
          <button
            onClick={() => setCurrentView("whatsapp")}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all ${
              currentView === "whatsapp"
                ? "bg-green-500/20 text-green-400 border border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.2)]"
                : "text-[var(--color-dim)] hover:bg-white/5 border border-transparent"
            }`}
          >
            <div className="text-2xl drop-shadow-md">💬</div>
            <div className="text-[9px] font-bold uppercase tracking-wider">WhatsApp</div>
          </button>
          
          <button
            onClick={() => setCurrentView("roles")}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all ${
              currentView === "roles"
                ? "bg-purple-500/20 text-purple-400 border border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.2)]"
                : "text-[var(--color-dim)] hover:bg-white/5 border border-transparent"
            }`}
          >
            <div className="text-2xl drop-shadow-md">🤖</div>
            <div className="text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">Roluri <span className="bg-purple-600 text-white px-1 py-0.5 rounded text-[7px] leading-none">AI</span></div>
          </button>

          <button
            onClick={() => setCurrentView("collaborators")}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all ${
              currentView === "collaborators"
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                : "text-[var(--color-dim)] hover:bg-white/5 border border-transparent"
            }`}
          >
            <div className="text-2xl drop-shadow-md">👥</div>
            <div className="text-[9px] font-bold uppercase tracking-wider">Colab.</div>
          </button>

          <button
            onClick={() => setCurrentView("employees")}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all ${
              currentView === "employees"
                ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]"
                : "text-[var(--color-dim)] hover:bg-white/5 border border-transparent"
            }`}
          >
            <div className="text-2xl drop-shadow-md">👷</div>
            <div className="text-[9px] font-bold uppercase tracking-wider">Angajați</div>
          </button>

          <button
            onClick={() => setCurrentView("events")}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all ${
              currentView === "events"
                ? "bg-purple-500/20 text-purple-400 border border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.2)]"
                : "text-[var(--color-dim)] hover:bg-white/5 border border-transparent"
            }`}
          >
            <div className="text-2xl drop-shadow-md">📅</div>
            <div className="text-[9px] font-bold uppercase tracking-wider">Evenimente</div>
          </button>

          <button
            onClick={() => setCurrentView("costumes")}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all ${
              currentView === "costumes"
                ? "bg-pink-500/20 text-pink-400 border border-pink-500/50 shadow-[0_0_15px_rgba(236,72,153,0.2)]"
                : "text-[var(--color-dim)] hover:bg-white/5 border border-transparent"
            }`}
          >
            <div className="text-2xl drop-shadow-md">🎭</div>
            <div className="text-[9px] font-bold uppercase tracking-wider">Costume</div>
          </button>

          <button
            onClick={() => setCurrentView("testclient")}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all ${
              currentView === "testclient"
                ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.2)]"
                : "text-[var(--color-dim)] hover:bg-white/5 border border-transparent"
            }`}
          >
            <div className="text-2xl drop-shadow-md">🧪</div>
            <div className="text-[9px] font-bold uppercase tracking-wider">Test AI</div>
          </button>

          <button
            onClick={() => setCurrentView("aiconfig")}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all ${
              currentView === "aiconfig"
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                : "text-[var(--color-dim)] hover:bg-white/5 border border-transparent"
            }`}
          >
            <div className="text-2xl drop-shadow-md">⚙️</div>
            <div className="text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">Config <span className="bg-cyan-600 text-white px-1 py-0.5 rounded text-[7px] leading-none">AI</span></div>
          </button>

          <button
            onClick={() => setCurrentView("live_agent_test")}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all ${
              currentView === "live_agent_test"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                : "text-[var(--color-dim)] hover:bg-white/5 border border-transparent"
            }`}
          >
            <div className="text-2xl drop-shadow-md">👁️</div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-center">Live<br/>Agent</div>
          </button>

          <div className="w-8 border-t border-[var(--color-border)]"></div>

          <button
            onClick={() => setCurrentView("vertex")}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all ${
              currentView === "vertex"
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                : "text-[var(--color-dim)] hover:bg-white/5 border border-transparent"
            }`}
          >
            <div className="text-2xl drop-shadow-md">⚙️</div>
            <div className="text-[9px] font-bold uppercase tracking-wider">Vertex</div>
          </button>
        </aside>

        {/* The 3-Column Grid (WhatsApp Module) */}
        {currentView === "whatsapp" && (
          <main className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 overflow-hidden h-full">
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
              notebooks.map((n, idx) => {
                let badgeColor = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
                if (n.brand_key?.includes("KASSY")) badgeColor = "bg-pink-500/20 text-pink-400 border-pink-500/30";
                else if (n.brand_key?.includes("WONDER")) badgeColor = "bg-blue-500/20 text-blue-400 border-blue-500/30";
                else if (n.brand_key?.includes("UNIVERS")) badgeColor = "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";

                return (
                  <button
                    key={`${n.client_id}-${idx}`}
                    onClick={() => setActiveSession(n.client_id)}
                    className={`w-full text-left p-3 rounded-xl transition-all border flex gap-3 items-center ${
                      activeSession === n.client_id 
                        ? "bg-purple-600/20 border-purple-500/50" 
                        : "bg-black/20 border-transparent hover:bg-white/5 hover:border-[var(--color-border)]"
                    }`}
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 shrink-0 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden flex items-center justify-center relative">
                       {n.avatar_url ? (
                         /* eslint-disable-next-line @next/next/no-img-element */
                         <img src={n.avatar_url} alt="avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
                       ) : (
                         <span className="text-xl opacity-50">👤</span>
                       )}
                    </div>
                    
                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm mb-1 truncate">{n.alias || n.phone_number}</div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {n.alias && (
                          <span className="text-[10px] text-[var(--color-dim)] mr-1 truncate max-w-[80px]">{n.phone_number}</span>
                        )}
                        {n.brand_key && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${badgeColor}`}>
                            {n.brand_key.replace("SESSION_", "").replace("BRAND_", "")}
                          </span>
                        )}
                        <div className="text-[10px] text-[var(--color-dim)] flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                          Live
                        </div>
                        {(n as any).last_message_at && (
                          <div className="text-[10px] text-emerald-400 font-mono ml-auto">
                            {new Date((n as any).last_message_at).toLocaleDateString('ro-RO', {day:'2-digit',month:'2-digit'})}{' '}
                            {new Date((n as any).last_message_at).toLocaleTimeString('ro-RO', {hour:'2-digit',minute:'2-digit'})}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </section>

        {/* Column 2: AI Notebook (Client Profile) */}
        <section className="glass-panel rounded-2xl flex flex-col h-full overflow-hidden">
          <header className="px-4 py-3 border-b border-[var(--color-border)] bg-black/40 flex justify-between items-center shrink-0">
            <h2 className="font-semibold flex items-center gap-2">
              <span className="text-lg">🧠</span> Notebook Client
            </h2>
            <span className="text-[10px] text-[var(--color-dim)] uppercase tracking-wider bg-black/50 px-2 py-1 rounded">Memorie AI</span>
          </header>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {!activeSession ? (
              <div className="flex-1 flex flex-col justify-center items-center text-[var(--color-dim)] h-full min-h-[200px]">
                <p>Selectează clientul pentru profil...</p>
              </div>
            ) : (
              <>
                {/* General Details */}
                <div className="flex items-center gap-4 mb-2">
                   <div className="w-16 h-16 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden flex items-center justify-center relative shrink-0">
                      {activeNotebook?.avatar_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={activeNotebook.avatar_url} alt="avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
                      ) : (
                        <span className="text-3xl opacity-50">👤</span>
                      )}
                   </div>
                   <div className="min-w-0">
                     <h3 className="font-bold text-lg truncate">{activeNotebook?.alias || "Client Nou"}</h3>
                     <div className="text-sm text-[var(--color-dim)] truncate">{activeNotebook?.phone_number || activeSession}</div>
                     {activeNotebook?.alias && (
                       <div className="mt-1 inline-block px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-[10px] font-bold uppercase rounded border border-yellow-500/30">
                         Client Recurent
                       </div>
                     )}
                   </div>
                </div>

                {/* AI Extracted Memory Preview */}
                {Object.keys(extData).length > 0 && (
                  <div className="bg-black/40 border border-[var(--color-border)] rounded-lg p-3 mb-2 shrink-0">
                    <h4 className="text-[10px] text-[var(--color-dim)] uppercase tracking-wider mb-2 flex items-center gap-2">
                       <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span> Date Extrase Curent
                    </h4>
                    <pre className="text-[10px] text-purple-200/80 font-mono overflow-x-auto whitespace-pre-wrap max-h-[100px] overflow-y-auto custom-scrollbar">
                      {JSON.stringify(extData, null, 2)}
                    </pre>
                  </div>
                )}

                <div className="flex-1 bg-black/40 border border-[var(--color-border)] rounded-lg p-4 overflow-y-auto mb-2 relative flex flex-col gap-3">
                   {messages.length === 0 ? (
                     <div className="m-auto text-center text-[var(--color-dim)] italic">Niciun mesaj găsit în baza de date.</div>
                   ) : (
                     messages.slice().reverse().map((m, i) => {
                       const isClient = m.sender_type === "client";
                       return (
                         <div key={i} className={`flex w-full ${isClient ? "justify-start" : "justify-end"}`}>
                           <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                             isClient 
                               ? "bg-white/10 text-white rounded-tl-none" 
                               : "bg-purple-600 text-white rounded-tr-none"
                             }`}>
                             <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.content}</p>
                             <div className={`text-[10px] mt-1 ${isClient ? "text-gray-400" : "text-purple-200"} text-right`}>
                               {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                             </div>
                           </div>
                         </div>
                       );
                     })
                   )}
                   <div ref={messagesEndRef} />
                </div>
              </>
            )}
          </div>
        </section>

        {/* Column 3: Visual Party + Add Event */}
        <section className="glass-panel rounded-2xl flex flex-col h-full overflow-hidden relative">
          <header className="px-4 py-3 border-b border-[var(--color-border)] bg-black/40 flex justify-between items-center shrink-0 z-10">
            <h2 className="font-semibold flex items-center gap-2">
              <span className="text-lg">🛒</span> Ofertă & Rezervări
            </h2>
            {activeSession && (
              <button
                onClick={() => setShowAddParty(!showAddParty)}
                className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${showAddParty ? 'bg-red-600 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
              >
                {showAddParty ? '✕ Anulează' : '➕ Petrecere'}
              </button>
            )}
          </header>

          <div className="flex-1 overflow-y-auto p-4 z-10 flex flex-col gap-4">
            {/* ADD PARTY FORM */}
            {showAddParty && activeSession && (
              <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4 space-y-3">
                <h3 className="font-bold text-sm text-emerald-400 flex items-center gap-2">🎉 Adaugă Petrecere Manuală</h3>
                <div className="text-[10px] text-[var(--color-dim)]">📱 Client: {activeNotebook?.phone_number || activeSession}</div>

                {/* Role Selector */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] mb-1 block">Selectează Rolul</label>
                  <select
                    value={selectedRoleId}
                    onChange={e => handleRoleChange(e.target.value)}
                    className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Alege serviciul --</option>
                    {availableRoles.map(r => (
                      <option key={r.id} value={r.id}>{r.title.replace('Rol: ', '')}</option>
                    ))}
                  </select>
                </div>

                {/* Dynamic Fields */}
                {selectedRole && selectedRole.detalii.length > 0 && (
                  <div className="space-y-2">
                    {selectedRole.detalii.map(field => (
                      <div key={field}>
                        <label className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] mb-0.5 block">{field}</label>
                        <input
                          type="text"
                          value={partyFields[field] || ""}
                          onChange={e => setPartyFields(prev => ({ ...prev, [field]: e.target.value }))}
                          className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                          placeholder={field}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Total */}
                {selectedRole && (
                  <>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] mb-0.5 block">💰 Total (RON)</label>
                      <input
                        type="number"
                        value={partyTotal}
                        onChange={e => setPartyTotal(e.target.value)}
                        className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                        placeholder="1500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] mb-0.5 block">📝 Note (opțional)</label>
                      <input
                        type="text"
                        value={partyNotes}
                        onChange={e => setPartyNotes(e.target.value)}
                        className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                        placeholder="Observații..."
                      />
                    </div>
                    <button
                      onClick={saveParty}
                      disabled={savingParty}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-sm transition-all disabled:opacity-50"
                    >
                      {savingParty ? 'Se salvează...' : '💾 Salvează Petrecerea'}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* SAVED EVENTS — Source of Truth */}
            {/* ACTIVE EVENTS */}
            {activeEvents.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Petreceri Rezervate ({activeEvents.length})
                </h4>
                {activeEvents.map(ev => {
                  const isEditing = editingEventId === ev.id;
                  const roleDef = availableRoles.find(r => r.title === ev.role_title);
                  const roleFields = roleDef?.detalii || [];
                  const savedDetails = ev.event_details || {};
                  const fieldEntries = roleFields.length > 0
                    ? roleFields.map(f => [f, isEditing ? (editingDetails?.[f] || '') : (savedDetails[f] || '')] as [string, string])
                    : Object.entries(isEditing ? (editingDetails || {}) : savedDetails);
                  return (
                    <div key={ev.id} className={`rounded-xl border transition-all ${isEditing ? 'bg-purple-900/20 border-purple-500/40' : 'bg-black/30 border-[var(--color-border)] hover:border-purple-500/30'}`}>
                      <div className="px-4 py-3 flex justify-between items-center border-b border-white/5">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🎉</span>
                          <div>
                            <div className="font-bold text-sm text-purple-400">{ev.role_title.replace('Rol: ', '')}</div>
                            <div className="text-[9px] text-[var(--color-dim)]">{new Date(ev.created_at).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {!isEditing ? (
                            <>
                              <button onClick={() => startEditEvent(ev)} className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-1 rounded-md hover:bg-purple-500/20 transition-all border border-purple-500/20" title="Editează">✏️</button>
                              <button onClick={() => cancelEvent(ev.id)} className="text-[10px] bg-orange-500/10 text-orange-400 px-2 py-1 rounded-md hover:bg-orange-500/20 transition-all border border-orange-500/20" title="Anulează petrecerea">❌</button>
                              <button onClick={() => trashEvent(ev.id)} className="text-[10px] bg-red-500/10 text-red-400 px-2 py-1 rounded-md hover:bg-red-500/20 transition-all border border-red-500/20" title="Coș de gunoi">🗑</button>
                            </>
                          ) : (
                            <>
                              <button onClick={cancelEditEvent} className="text-[10px] bg-gray-500/10 text-gray-400 px-2 py-1 rounded-md hover:bg-gray-500/20 transition-all border border-gray-500/20">✕</button>
                              <button onClick={() => saveEditEvent(ev.id)} className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-md hover:bg-emerald-500/20 transition-all border border-emerald-500/20 font-bold">💾</button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="px-4 py-3 space-y-1.5">
                        {fieldEntries.map(([key, val]) => {
                          const isMultiChar = key === 'Personajul Dorit' && String(val || '').match(/,|\+| și | si /i);
                          return (
                          <div key={key} className={`flex ${isMultiChar ? 'items-start py-1' : 'items-center'} gap-2 text-xs`}>
                            <span className={val ? 'text-emerald-400' : 'text-orange-400'}>{val ? '✅' : '⏳'}</span>
                            <span className={`text-[var(--color-dim)] w-28 shrink-0 ${isMultiChar ? 'mt-1' : 'truncate'}`}>{key}</span>
                            {isEditing ? (
                              <input type="text" value={String(val || '')}
                                onChange={e => setEditingDetails(prev => prev ? { ...prev, [key]: e.target.value } : prev)}
                                className="flex-1 bg-black/40 border border-[var(--color-border)] rounded px-2 py-1 text-xs focus:outline-none focus:border-purple-500" />
                            ) : (
                              isMultiChar ? (
                                <div className="flex-1 grid grid-cols-1 gap-1.5 align-top">
                                  {String(val || '').split(/,|\+| și | si /i).filter(c => c.trim() !== '').map((char, i) => (
                                    <span key={i} className="text-white font-bold bg-purple-500/20 px-2 py-1 rounded-md text-[10px] w-max border border-purple-500/30 shadow-sm block">
                                      🎭 {char.trim()}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-white font-medium truncate">{String(val || '—')}</span>
                              )
                            )}
                          </div>
                        )})}
                        <div className="flex items-center gap-2 text-xs pt-2 border-t border-white/5 mt-2">
                          <span className="text-lg">💰</span>
                          <span className="text-[var(--color-dim)] w-28 shrink-0">Total</span>
                          {isEditing ? (
                            <input type="number" value={editingTotal}
                              onChange={e => setEditingTotal(e.target.value)}
                              className="flex-1 bg-black/40 border border-[var(--color-border)] rounded px-2 py-1 text-xs focus:outline-none focus:border-purple-500" />
                          ) : (
                            <span className="text-emerald-400 font-bold">{ev.total_amount > 0 ? `${ev.total_amount} RON` : '—'}</span>
                          )}
                        </div>
                        {(ev.notes || isEditing) && (
                          <div className="flex items-start gap-2 text-xs">
                            <span className="text-lg">📝</span>
                            <span className="text-[var(--color-dim)] w-28 shrink-0">Note</span>
                            {isEditing ? (
                              <input type="text" value={editingNotes}
                                onChange={e => setEditingNotes(e.target.value)}
                                className="flex-1 bg-black/40 border border-[var(--color-border)] rounded px-2 py-1 text-xs focus:outline-none focus:border-purple-500" />
                            ) : (
                              <span className="text-[var(--color-dim)] italic">{ev.notes}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* CANCELLED EVENTS */}
            {cancelledEvents.length > 0 && (
              <div className="space-y-2 mt-4">
                <h4 className="text-[10px] uppercase tracking-wider text-orange-400 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                  Anulate ({cancelledEvents.length})
                </h4>
                {cancelledEvents.map(ev => (
                  <div key={ev.id} className="rounded-xl border border-orange-500/20 bg-orange-900/10 opacity-70">
                    <div className="px-4 py-2.5 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">❌</span>
                        <div>
                          <div className="font-bold text-xs text-orange-400 line-through">{ev.role_title.replace('Rol: ', '')}</div>
                          <div className="text-[9px] text-[var(--color-dim)]">{new Date(ev.created_at).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                        </div>
                        <span className="text-[8px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded-full border border-orange-500/30 uppercase font-bold">ANULAT</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => restoreEvent(ev.id)} className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-md hover:bg-emerald-500/20 transition-all border border-emerald-500/20" title="Restaurează">♻️</button>
                        <button onClick={() => trashEvent(ev.id)} className="text-[10px] bg-red-500/10 text-red-400 px-2 py-1 rounded-md hover:bg-red-500/20 transition-all border border-red-500/20" title="Coș de gunoi">🗑</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TRASH BIN */}
            {trashedEvents.length > 0 && (
              <div className="space-y-2 mt-4">
                <h4 className="text-[10px] uppercase tracking-wider text-red-400 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                  🗑 Coș de Gunoi ({trashedEvents.length})
                </h4>
                {trashedEvents.map(ev => (
                  <div key={ev.id} className="rounded-xl border border-red-500/20 bg-red-900/10 opacity-50">
                    <div className="px-4 py-2.5 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">🗑</span>
                        <div>
                          <div className="font-bold text-xs text-red-400 line-through">{ev.role_title.replace('Rol: ', '')}</div>
                          <div className="text-[9px] text-[var(--color-dim)]">{new Date(ev.created_at).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => restoreEvent(ev.id)} className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-md hover:bg-emerald-500/20 transition-all border border-emerald-500/20" title="Restaurează">♻️</button>
                        <button onClick={() => permanentDeleteEvent(ev.id)} className="text-[10px] bg-red-500/10 text-red-400 px-2 py-1 rounded-md hover:bg-red-500/20 transition-all border border-red-500/20 font-bold" title="Șterge permanent">🔥</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!showAddParty && (!activeSession || clientEvents.length === 0) && (
               <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[var(--color-dim)] h-full min-h-[200px]">
                 <div className="text-4xl mb-4 opacity-30">✨</div>
                 <p className="text-sm border border-dashed rounded-lg p-4 border-gray-700">
                   Nicio petrecere rezervată.<br/>Apasă <strong>➕ Petrecere</strong> pentru a adăuga.
                 </p>
               </div>
            )}
          </div>

            {/* Action Footer — Total from all events */}
            <div className="p-4 border-t border-[var(--color-border)] bg-black/60 shrink-0 z-10 flex justify-between items-center">
              <div className="text-xs font-medium text-[var(--color-dim)]">
                Total: <span className="text-emerald-400 text-lg ml-2 font-bold">{eventsTotal > 0 ? `${eventsTotal} RON` : '--- RON'}</span>
              </div>
              <button className="px-4 py-2 rounded-lg font-medium text-xs border border-[var(--color-border)] hover:bg-white/10 transition-colors" disabled={!activeSession}>
                Generează Ofertă
              </button>
            </div>
          </section>
        </main>
        )}
        
        {/* Roles Module */}
        {currentView === "roles" && <RolesManager />}

        {/* Collaborators Module */}
        {currentView === "collaborators" && <CollaboratorsManager />}

        {/* Employees KYC Board */}
        {currentView === "employees" && <EmployeesBoard />}

        {/* Events Board Module */}
        {currentView === "events" && <EventsBoard />}

        {/* Costumes Manager Module */}
        {currentView === "costumes" && <CostumesManager />}

        {/* AI Config Module */}
        {currentView === "aiconfig" && (
          <div className="col-span-3 h-full overflow-hidden glass-panel rounded-2xl">
            <AiConfigManager />
          </div>
        )}

        {/* Vertex AI Config Module */}
        {currentView === "vertex" && <VertexConfig />}

        {/* Test Client Simulator */}
        {currentView === "testclient" && (
          <main className="flex-1 overflow-hidden h-full p-0">
            <iframe
              src="/test-client.html"
              className="w-full h-full border-0"
              title="Test Client Simulator"
            />
          </main>
        )}

        {/* Live Agent Test Board */}
        {currentView === "live_agent_test" && <LiveAgentTestBoard />}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .role-card {
           background: linear-gradient(145deg, rgba(30,30,46,0.5), rgba(21,21,37,0.5));
           border: 1px solid var(--color-border);
           border-radius: 12px;
           padding: 16px;
           transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .role-card:hover {
           box-shadow: 0 4px 20px rgba(0,0,0,0.3);
           border-color: rgba(255,255,255,0.1);
        }
      `}} />
    </div>
  );
}
