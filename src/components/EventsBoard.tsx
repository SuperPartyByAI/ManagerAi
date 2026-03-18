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

// A "group" = one parent event (same phone + date + location) with sub-roles
type EventGroup = {
  groupId: string;        // "01", "02", etc.
  phone: string;
  date: string;
  location: string;
  celebrant: string;
  age: string;
  kids: string;
  items: { subId: string; ev: EventRow }[];
};

const STATUS_MAP: Record<string, { label: string; color: string; icon: string }> = {
  new: { label: "NOU", color: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30", icon: "📋" },
  assigned: { label: "ALOCAT", color: "text-blue-400 bg-blue-500/15 border-blue-500/30", icon: "👷" },
  prepared: { label: "PREGĂTIT", color: "text-purple-400 bg-purple-500/15 border-purple-500/30", icon: "🎒" },
  completed: { label: "FINALIZAT", color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30", icon: "✅" },
};

const ROLE_ICONS: Record<string, string> = {
  "animatie": "🎭",
  "ursitoare": "🧚",
  "vata de zahar": "🍭",
  "popcorn": "🍿",
  "tort de dulciuri": "🎂",
  "mascota": "🐻",
  "face painting": "🎨",
  "baloane": "🎈",
  "candy bar": "🍬",
  "foto": "📸",
  "dj": "🎵",
};

function getRoleIcon(title: string): string {
  const lower = title.toLowerCase().replace("rol: ", "");
  for (const [key, icon] of Object.entries(ROLE_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return "🎪";
}

function getEventKey(ev: EventRow): string {
  const d = ev.event_details || {};
  const date = d["Data Evenimentului"] || d["data_evenimentului"] || d["data"] || "";
  const loc = d["Locația"] || d["locatia"] || "";
  return `${ev.client_phone}|${date}|${loc}`;
}

function buildGroups(events: EventRow[]): EventGroup[] {
  const map = new Map<string, EventRow[]>();

  for (const ev of events) {
    const key = getEventKey(ev);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ev);
  }

  const groups: EventGroup[] = [];
  let idx = 0;

  for (const [, items] of map) {
    idx++;
    const groupId = String(idx).padStart(2, "0");
    const first = items[0];
    const d = first.event_details || {};
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    groups.push({
      groupId,
      phone: first.client_phone,
      date: d["Data Evenimentului"] || d["data_evenimentului"] || d["data"] || "—",
      location: d["Locația"] || d["locatia"] || "",
      celebrant: d["Nume Sărbătorit"] || d["nume_sarbatorit"] || "",
      age: d["Vârstă Sărbătorit"] || d["varsta_sarbatorit"] || "",
      kids: d["Număr Copii"] || d["numar_copii"] || "",
      items: items.map((ev, i) => ({
        subId: groupId + letters[i],
        ev,
      })),
    });
  }

  return groups;
}

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

  const groups = buildGroups(events);
  const formatPhone = (phone: string) => phone?.replace(/^\+?40/, "0") || phone;

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
            <span className="text-xs bg-purple-500/20 text-purple-400 px-3 py-1 rounded-full border border-purple-500/30 font-semibold">
              📦 {groups.length} evenimente
            </span>
            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full border border-yellow-500/30">
              🎭 {events.length} servicii
            </span>
          </div>
        </div>

        {/* Event Groups */}
        {groups.length > 0 ? (
          <div className="space-y-6">
            {groups.map(group => (
              <div key={group.groupId} className="rounded-2xl border border-[var(--color-border)] bg-black/20 overflow-hidden">
                {/* GROUP HEADER — parent event info */}
                <div className="px-5 py-4 bg-gradient-to-r from-purple-500/10 to-transparent border-b border-[var(--color-border)] flex items-center gap-4">
                  {/* Big Visual ID */}
                  <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center">
                    <span className="text-2xl font-black text-purple-400 tracking-tight">{group.groupId}</span>
                  </div>
                  {/* Event Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-sm font-semibold text-white">
                        📱 {formatPhone(group.phone)}
                      </span>
                      {group.celebrant && (
                        <span className="text-xs bg-pink-500/15 text-pink-400 px-2 py-0.5 rounded-full border border-pink-500/30">
                          🎂 {group.celebrant}{group.age ? `, ${group.age} ani` : ""}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--color-dim)] mt-1 flex items-center gap-3 flex-wrap">
                      <span>📅 {group.date}</span>
                      {group.location && <span>📍 {group.location}</span>}
                      {group.kids && <span>👶 {group.kids} copii</span>}
                      <span className="text-purple-400/60">•</span>
                      <span className="text-purple-400/80">{group.items.length} servicii</span>
                    </div>
                  </div>
                </div>

                {/* SUB-ROLES — individual service CARDS */}
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.items.map(({ subId, ev }) => {
                    const st = STATUS_MAP[ev.event_status] || STATUS_MAP.new;
                    const roleIcon = getRoleIcon(ev.role_title);
                    const roleClean = ev.role_title.replace("Rol: ", "");
                    const d = ev.event_details || {};
                    const duration = d["Durata (ore)"] || d["durata_ore"] || "";
                    const character = d["Personajul Dorit"] || d["personaj_dorit"] || "";
                    const ursitoare = d["varianta_ursitoare"] || "";
                    const servire = d["mod_servire"] || "";
                    const ora = d["Ora Început"] || d["ora_inceput"] || "";

                    return (
                      <div key={ev.id} className="rounded-xl border border-[var(--color-border)] bg-black/30 hover:border-purple-500/30 transition-all flex flex-col">
                        {/* Card Header — Sub-ID + Role */}
                        <div className="px-3 py-2.5 border-b border-white/[0.04] flex items-center gap-3">
                          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
                            <span className="text-xs font-black text-purple-400">{subId}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{roleIcon}</span>
                              <span className="text-sm font-bold text-white">{roleClean}</span>
                            </div>
                            {character && (
                              <div className="text-[10px] text-purple-300/70 mt-0.5">🎭 {character}</div>
                            )}
                          </div>
                          <span className={`text-[8px] px-2 py-0.5 rounded-full border font-bold uppercase flex-shrink-0 ${st.color}`}>
                            {st.icon} {st.label}
                          </span>
                        </div>

                        {/* Details Chips */}
                        <div className="px-3 py-2 flex flex-wrap gap-1.5">
                          {ora && (
                            <span className="text-[9px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">
                              🕐 {ora}
                            </span>
                          )}
                          {duration && (
                            <span className="text-[9px] bg-green-500/10 text-green-400 px-2 py-0.5 rounded border border-green-500/20">
                              ⏱ {duration}h
                            </span>
                          )}
                          {ursitoare && (
                            <span className="text-[9px] bg-pink-500/10 text-pink-400 px-2 py-0.5 rounded border border-pink-500/20">
                              🧚 {ursitoare}
                            </span>
                          )}
                          {servire && (
                            <span className="text-[9px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                              🍭 {servire}
                            </span>
                          )}
                          {ev.total_amount > 0 && (
                            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-bold">
                              💰 {ev.total_amount} RON
                            </span>
                          )}
                        </div>

                        {/* Assignment + Status */}
                        <div className="px-3 py-2.5 mt-auto border-t border-white/[0.04] space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-[8px] uppercase tracking-wider text-[var(--color-dim)] block mb-1">🎭 Animator</span>
                              <select
                                value={ev.assigned_animator || ""}
                                onChange={e => assignEmployee(ev.id, "assigned_animator", e.target.value)}
                                className="w-full bg-black/40 border border-[var(--color-border)] rounded-md px-2 py-1 text-[10px] focus:outline-none focus:border-purple-500 text-white"
                              >
                                <option value="">— Niciun —</option>
                                {employees.map(emp => (
                                  <option key={emp.id} value={emp.name}>{emp.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <span className="text-[8px] uppercase tracking-wider text-[var(--color-dim)] block mb-1">🎒 Pregătire</span>
                              <select
                                value={ev.assigned_prep || ""}
                                onChange={e => assignEmployee(ev.id, "assigned_prep", e.target.value)}
                                className="w-full bg-black/40 border border-[var(--color-border)] rounded-md px-2 py-1 text-[10px] focus:outline-none focus:border-purple-500 text-white"
                              >
                                <option value="">— Nimeni —</option>
                                {employees.map(emp => (
                                  <option key={emp.id} value={emp.name}>{emp.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            {Object.entries(STATUS_MAP).map(([key, val]) => (
                              <button
                                key={key}
                                onClick={() => setEventStatus(ev.id, key)}
                                className={`flex-1 text-[8px] px-1 py-1.5 rounded-md border transition-all ${
                                  ev.event_status === key
                                    ? val.color + " font-bold"
                                    : "bg-black/20 text-[var(--color-dim)] border-[var(--color-border)] hover:border-white/20"
                                }`}
                                title={val.label}
                              >
                                {val.icon} {val.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-[var(--color-dim)]">
            <div className="text-5xl mb-4 opacity-30">📅</div>
            <p className="text-sm">Niciun eveniment activ.<br/>Evenimentele apar automat când AI-ul sau tu le creezi din panoul de conversații.</p>
          </div>
        )}
      </div>
    </main>
  );
}
