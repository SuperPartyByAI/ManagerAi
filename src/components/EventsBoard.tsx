"use client";

import { useState, useEffect, useCallback } from "react";

type EventRow = {
  id: string;
  client_phone: string;
  role_title: string;
  event_details: Record<string, string>;
  total_amount: number;
  notes: string;
  status: string;
  assigned_animator: string | null;
  assigned_prep: string | null;
  event_status: string;
  created_at: string;
};

type Employee = {
  id: string;
  name: string;
  is_active: boolean;
};

const STATUS_MAP: Record<string, { label: string; color: string; icon: string }> = {
  new: { label: "NOU", color: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30", icon: "📋" },
  assigned: { label: "ALOCAT", color: "text-blue-400 bg-blue-500/15 border-blue-500/30", icon: "👷" },
  prepared: { label: "PREGĂTIT", color: "text-purple-400 bg-purple-500/15 border-purple-500/30", icon: "🎒" },
  completed: { label: "FINALIZAT", color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30", icon: "✅" },
};

export default function EventsBoard() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [evRes, empRes] = await Promise.all([
        fetch("/api/vertex/events?status=active"),
        fetch("/api/vertex/employees"),
      ]);
      const evData = await evRes.json();
      const empData = await empRes.json();
      setEvents(evData.events || []);
      setEmployees((empData.employees || []).filter((e: Employee) => e.is_active));
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const assignEmployee = async (eventId: string, field: "assigned_animator" | "assigned_prep", value: string) => {
    const body: Record<string, string> = { id: eventId, [field]: value || "" };

    // Auto-set event_status to 'assigned' when first assignment is made
    const ev = events.find(e => e.id === eventId);
    if (ev && ev.event_status === "new" && value) {
      body.event_status = "assigned";
    }

    await fetch("/api/vertex/events", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    fetchAll();
  };

  const setEventStatus = async (eventId: string, newStatus: string) => {
    await fetch("/api/vertex/events", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: eventId, event_status: newStatus }),
    });
    fetchAll();
  };

  const unassigned = events.filter(e => !e.assigned_animator && !e.assigned_prep);
  const assigned = events.filter(e => e.assigned_animator || e.assigned_prep);

  const formatDate = (details: Record<string, string>) => {
    return details?.["Data Evenimentului"] || details?.["data_evenimentului"] || details?.["data"] || "—";
  };

  const formatPhone = (phone: string) => {
    return phone?.replace(/^\+?40/, "0") || phone;
  };

  const renderEventCard = (ev: EventRow) => {
    const st = STATUS_MAP[ev.event_status] || STATUS_MAP.new;
    const eventDate = formatDate(ev.event_details || {});
    const location = ev.event_details?.["Locația"] || ev.event_details?.["locatia"] || "";
    const kids = ev.event_details?.["Număr Copii"] || ev.event_details?.["numar_copii"] || "";

    return (
      <div key={ev.id} className="rounded-xl border border-[var(--color-border)] bg-black/30 hover:border-purple-500/30 transition-all">
        {/* Header */}
        <div className="px-4 py-3 flex justify-between items-center border-b border-white/5">
          <div className="flex items-center gap-3">
            <span className="text-xl">{st.icon}</span>
            <div>
              <div className="font-bold text-sm text-purple-400">{ev.role_title.replace("Rol: ", "")}</div>
              <div className="text-[10px] text-[var(--color-dim)]">
                📱 {formatPhone(ev.client_phone)} · 📅 {eventDate}
                {location ? ` · 📍 ${location}` : ""}
                {kids ? ` · 👶 ${kids} copii` : ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[8px] px-2 py-0.5 rounded-full border font-bold uppercase ${st.color}`}>
              {st.label}
            </span>
            {ev.total_amount > 0 && (
              <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold">
                {ev.total_amount} RON
              </span>
            )}
          </div>
        </div>

        {/* Assignment Row */}
        <div className="px-4 py-3 grid grid-cols-3 gap-3">
          {/* Animator */}
          <div>
            <span className="text-[9px] uppercase tracking-wider text-[var(--color-dim)] mb-1 block">🎭 Animator</span>
            <select
              value={ev.assigned_animator || ""}
              onChange={e => assignEmployee(ev.id, "assigned_animator", e.target.value)}
              className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500 text-white"
            >
              <option value="">— Niciun animator —</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.name}>{emp.name}</option>
              ))}
            </select>
          </div>

          {/* Pregătire Bagaj */}
          <div>
            <span className="text-[9px] uppercase tracking-wider text-[var(--color-dim)] mb-1 block">🎒 Pregătire Bagaj</span>
            <select
              value={ev.assigned_prep || ""}
              onChange={e => assignEmployee(ev.id, "assigned_prep", e.target.value)}
              className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500 text-white"
            >
              <option value="">— Nimeni —</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.name}>{emp.name}</option>
              ))}
            </select>
          </div>

          {/* Status Pipeline */}
          <div>
            <span className="text-[9px] uppercase tracking-wider text-[var(--color-dim)] mb-1 block">📊 Status</span>
            <div className="flex gap-1">
              {Object.entries(STATUS_MAP).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setEventStatus(ev.id, key)}
                  className={`text-[9px] px-2 py-1.5 rounded-md border transition-all ${
                    ev.event_status === key
                      ? val.color + " font-bold"
                      : "bg-black/20 text-[var(--color-dim)] border-[var(--color-border)] hover:border-white/20"
                  }`}
                  title={val.label}
                >
                  {val.icon}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return <div className="flex-1 flex items-center justify-center text-[var(--color-dim)]">Se încarcă...</div>;

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">📅</span> Evenimente
            </h2>
            <p className="text-sm text-[var(--color-dim)] mt-1">
              Alocă angajați la evenimente și urmărește progresul.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full border border-yellow-500/30">
              📋 {unassigned.length} nealocate
            </span>
            <span className="text-xs bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full border border-blue-500/30">
              👷 {assigned.length} alocate
            </span>
          </div>
        </div>

        {/* UNASSIGNED */}
        {unassigned.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xs uppercase tracking-wider text-yellow-400 flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
              📋 Nealocate — Necesită atenție ({unassigned.length})
            </h3>
            <div className="space-y-3">
              {unassigned.map(ev => renderEventCard(ev))}
            </div>
          </div>
        )}

        {/* ASSIGNED */}
        {assigned.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xs uppercase tracking-wider text-blue-400 flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              👷 Alocate ({assigned.length})
            </h3>
            <div className="space-y-3">
              {assigned.map(ev => renderEventCard(ev))}
            </div>
          </div>
        )}

        {/* Empty */}
        {events.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-[var(--color-dim)]">
            <div className="text-5xl mb-4 opacity-30">📅</div>
            <p className="text-sm">Niciun eveniment activ.<br/>Evenimentele apar automat când AI-ul sau tu le creezi din panoul de conversații.</p>
          </div>
        )}
      </div>
    </main>
  );
}
