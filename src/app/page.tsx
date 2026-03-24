"use client";

export const dynamic = 'force-dynamic';

import dynamicImport from "next/dynamic";
import { useState, useEffect, useRef, useCallback } from "react";
// RolesManager folosește localStorage + fetch async → doar client, fără SSR
const RolesManager = dynamicImport(() => import("../components/RolesManager"), { ssr: false });
const ClientsNotebook = dynamicImport(() => import("../components/ClientsNotebook"), { ssr: false });
import VertexConfig from "../components/VertexConfig";
import CollaboratorsManager from "../components/CollaboratorsManager";
import EmployeesBoard from "../components/EmployeesBoard";
import EventsBoard from "../components/EventsBoard";
import AiConfigManager from "../components/AiConfigManager";
import CostumesManager from "../components/CostumesManager";

type RoleDef = { id: string; title: string; detalii: string[] };
type ClientEvent = { id: string; role_title: string; event_details: Record<string, string>; total_amount: number; notes: string; created_at: string; status?: string };

// Types based on the existing Express schema
type Message = {
  id: string;
  sender_type: "client" | "ai" | "agent";
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
  const [leftPanelMode, setLeftPanelMode] = useState<"conversations" | "testai">("conversations");
  const [middlePanelMode, setMiddlePanelMode] = useState<"notebook" | "liveagent">("notebook");
  // Inițializăm MEREU cu "whatsapp" pentru a evita hydration mismatch (SSR vs client).
  // Valoarea din localStorage e restaurată în useEffect (client-only).
  const [currentView, setCurrentView] = useState<"whatsapp" | "roles" | "collaborators" | "employees" | "events" | "costumes" | "vertex" | "aiconfig" | "notebook">("whatsapp");

  // Restaurare tab din localStorage după mount (client-only) + salvare la fiecare navigare
  useEffect(() => {
    const saved = localStorage.getItem("superparty_admin_view");
    if (saved && ["whatsapp","roles","collaborators","employees","events","costumes","vertex","aiconfig","notebook"].includes(saved)) {
      setCurrentView(saved as any);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("superparty_admin_view", currentView);
  }, [currentView]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [showAddParty, setShowAddParty] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<RoleDef[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [partyFields, setPartyFields] = useState<Record<string, string>>({});
  const [partyTotal, setPartyTotal] = useState("");
  const [partyNotes, setPartyNotes] = useState("");
  const [savingParty, setSavingParty] = useState(false);
  const [clientEvents, setClientEvents] = useState<ClientEvent[]>([]);
  const [persoaneCnt, setPersoaneCnt] = useState(1); // number of people for multi-person roles

  // Shadow AI state (Live Agent mode)
  type ShadowMsg = { idx: number; sender_type: string; content: string; created_at: string; ai_response: string | null };
  const [shadowConversation, setShadowConversation] = useState<ShadowMsg[]>([]);
  const [shadowLoading, setShadowLoading] = useState(false);
  const [shadowError, setShadowError] = useState<string | null>(null);
  const [shadowLoadedForSession, setShadowLoadedForSession] = useState<string | null>(null);

  // Fields shared across all people (date, location) vs per-person fields
  const SHARED_FIELDS_KEYWORDS = ["data", "locati", "localitat", "judet", "adres", "ora ", "ora_"];
  const isSharedField = (f: string) => SHARED_FIELDS_KEYWORDS.some(kw => f.toLowerCase().includes(kw));
  // Roles that support multiple people
  const MULTI_PERSON_ROLES = ["ursitoare", "animator", "vrăjitoare", "vrajitoare"];
  const isMultiPersonRole = (title: string) => MULTI_PERSON_ROLES.some(k => title.toLowerCase().includes(k));

  // Inline edit state
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState<Record<string, string> | null>(null);
  const [editingTotal, setEditingTotal] = useState("");
  const [editingNotes, setEditingNotes] = useState("");

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Shadow AI: call /api/admin/live-agent/brain when Live Agent is active
  const loadShadowConversation = () => {
    if (!activeSession || messages.length === 0) return;
    
    setShadowLoading(true);
    setShadowError(null);
    setShadowLoadedForSession(activeSession);

    // Folosim endpoint-ul corect care extrage DB-ul real vs shadow logic
    fetch(`${API_BASE}/live-agent/brain?client_id=${activeSession}&_t=${Date.now()}`)
      .then(r => r.json())
      .then(data => {
        // Combinăm real_chat și shadow_chat
        const combinedRaw = data.real_chat || [];
        const shadowDecisions = data.shadow_chat || [];
        
        // Transformăm în format UI, grupând la finalul fiecărui "turn"
        const finalConversation: ShadowMsg[] = [];
        
        for (let i = 0; i < combinedRaw.length; i++) {
            const msg = combinedRaw[i];
            const isEndOfTurn = i === combinedRaw.length - 1 || combinedRaw[i + 1].sender_type === 'client';
            let aiResponse = null;

            if (isEndOfTurn) {
                let lastClientMsgTime = 0;
                for (let j = i; j >= 0; j--) {
                    if (combinedRaw[j].sender_type === 'client') {
                        lastClientMsgTime = new Date(combinedRaw[j].created_at).getTime();
                        break;
                    }
                }
                
                if (lastClientMsgTime > 0) {
                     // AI debounce time + vertex call time can be up to 15s. We look for a shadow response generated shortly after.
                     const aiResp = shadowDecisions.find((s: any) => 
                         s.sender_type === 'ai' && 
                         !s._used && 
                         new Date(s.created_at).getTime() >= lastClientMsgTime && 
                         new Date(s.created_at).getTime() < lastClientMsgTime + 120000);
                         
                     if (aiResp) {
                         aiResponse = aiResp.content;
                         aiResp._used = true;
                     }
                }
            }

            finalConversation.push({
                idx: i,
                sender_type: msg.sender_type,
                content: msg.content,
                created_at: msg.created_at,
                ai_response: aiResponse
            });
        }

        setShadowConversation(finalConversation);
        if (data.error) setShadowError(data.error);
      })
      .catch(e => setShadowError(String(e)))
      .finally(() => setShadowLoading(false));
  };

  useEffect(() => {
    if (middlePanelMode !== "liveagent" || !activeSession || messages.length === 0) return;
    if (shadowLoadedForSession === activeSession) return; // already loaded
    loadShadowConversation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [middlePanelMode, activeSession, messages.length]);

  // Reset shadow state when client changes
  useEffect(() => {
    setShadowConversation([]);
    setShadowError(null);
    setShadowLoadedForSession(null);
  }, [activeSession]);


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
    setPersoaneCnt(1);
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

  const confirmDraft = async (id: string) => {
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

  const activeEvents = clientEvents
    .filter(e => e.status === 'active' || !e.status || e.status === 'draft')
    .sort((a, b) => {
      // Helpers for extracting date from event_details
      const getDateStr = (ev: { event_details?: Record<string, any> }) => {
        if (!ev.event_details) return null;
        return ev.event_details["Data Evenimentului"] || ev.event_details["Data"] || ev.event_details["data"] || ev.event_details["data_evenimentului"] || null;
      };
      
      const dateA = getDateStr(a);
      const dateB = getDateStr(b);
      
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1; // Put events without date at the end
      if (!dateB) return -1;
      
      const timeA = new Date(dateA).getTime();
      const timeB = new Date(dateB).getTime();
      
      // If parsing fails for one of them, fallback to string comparison or put at end
      if (Number.isNaN(timeA) && Number.isNaN(timeB)) return dateA.localeCompare(dateB);
      if (Number.isNaN(timeA)) return 1;
      if (Number.isNaN(timeB)) return -1;

      return timeA - timeB; // Ascending order (earliest first)
    });
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
      <header className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-lg bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg">
            AI
          </div>
          <div>
            <h1 className="font-bold text-base tracking-wide">Manager AI</h1>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-dim)]">Superparty Copilot</div>
          </div>
        </div>

        {/* Horizontal Navigation */}
        <nav className="flex items-center gap-1">
          {([
            { key: "whatsapp", icon: "💬", label: "WhatsApp", color: "green" },
            { key: "notebook", icon: "📋", label: "Clienți", color: "blue" },
            { key: "roles", icon: "🤖", label: "Roluri AI", color: "purple" },
            { key: "collaborators", icon: "👥", label: "Colab.", color: "amber" },
            { key: "employees", icon: "👷", label: "Angajați", color: "indigo" },
            { key: "events", icon: "📅", label: "Evenimente", color: "purple" },
            { key: "costumes", icon: "🎭", label: "Costume", color: "pink" },
            { key: "aiconfig", icon: "⚙️", label: "Config AI", color: "cyan" },
            { key: "vertex", icon: "🔧", label: "Vertex", color: "slate" },
          ] as { key: string; icon: string; label: string; color: string }[]).map(({ key, icon, label }) => (
            <button
              key={key}
              onClick={() => setCurrentView(key as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                currentView === key
                  ? "bg-white/10 text-white border border-white/20"
                  : "text-[var(--color-dim)] hover:bg-white/5 border border-transparent"
              }`}
            >
              <span>{icon}</span>
              <span className="hidden lg:inline">{label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
            <span className="text-xs font-medium text-emerald-400">Hub Activ</span>
          </div>
          <div className="text-xs text-[var(--color-dim)] bg-black/50 px-3 py-1.5 rounded-md border border-[var(--color-border)] hidden xl:block">
            {activeNotebook?.phone_number || "Nicio sesiune"}
          </div>
        </div>
      </header>

      {/* Main Content Area — NO MORE SIDEBAR */}
      <div className="flex-1 flex overflow-hidden">

        {/* The 3-Column Grid (WhatsApp Module) */}
        {currentView === "whatsapp" && (
          <main className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 overflow-hidden h-full">
            {/* Column 1: Conversations or Test AI */}
            <section className="glass-panel rounded-2xl flex flex-col h-full overflow-hidden">
          <header className="px-4 py-3 border-b border-[var(--color-border)] bg-black/40 flex justify-between items-center shrink-0">
            <h2 className="font-semibold flex items-center gap-2">
              <span className="text-lg">{leftPanelMode === "conversations" ? "📇" : "🧪"}</span>
              {leftPanelMode === "conversations" ? "Conversații Active" : "Test AI"}
            </h2>
            <div className="flex items-center gap-2">
              {leftPanelMode === "conversations" && (
                <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">{notebooks.length}</span>
              )}
              <button
                onClick={() => setLeftPanelMode(leftPanelMode === "conversations" ? "testai" : "conversations")}
                className={`text-[10px] px-2 py-1 rounded-lg font-bold border transition-all ${
                  leftPanelMode === "testai"
                    ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
                    : "text-[var(--color-dim)] border-[var(--color-border)] hover:bg-white/5"
                }`}
              >
                {leftPanelMode === "conversations" ? "🧪 Test AI" : "📇 Conversații"}
              </button>
            </div>
          </header>
          {leftPanelMode === "testai" ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4 text-center">
              <div className="text-5xl mb-2">🧪</div>
              <h3 className="font-bold text-lg">Test AI Simulare</h3>
              <p className="text-sm text-[var(--color-dim)]">Simulează o conversație cu AI-ul ca şi cum ai fi un client.</p>
              <button
                onClick={() => setCurrentView("whatsapp")}
                className="mt-2 px-4 py-2 bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 rounded-xl text-sm font-bold hover:bg-yellow-500/30 transition-all"
              >
                Deschide Test AI Complet →
              </button>
              <p className="text-[10px] text-[var(--color-dim)] mt-4">💡 Apasă butonul de sus pentru testare completa sau selectează un contact din listă pentru a activa simularea.</p>
            </div>
          ) : (
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
          )}
        </section>

        {/* Column 2: AI Notebook or Live Agent */}
        <section className="glass-panel rounded-2xl flex flex-col h-full overflow-hidden">
          <header className="px-4 py-3 border-b border-[var(--color-border)] bg-black/40 flex justify-between items-center shrink-0">
            <h2 className="font-semibold flex items-center gap-2">
              <span className="text-lg">{middlePanelMode === "notebook" ? "🧠" : "👁️"}</span>
              {middlePanelMode === "notebook" ? "Notebook Client" : "Live Agent"}
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--color-dim)] uppercase tracking-wider bg-black/50 px-2 py-1 rounded">
                {middlePanelMode === "notebook" ? "Memorie AI" : "Monitorizare"}
              </span>
              <button
                onClick={() => setMiddlePanelMode(middlePanelMode === "notebook" ? "liveagent" : "notebook")}
                className={`text-[10px] px-2 py-1 rounded-lg font-bold border transition-all ${
                  middlePanelMode === "liveagent"
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse"
                    : "text-[var(--color-dim)] border-[var(--color-border)] hover:bg-white/5"
                }`}
              >
                {middlePanelMode === "notebook" ? "👁️ Live Agent" : "🧠 Notebook"}
              </button>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {middlePanelMode === "liveagent" ? (
              /* LIVE AGENT MODE: Shadow AI — conversație completă */
              <div className="flex flex-col gap-2 h-full">
                <div className="text-[10px] text-purple-400 uppercase tracking-wider font-bold flex items-center gap-2 shrink-0">
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
                  Shadow AI — Replay Conversație Completă
                  <button
                    onClick={() => { setShadowLoadedForSession(null); }}
                    className="ml-auto text-purple-400 hover:text-purple-300 text-[10px] underline"
                  >🔄 Reîncarcă</button>
                </div>

                {!activeSession ? (
                  <div className="flex flex-col items-center justify-center h-48 text-[var(--color-dim)] text-sm">
                    <div className="text-3xl mb-3">👁️</div>
                    <p>Selectează un client pentru a activa Shadow AI</p>
                  </div>
                ) : shadowLoading ? (
                  <div className="flex flex-col items-center justify-center h-48 text-purple-400 text-sm gap-3">
                    <div className="w-8 h-8 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin"></div>
                    <p className="text-xs">AI analizează întreaga conversație...</p>
                  </div>
                ) : shadowError ? (
                  <div className="flex flex-col items-center justify-center h-40 text-red-400 text-xs gap-2">
                    <div className="text-2xl">⚠️</div>
                    <p className="text-center">Eroare: {shadowError}</p>
                    <button onClick={() => { setShadowLoadedForSession(null); }} className="text-purple-400 underline text-[10px]">Încearcă din nou</button>
                  </div>
                ) : shadowConversation.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-[var(--color-dim)] text-sm gap-2">
                    <div className="text-3xl">🤖</div>
                    <p className="text-xs text-center">Nicio conversație disponibilă</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 overflow-y-auto flex-1">
                    {shadowConversation.map((msg, i) => {
                      const time = new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                      if (msg.sender_type === "client") {
                        return (
                          <div key={i}>
                            {/* Client message */}
                            <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                              <div className="flex items-center gap-1 mb-1">
                                <span className="text-[10px] text-blue-300 font-bold">👤 Client</span>
                                <span className="text-[9px] text-[var(--color-dim)] ml-auto">{time}</span>
                              </div>
                              <p className="text-xs text-white/80">{msg.content}</p>
                            </div>
                            {/* AI Shadow response for this turn */}
                            {msg.ai_response && (
                              <div className="bg-purple-950/40 border border-purple-500/25 rounded-xl px-3 py-2 mt-2 ml-6 relative">
                                <div className="absolute top-0 bottom-0 left-0 border-l-2 border-purple-500/50 -ml-[7px]"></div>
                                <div className="flex items-center gap-1 mb-1">
                                  <span className="text-[10px] text-purple-300 font-bold">🤖 Ai fi putut răspunde cu (Shadow AI)</span>
                                </div>
                                <p className="text-xs text-white/90 whitespace-pre-wrap">{msg.ai_response}</p>
                              </div>
                            )}
                          </div>
                        );
                      } else {
                        // Agent/employee message
                        return (
                          <div key={i}>
                            <div className="bg-emerald-950/20 border border-emerald-500/15 rounded-xl px-3 py-2 ml-6">
                              <div className="flex items-center gap-1 mb-1">
                                <span className="text-[10px] text-emerald-400 font-bold">👷 Angajat / Tu</span>
                                <span className="text-[9px] text-[var(--color-dim)] ml-auto">{time}</span>
                              </div>
                              <p className="text-xs text-white/80 whitespace-pre-wrap">{msg.content}</p>
                            </div>
                            {/* AI Shadow response for this turn */}
                            {msg.ai_response && (
                              <div className="bg-purple-950/40 border border-purple-500/25 rounded-xl px-3 py-2 mt-2 ml-6 relative shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                                <div className="flex items-center gap-1 mb-1">
                                  <span className="text-[10px] text-purple-300 font-bold">🤖 Shadow AI a judecat așa</span>
                                </div>
                                <p className="text-xs text-white/90 whitespace-pre-wrap">{msg.ai_response}</p>
                              </div>
                            )}
                          </div>
                        );
                      }
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* NOTEBOOK MODE: show client profile */
              !activeSession ? (
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
                   <div className="text-red-500 font-bold border border-red-500 rounded p-1 text-center text-xs uppercase mb-2">Debug Indicator Intern: Array-ul are {messages.length} mesaje</div>
                   {messages.length === 0 ? (
                     <div className="m-auto text-center text-[var(--color-dim)] italic">Niciun mesaj găsit în baza de date.</div>
                    ) : (
                     messages.map((m, i) => {
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
              )
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

                {/* Multi-person counter — shown for Ursitoare/Animatori etc. */}
                {selectedRole && isMultiPersonRole(selectedRole.title) && (
                  <div className="flex items-center gap-3 bg-purple-900/20 border border-purple-500/20 rounded-lg px-3 py-2">
                    <span className="text-xs text-purple-300 font-bold">👥 Nr. persoane:</span>
                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={() => setPersoaneCnt(p => Math.max(1, p - 1))}
                        className="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 font-bold text-sm hover:bg-purple-500/40 transition-all"
                      >-</button>
                      <span className="text-white font-bold text-sm w-4 text-center">{persoaneCnt}</span>
                      <button
                        type="button"
                        onClick={() => setPersoaneCnt(p => Math.min(10, p + 1))}
                        className="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 font-bold text-sm hover:bg-purple-500/40 transition-all"
                      >+</button>
                    </div>
                  </div>
                )}

                {/* Dynamic Fields — with multi-person support */}
                {selectedRole && selectedRole.detalii.length > 0 && (() => {
                  const multiPerson = isMultiPersonRole(selectedRole.title);
                  if (!multiPerson || persoaneCnt <= 1) {
                    // Single person - simple list
                    return (
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
                    );
                  }

                  // Multi-person: split shared vs per-person fields
                  const sharedFields = selectedRole.detalii.filter(f => isSharedField(f));
                  const perPersonFields = selectedRole.detalii.filter(f => !isSharedField(f));

                  return (
                    <div className="space-y-3">
                      {/* Shared fields */}
                      {sharedFields.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[10px] text-[var(--color-dim)] uppercase tracking-wider font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span> Detalii Comune
                          </div>
                          {sharedFields.map(field => (
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

                      {/* Per-person fields */}
                      {Array.from({ length: persoaneCnt }, (_, idx) => (
                        <div key={idx} className="bg-purple-900/20 border border-purple-500/20 rounded-lg p-3 space-y-2">
                          <div className="text-[11px] text-purple-400 font-bold flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-[10px]">{idx + 1}</span>
                            Persoana {idx + 1}
                          </div>
                          {perPersonFields.map(field => {
                            const key = persoaneCnt > 1 ? `P${idx + 1} - ${field}` : field;
                            return (
                              <div key={key}>
                                <label className="text-[10px] uppercase tracking-wider text-[var(--color-dim)] mb-0.5 block">{field}</label>
                                <input
                                  type="text"
                                  value={partyFields[key] || ""}
                                  onChange={e => setPartyFields(prev => ({ ...prev, [key]: e.target.value }))}
                                  className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                                  placeholder={field}
                                />
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })()}

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
                  
                  const dateStr = savedDetails["Data Evenimentului"] || savedDetails["Data"] || savedDetails["data"] || savedDetails["data_evenimentului"] || "Dată Necunoscută";

                  return (
                    <div key={ev.id} className={`rounded-xl border transition-all ${isEditing ? 'bg-purple-900/20 border-purple-500/40' : 'bg-black/30 border-[var(--color-border)] hover:border-purple-500/30'}`}>
                      <div className="px-4 py-3 flex justify-between items-center border-b border-white/5">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">🎉</span>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-base text-purple-400 uppercase tracking-wide">{ev.role_title.replace('Rol: ', '')}</span>
                              {ev.status === 'draft' ? (
                                <span className="bg-yellow-500/20 text-yellow-400 font-bold px-2.5 py-0.5 rounded-md text-sm border border-yellow-500/30 shadow-sm animate-pulse">
                                  📝 CIORNĂ (AI)
                                </span>
                              ) : (
                                <span className="bg-emerald-500/20 text-emerald-400 font-bold px-2.5 py-0.5 rounded-md text-sm border border-emerald-500/30 shadow-sm">
                                  📅 {dateStr}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-[var(--color-dim)]">Notat pe: {new Date(ev.created_at).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {ev.status === 'draft' && (
                            <button 
                              onClick={() => confirmDraft(ev.id)} 
                              className="text-[10px] bg-emerald-600 text-white px-2.5 py-1 rounded-md hover:bg-emerald-500 transition-all font-bold border border-emerald-500/30 flex items-center gap-1"
                            >
                              ✨ Trece pe curat
                            </button>
                          )}
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
                          const isMultiChar = key === 'Personajul Dorit' && String(val || '').match(/,|\+| și | si |\d+\s+\w/i);
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
                                  {(() => {
                                    // Split pe separatori: virgulă, +, "și", "si"
                                    const parts = String(val || '').split(/,|\+| și | si /i).filter(c => c.trim() !== '');
                                    // Expandem "3 Ursitoare Bune" → 3× "Ursitoare Bună"
                                    const tags: string[] = [];
                                    parts.forEach(part => {
                                      const p = part.trim();
                                      // Detectăm prefix numeric: "3 Ursitoare Bune", "1 Rea", "2 Vrăjitoare" etc.
                                      const numMatch = p.match(/^(\d+)\s+(.+)$/);
                                      if (numMatch) {
                                        const count = Math.min(Number.parseInt(numMatch[1], 10), 10);
                                        let label = numMatch[2].trim();
                                        // Normalizăm pluralul → singular
                                        label = label
                                          .replace(/bune$/i, 'Bună')
                                          .replace(/rele$/i, 'Rea')
                                          .replace(/buni$/i, 'Bun')
                                          .replace(/ursitoare buna/i, 'Ursitoare Bună')
                                          .replace(/ursitoare rea/i, 'Ursitoare Rea');
                                        // Dacă label nu conține deja "Ursitoare" și vine după un split, păstrăm ca e
                                        for (let n = 0; n < count; n++) tags.push(label);
                                      } else {
                                        tags.push(p);
                                      }
                                    });
                                    return tags.map((tag, i) => (
                                      <span key={i} className="text-white font-bold bg-purple-500/20 px-2 py-1 rounded-md text-[10px] w-max border border-purple-500/30 shadow-sm block">
                                        🎭 {tag}
                                      </span>
                                    ));
                                  })()}
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

        {/* Notebook Module */}
        {currentView === "notebook" && (
          <div className="w-full h-full overflow-y-auto">
            <ClientsNotebook />
          </div>
        )}

        {/* Vertex AI Config Module */}
        {currentView === "vertex" && <VertexConfig />}
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
