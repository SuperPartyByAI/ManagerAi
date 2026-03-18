"use client";

import { useCallback, useEffect, useState } from "react";

type Employee = {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  phone: string;
  id_card_url: string;
  selfie_url: string;
  contract_url: string;
  face_match_score: number;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string;
  created_at: string;
  approved_at: string;
  approved_by: string;
};

export default function EmployeesBoard() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/employees?status=${filter}`);
    const data = await res.json();
    setEmployees(data.employees || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const handleAction = async (id: string, action: "approve" | "reject", reason?: string) => {
    setActionLoading(id);
    await fetch("/api/admin/employees", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, rejection_reason: reason }),
    });
    setRejectId(null);
    setRejectReason("");
    fetchEmployees();
    setActionLoading(null);
  };

  const filtered = employees;
  const pendingCount = employees.filter((e) => e.status === "pending").length;

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">👥</span> Angajați
            </h2>
            <p className="text-sm text-[var(--color-dim)] mt-1">
              Verifică și aprobă cererile de colaborare ale angajaților.
            </p>
          </div>
          {pendingCount > 0 && (
            <span className="text-xs bg-red-500/20 text-red-400 px-3 py-1 rounded-full border border-red-500/30 font-semibold animate-pulse">
              🔔 {pendingCount} cereri noi
            </span>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6">
          {(["pending", "approved", "rejected", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all border ${
                filter === f
                  ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                  : "bg-black/20 text-[var(--color-dim)] border-[var(--color-border)] hover:border-white/20"
              }`}
            >
              {f === "pending" && "⏳ Pending"}
              {f === "approved" && "✅ Activi"}
              {f === "rejected" && "❌ Respinși"}
              {f === "all" && "📋 Toți"}
            </button>
          ))}
        </div>

        {/* Employee list */}
        {loading ? (
          <div className="text-center py-12 text-[var(--color-dim)]">Se încarcă...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-[var(--color-dim)]">
            <div className="text-4xl mb-3">📭</div>
            <p>Nicio cerere {filter === "pending" ? "în așteptare" : filter === "approved" ? "aprobată" : "respinsă"}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((emp) => (
              <div
                key={emp.id}
                className="rounded-2xl border border-[var(--color-border)] bg-black/20 overflow-hidden"
              >
                <div className="p-5">
                  <div className="flex gap-5">
                    {/* Photos side by side */}
                    <div className="flex gap-3 flex-shrink-0">
                      <div className="w-32 h-40 rounded-xl overflow-hidden border border-[var(--color-border)] bg-black/30">
                        {emp.id_card_url ? (
                          <img
                            src={emp.id_card_url}
                            alt="Buletin"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl text-[var(--color-dim)]">
                            🪪
                          </div>
                        )}
                        <div className="text-[9px] text-center text-[var(--color-dim)] mt-1">Buletin</div>
                      </div>
                      <div className="w-32 h-40 rounded-xl overflow-hidden border border-[var(--color-border)] bg-black/30">
                        {emp.selfie_url ? (
                          <img
                            src={emp.selfie_url}
                            alt="Selfie"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl text-[var(--color-dim)]">
                            🤳
                          </div>
                        )}
                        <div className="text-[9px] text-center text-[var(--color-dim)] mt-1">Selfie</div>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-white">
                          {emp.full_name || "Fără nume"}
                        </h3>
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase ${
                            emp.status === "approved"
                              ? "bg-green-500/15 text-green-400 border-green-500/30"
                              : emp.status === "rejected"
                              ? "bg-red-500/15 text-red-400 border-red-500/30"
                              : "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
                          }`}
                        >
                          {emp.status === "approved" ? "✅ Aprobat" : emp.status === "rejected" ? "❌ Respins" : "⏳ Pending"}
                        </span>
                      </div>

                      <div className="space-y-1 text-sm text-[var(--color-dim)]">
                        {emp.email && (
                          <div>
                            📧 <span className="text-white/80">{emp.email}</span>
                          </div>
                        )}
                        {emp.phone && (
                          <div>
                            📱 <span className="text-white/80">{emp.phone}</span>
                          </div>
                        )}
                        <div>
                          📅 Înregistrat:{" "}
                          <span className="text-white/80">
                            {new Date(emp.created_at).toLocaleDateString("ro-RO")}
                          </span>
                        </div>
                      </div>

                      {/* Face match score */}
                      <div className="mt-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--color-dim)]">🔍 Face Match:</span>
                          <div className="flex-1 max-w-[200px] h-2 bg-black/30 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                emp.face_match_score >= 0.75
                                  ? "bg-green-500"
                                  : emp.face_match_score >= 0.6
                                  ? "bg-yellow-500"
                                  : "bg-red-500"
                              }`}
                              style={{ width: `${emp.face_match_score * 100}%` }}
                            />
                          </div>
                          <span
                            className={`text-xs font-bold ${
                              emp.face_match_score >= 0.75
                                ? "text-green-400"
                                : emp.face_match_score >= 0.6
                                ? "text-yellow-400"
                                : "text-red-400"
                            }`}
                          >
                            {Math.round(emp.face_match_score * 100)}%
                          </span>
                        </div>
                      </div>

                      {/* Contract link */}
                      {emp.contract_url && (
                        <a
                          href={emp.contract_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block mt-2 text-xs text-purple-400 hover:text-purple-300 underline"
                        >
                          📝 Vezi contract semnat
                        </a>
                      )}

                      {/* Rejection reason */}
                      {emp.status === "rejected" && emp.rejection_reason && (
                        <div className="mt-2 text-xs text-red-400/80 bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20">
                          Motiv: {emp.rejection_reason}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  {emp.status === "pending" && (
                    <div className="mt-4 pt-4 border-t border-[var(--color-border)] flex gap-3">
                      <button
                        onClick={() => handleAction(emp.id, "approve")}
                        disabled={actionLoading === emp.id}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-all font-semibold text-sm disabled:opacity-50"
                      >
                        {actionLoading === emp.id ? "..." : "✅ Aprobă"}
                      </button>
                      <button
                        onClick={() => setRejectId(emp.id)}
                        disabled={actionLoading === emp.id}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-all font-semibold text-sm disabled:opacity-50"
                      >
                        ❌ Respinge
                      </button>
                    </div>
                  )}

                  {/* Reject reason modal */}
                  {rejectId === emp.id && (
                    <div className="mt-3 p-3 bg-red-500/5 rounded-xl border border-red-500/20">
                      <input
                        type="text"
                        placeholder="Motiv respingere (opțional)"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        className="w-full bg-black/40 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--color-dim)] focus:outline-none focus:border-red-500 mb-2"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAction(emp.id, "reject", rejectReason)}
                          className="px-4 py-1.5 rounded-lg bg-red-500/30 text-red-400 text-xs font-semibold"
                        >
                          Confirmă respingere
                        </button>
                        <button
                          onClick={() => {
                            setRejectId(null);
                            setRejectReason("");
                          }}
                          className="px-4 py-1.5 rounded-lg bg-black/30 text-[var(--color-dim)] text-xs"
                        >
                          Anulează
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
