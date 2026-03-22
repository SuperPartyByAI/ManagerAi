"use client";
import { useState, useEffect, useCallback } from "react";

type GoalStrategy = { goal_key: string; name: string; strategy: string; updated_at: string };
type FollowupTemplate = { type: string; name: string; message: string; delay_hours: number; updated_at: string };
type Playbook = { key: string; name: string; strategy: string; tone: string; description: string };

type Tab = "goals" | "followup" | "playbook";

export default function AiConfigManager() {
  const [tab, setTab] = useState<Tab>("goals");
  const [goals, setGoals] = useState<GoalStrategy[]>([]);
  const [followups, setFollowups] = useState<FollowupTemplate[]>([]);
  const [playbook, setPlaybook] = useState<Playbook[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ai-config");
      const data = await res.json();
      setGoals(data.goals || []);
      setFollowups(data.followups || []);
      setPlaybook(data.playbook || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const save = async (table: string, keyField: string, keyValue: string, updates: Record<string, string | number>) => {
    setSaving(keyValue);
    try {
      await fetch("/api/admin/ai-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, key_field: keyField, key_value: keyValue, updates }),
      });
      setSaved(keyValue);
      setTimeout(() => setSaved(null), 2000);
    } finally {
      setSaving(null);
    }
  };

  const TABS: { id: Tab; label: string; emoji: string; color: string }[] = [
    { id: "goals", label: "Strategii Vânzare", emoji: "🎯", color: "emerald" },
    { id: "followup", label: "Follow-up Auto", emoji: "⏰", color: "blue" },
    { id: "playbook", label: "Scenarii", emoji: "📋", color: "purple" },
  ];

  return (
    <div className="h-full flex flex-col gap-4 p-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="text-3xl">🧠</div>
        <div>
          <h1 className="text-lg font-bold text-white">Configurare AI</h1>
          <p className="text-xs text-gray-400">Editați comportamentul AI-ului fără cod — modificările sunt active imediat</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
              tab === t.id
                ? t.color === "emerald" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50"
                : t.color === "blue" ? "bg-blue-500/20 text-blue-400 border-blue-500/50"
                : "bg-purple-500/20 text-purple-400 border-purple-500/50"
                : "text-gray-400 border-transparent hover:bg-white/5"
            }`}>
            <span>{t.emoji}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {loading && (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Se încarcă...</div>
        )}

        {/* GOALS TAB */}
        {!loading && tab === "goals" && goals.map(g => (
          <GoalCard key={g.goal_key} item={g}
            onSave={(strategy) => save("ai_goal_strategies", "goal_key", g.goal_key, { strategy })}
            saving={saving === g.goal_key} saved={saved === g.goal_key} />
        ))}

        {/* FOLLOWUP TAB */}
        {!loading && tab === "followup" && followups.map(f => (
          <FollowupCard key={f.type} item={f}
            onSave={(message, delay_hours) => save("ai_followup_templates", "type", f.type, { message, delay_hours })}
            saving={saving === f.type} saved={saved === f.type} />
        ))}

        {/* PLAYBOOK TAB */}
        {!loading && tab === "playbook" && playbook.map(p => (
          <PlaybookCard key={p.key} item={p}
            onSave={(strategy) => save("sales_playbooks", "key", p.key, { strategy })}
            saving={saving === p.key} saved={saved === p.key} />
        ))}
      </div>
    </div>
  );
}

function GoalCard({ item, onSave, saving, saved }: { item: GoalStrategy; onSave: (s: string) => void; saving: boolean; saved: boolean }) {
  const [val, setVal] = useState(item.strategy);
  useEffect(() => setVal(item.strategy), [item.strategy]);
  const dirty = val !== item.strategy;

  return (
    <div className="glass-panel rounded-xl p-4 space-y-3 border border-white/5">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-white text-sm">{item.name}</div>
          <div className="text-[10px] text-gray-500 font-mono">{item.goal_key}</div>
        </div>
        {saved && <span className="text-xs text-emerald-400">✓ Salvat!</span>}
      </div>
      <textarea value={val} onChange={e => setVal(e.target.value)}
        className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-gray-200 resize-none focus:outline-none focus:border-emerald-500/50 transition-all"
        rows={3} />
      {dirty && (
        <button onClick={() => onSave(val)} disabled={saving}
          className="px-4 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-lg text-xs font-medium hover:bg-emerald-500/30 transition-all disabled:opacity-50">
          {saving ? "Se salvează..." : "💾 Salvează"}
        </button>
      )}
    </div>
  );
}

function FollowupCard({ item, onSave, saving, saved }: { item: FollowupTemplate; onSave: (m: string, h: number) => void; saving: boolean; saved: boolean }) {
  const [msg, setMsg] = useState(item.message);
  const [hours, setHours] = useState(item.delay_hours);
  useEffect(() => { setMsg(item.message); setHours(item.delay_hours); }, [item.message, item.delay_hours]);
  const dirty = msg !== item.message || hours !== item.delay_hours;

  return (
    <div className="glass-panel rounded-xl p-4 space-y-3 border border-white/5">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-white text-sm">{item.name}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-gray-500">Trimis după</span>
            <input type="number" value={hours} onChange={e => setHours(Number(e.target.value))}
              className="w-14 bg-black/30 border border-white/10 rounded px-2 py-0.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500/50"
              min={1} max={168} />
            <span className="text-[10px] text-gray-500">ore</span>
          </div>
        </div>
        {saved && <span className="text-xs text-blue-400">✓ Salvat!</span>}
      </div>
      <textarea value={msg} onChange={e => setMsg(e.target.value)}
        className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-gray-200 resize-none focus:outline-none focus:border-blue-500/50 transition-all"
        rows={4} />
      {dirty && (
        <button onClick={() => onSave(msg, hours)} disabled={saving}
          className="px-4 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/40 rounded-lg text-xs font-medium hover:bg-blue-500/30 transition-all disabled:opacity-50">
          {saving ? "Se salvează..." : "💾 Salvează"}
        </button>
      )}
    </div>
  );
}

function PlaybookCard({ item, onSave, saving, saved }: { item: Playbook; onSave: (s: string) => void; saving: boolean; saved: boolean }) {
  const [val, setVal] = useState(item.strategy);
  useEffect(() => setVal(item.strategy), [item.strategy]);
  const dirty = val !== item.strategy;

  return (
    <div className="glass-panel rounded-xl p-4 space-y-3 border border-white/5">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-white text-sm">{item.name || item.key}</div>
          <div className="text-[10px] text-gray-500">{item.description}</div>
        </div>
        {saved && <span className="text-xs text-purple-400">✓ Salvat!</span>}
      </div>
      <textarea value={val} onChange={e => setVal(e.target.value)}
        className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-gray-200 resize-none focus:outline-none focus:border-purple-500/50 transition-all"
        rows={3} />
      {dirty && (
        <button onClick={() => onSave(val)} disabled={saving}
          className="px-4 py-1.5 bg-purple-500/20 text-purple-400 border border-purple-500/40 rounded-lg text-xs font-medium hover:bg-purple-500/30 transition-all disabled:opacity-50">
          {saving ? "Se salvează..." : "💾 Salvează"}
        </button>
      )}
    </div>
  );
}
