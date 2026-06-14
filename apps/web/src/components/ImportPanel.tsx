import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Anomaly {
  id: string;
  rowNumber: number;
  anomalyType: string;
  description: string;
  resolution: string;
  resolutionNotes: string | null;
  editedValue: any | null;
  rawRow: any;
}

interface ImportRow {
  id: string;
  rowNumber: number;
  rawData: any;
  status: string;
}

interface ImportSession {
  id: string;
  filename: string;
  status: string;
  anomalies: Anomaly[];
  rows: ImportRow[];
}

interface Member {
  id: string;
  name: string;
  email: string;
}

interface ImportPanelProps {
  groupId: string;
  onImportComplete: () => void;
}

// ─── Anomaly display config ─────────────────────────────────────────────────────
const ANOMALY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  exact_duplicate:          { label: "Exact Duplicate",        color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  conflicting_duplicate:    { label: "Conflicting Duplicate",  color: "#f97316", bg: "rgba(249,115,22,0.1)" },
  settlement_candidate:     { label: "Settlement Candidate",   color: "#0ea5e9", bg: "rgba(14,165,233,0.1)" },
  ambiguous_date:           { label: "Ambiguous Date",         color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  invalid_percentage_sum:   { label: "Invalid % Split",        color: "#f97316", bg: "rgba(249,115,22,0.1)" },
  negative_amount:          { label: "Negative Amount",        color: "#ef4444", bg: "rgba(239,68,68,0.1)"  },
  missing_payer:            { label: "Missing Payer",          color: "#ef4444", bg: "rgba(239,68,68,0.1)"  },
  unknown_payer:            { label: "Unknown Payer",          color: "#ef4444", bg: "rgba(239,68,68,0.1)"  },
  non_member_payer:         { label: "Non-Member Payer",       color: "#ef4444", bg: "rgba(239,68,68,0.1)"  },
  malformed_amount:         { label: "Invalid Amount",         color: "#ef4444", bg: "rgba(239,68,68,0.1)"  },
  invalid_date:             { label: "Invalid Date",           color: "#ef4444", bg: "rgba(239,68,68,0.1)"  },
  zero_amount:              { label: "Zero Amount",            color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  inactive_member_payer:    { label: "Inactive Payer",         color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  post_exit_split:          { label: "Post-Exit Member",       color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  pre_join_split:           { label: "Pre-Join Member",        color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  whitespace_payer:         { label: "Whitespace in Name",     color: "#818cf8", bg: "rgba(99,102,241,0.1)" },
  case_inconsistency_payer: { label: "Name Case Mismatch",     color: "#818cf8", bg: "rgba(99,102,241,0.1)" },
  whitespace_amount:        { label: "Malformed Amount",       color: "#818cf8", bg: "rgba(99,102,241,0.1)" },
  sub_paisa_precision:      { label: "Sub-Paisa Precision",    color: "#818cf8", bg: "rgba(99,102,241,0.1)" },
  missing_currency:         { label: "Missing Currency",       color: "#818cf8", bg: "rgba(99,102,241,0.1)" },
  missing_year:             { label: "Missing Year",           color: "#818cf8", bg: "rgba(99,102,241,0.1)" },
  visitor_payer:            { label: "Visitor Payer",          color: "#818cf8", bg: "rgba(99,102,241,0.1)" },
  non_member_split:         { label: "Non-Member in Split",    color: "#818cf8", bg: "rgba(99,102,241,0.1)" },
  type_detail_mismatch:     { label: "Type/Detail Mismatch",   color: "#818cf8", bg: "rgba(99,102,241,0.1)" },
};

function getAnomalyConfig(type: string) {
  return ANOMALY_CONFIG[type] ?? {
    label: type.replace(/_/g, " "),
    color: "#94a3b8",
    bg: "rgba(148,163,184,0.1)",
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
const CURRENCY_SYMBOLS: Record<string, { symbol: string; locale: string; decimals: number }> = {
  INR: { symbol: "₹",   locale: "en-IN", decimals: 2 },
  USD: { symbol: "$",   locale: "en-US", decimals: 2 },
  EUR: { symbol: "€",   locale: "de-DE", decimals: 2 },
  JPY: { symbol: "¥",   locale: "ja-JP", decimals: 0 },
  GBP: { symbol: "£",   locale: "en-GB", decimals: 2 },
  CNY: { symbol: "¥",   locale: "zh-CN", decimals: 2 },
  CAD: { symbol: "CA$", locale: "en-CA", decimals: 2 },
  AUD: { symbol: "A$",  locale: "en-AU", decimals: 2 },
  CHF: { symbol: "CHF", locale: "de-CH", decimals: 2 },
  HKD: { symbol: "HK$", locale: "zh-HK", decimals: 2 },
  SGD: { symbol: "S$",  locale: "en-SG", decimals: 2 },
};

function formatCurrency(amount: string | number | null | undefined, currency = "INR"): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const num = parseFloat(String(amount).replace(/,/g, ""));
  if (isNaN(num)) return String(amount);
  const cfg = CURRENCY_SYMBOLS[currency] ?? CURRENCY_SYMBOLS["INR"];
  return `${cfg.symbol}${num.toLocaleString(cfg.locale, { minimumFractionDigits: cfg.decimals, maximumFractionDigits: cfg.decimals })}`;
}

function isValidAmount(v: string | undefined): boolean {
  return v != null && v.trim() !== "" && Number.isFinite(Number(v));
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "Unknown date";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

interface ActionBtnProps {
  color: string;
  outline?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ActionBtn({ color, outline = false, disabled = false, onClick, children }: ActionBtnProps) {
  const colorMap: Record<string, { variant: "default" | "outline" | "ghost"; className: string }> = {
    "#10b981": {
      variant: outline ? "outline" : "default",
      className: outline
        ? "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
        : "bg-emerald-500 hover:bg-emerald-600 text-white border-transparent",
    },
    "#ef4444": {
      variant: "outline",
      className: "border-red-500/40 text-red-400 hover:bg-red-500/10",
    },
    "#6366f1": {
      variant: outline ? "outline" : "default",
      className: outline
        ? "border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/10"
        : "bg-indigo-500 hover:bg-indigo-600 text-white border-transparent",
    },
    "#0ea5e9": {
      variant: outline ? "outline" : "default",
      className: outline
        ? "border-sky-500/40 text-sky-300 hover:bg-sky-500/10"
        : "bg-sky-500 hover:bg-sky-600 text-white border-transparent",
    },
    "#f59e0b": {
      variant: "outline",
      className: "border-amber-500/40 text-amber-300 hover:bg-amber-500/10",
    },
    "#94a3b8": {
      variant: "outline",
      className: "border-white/10 text-slate-400 hover:bg-white/5",
    },
    "#64748b": {
      variant: "outline",
      className: "border-white/[0.08] text-slate-400 hover:bg-white/5",
    },
  };
  const mapped = colorMap[color] ?? { variant: "outline" as const, className: "border-white/10 text-slate-400" };

  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      variant={mapped.variant}
      size="sm"
      className={mapped.className}
    >
      {children}
    </Button>
  );
}

interface RowPreviewProps {
  rawRow: any;
  label?: string;
  highlight?: boolean;
}

function RowPreview({ rawRow, label, highlight = false }: RowPreviewProps) {
  if (!rawRow) return null;
  const currency = rawRow.currency?.trim().toUpperCase() || "INR";
  const splitNames: string[] = rawRow.split_with
    ? rawRow.split_with.split(";").map((n: string) => n.trim()).filter(Boolean)
    : [];

  return (
    <div>
      {label && (
        <div className="text-[0.7rem] text-slate-500 uppercase tracking-wider mb-1 font-bold">
          {label}
        </div>
      )}
      <div className={highlight
        ? "bg-indigo-500/[0.07] border border-indigo-500/25 rounded-lg px-4 py-3"
        : "bg-black/25 border border-white/6 rounded-lg px-4 py-3"
      }>
        <div className="font-semibold text-sm text-slate-100 mb-1 block">
          {rawRow.description || <span className="text-slate-500 italic">no description</span>}
        </div>
        <div className="flex gap-2 text-xs text-slate-400 flex-wrap items-center">
          <span>
            Paid by{" "}
            <strong className="text-slate-100">{rawRow.paid_by?.trim() || "—"}</strong>
          </span>
          <span className="text-slate-500">·</span>
          <span className={`font-bold ${currency === "USD" ? "text-sky-300" : "text-emerald-300"}`}>
            {formatCurrency(rawRow.amount, currency)}
            {currency !== "INR" && (
              <span className="text-slate-500 font-normal ml-1">{currency}</span>
            )}
          </span>
          <span className="text-slate-500">·</span>
          <span>{formatDate(rawRow.date)}</span>
          {rawRow.split_type && rawRow.split_type !== "NaN" && (
            <>
              <span className="text-slate-500">·</span>
              <span className="capitalize">{rawRow.split_type} split</span>
            </>
          )}
        </div>
        {splitNames.length > 0 && (
          <div className="mt-1 text-[0.76rem] text-slate-500">
            Split with: {splitNames.join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────
export default function ImportPanel({ groupId, onImportComplete }: ImportPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [session, setSession] = useState<ImportSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "pending" | "auto_fixed" | "resolved">("all");
  // Track auto_fixed items the user has manually overridden to skip, so undo can restore to auto_fixed
  const [autoFixedSkipped, setAutoFixedSkipped] = useState<Set<string>>(new Set());
  // Group members — used for the "map payer to existing member" dropdowns
  const [members, setMembers] = useState<Member[]>([]);
  // Per-card local input state (keyed by anomaly id, or by joined ids for clubbed cards)
  const [payerMapSel, setPayerMapSel] = useState<Record<string, string>>({});
  const [amountEdits, setAmountEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`http://localhost:3001/groups/${groupId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => { if (g?.members) setMembers(g.members.map((m: any) => ({ id: m.id, name: m.name, email: m.email }))); })
      .catch(() => { /* dropdowns simply stay empty if members can't be loaded */ });
  }, [groupId]);

  const memberName = (id: string | undefined) => members.find((m) => m.id === id)?.name ?? "member";

  // ── API handlers ───────────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setFile(e.target.files[0]);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError("");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("groupId", groupId);
    try {
      const res = await fetch("http://localhost:3001/import/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to parse CSV");
      setSession(data);
      setActiveFilter("all");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const patchAnomaly = async (anomalyId: string, resolution: string, editedValue?: any) => {
    const res = await fetch(`http://localhost:3001/import/anomaly/${anomalyId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({ resolution, resolutionNotes: null, editedValue }),
    });
    if (!res.ok) throw new Error("Failed to update resolution");
  };

  const handleResolve = async (anomalyId: string, resolution: string, editedValue?: any) => {
    try {
      await patchAnomaly(anomalyId, resolution, editedValue);
      if (session) {
        setSession({
          ...session,
          anomalies: session.anomalies.map((a) =>
            a.id === anomalyId
              ? { ...a, resolution, editedValue: editedValue !== undefined ? editedValue : a.editedValue }
              : a
          ),
        });
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResolveMany = async (ids: string[], resolution: string, editedValue?: any) => {
    try {
      await Promise.all(ids.map((id) => patchAnomaly(id, resolution, editedValue)));
      if (session) {
        setSession({
          ...session,
          anomalies: session.anomalies.map((a) =>
            ids.includes(a.id)
              ? { ...a, resolution, editedValue: editedValue !== undefined ? editedValue : a.editedValue }
              : a
          ),
        });
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSkipAutoFixed = async (anomalyId: string) => {
    await handleResolve(anomalyId, "user_rejected");
    setAutoFixedSkipped((prev) => new Set([...prev, anomalyId]));
  };

  const handleSkipAutoFixedMany = async (ids: string[]) => {
    await handleResolveMany(ids, "user_rejected");
    setAutoFixedSkipped((prev) => new Set([...prev, ...ids]));
  };

  const handleUndoSkip = async (anomalyId: string) => {
    const restoreTo = autoFixedSkipped.has(anomalyId) ? "auto_fixed" : "pending";
    await handleResolve(anomalyId, restoreTo);
    setAutoFixedSkipped((prev) => {
      const next = new Set(prev);
      next.delete(anomalyId);
      return next;
    });
  };

  const handleUndoSkipMany = async (ids: string[]) => {
    const resolutions = ids.map((id) => (autoFixedSkipped.has(id) ? "auto_fixed" : "pending"));
    try {
      await Promise.all(ids.map((id, i) => patchAnomaly(id, resolutions[i])));
      if (session) {
        setSession({
          ...session,
          anomalies: session.anomalies.map((a, _i) => {
            const idx = ids.indexOf(a.id);
            if (idx === -1) return a;
            return { ...a, resolution: resolutions[idx] };
          }),
        });
      }
      setAutoFixedSkipped((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Map an unknown / missing payer to a real member (single + bulk)
  const handleMapPayer = (anomalyId: string, userId: string) =>
    handleResolve(anomalyId, "user_approved", { mapToUserId: userId });
  const handleMapPayerMany = (ids: string[], userId: string) =>
    handleResolveMany(ids, "user_approved", { mapToUserId: userId });

  // Add a non-member / visitor payer to the group as a member (single + bulk)
  const handleAddAsMember = async (anomalyId: string) => {
    await handleResolve(anomalyId, "user_approved", { addAsMember: true });
    setAutoFixedSkipped((prev) => { const n = new Set(prev); n.delete(anomalyId); return n; });
  };
  const handleAddAsMemberMany = async (ids: string[]) => {
    await handleResolveMany(ids, "user_approved", { addAsMember: true });
    setAutoFixedSkipped((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n; });
  };

  // Apply a manually-typed amount correction, preserving any existing editedValue keys
  const handleApplyAmount = (anom: Anomaly, value: string) => {
    if (!isValidAmount(value)) return;
    return handleResolve(anom.id, "user_approved", { ...(anom.editedValue ?? {}), amount: Number(value) });
  };
  const handleApplyAmountMany = (group: Anomaly[], value: string) => {
    if (!isValidAmount(value)) return;
    // Each anomaly keeps its own editedValue; only the amount is shared across the group
    return Promise.all(
      group.map((a) => patchAnomaly(a.id, "user_approved", { ...(a.editedValue ?? {}), amount: Number(value) }))
    ).then(() => {
      if (!session) return;
      const ids = group.map((a) => a.id);
      setSession({
        ...session,
        anomalies: session.anomalies.map((a) =>
          ids.includes(a.id)
            ? { ...a, resolution: "user_approved", editedValue: { ...(a.editedValue ?? {}), amount: Number(value) } }
            : a
        ),
      });
    }).catch((err: any) => setError(err.message));
  };

  // Apply one date interpretation to every pending ambiguous date at once.
  // optionIndex 0 = DD/MM/YYYY reading, 1 = MM/DD/YYYY reading (order set by the backend).
  const handleBulkAmbiguousDate = async (optionIndex: number) => {
    if (!session) return;
    const targets = session.anomalies.filter(
      (a) => a.anomalyType === "ambiguous_date" && a.resolution === "pending" && a.editedValue?.dateOptions?.[optionIndex]
    );
    if (targets.length === 0) return;
    try {
      await Promise.all(
        targets.map((a) =>
          patchAnomaly(a.id, "user_approved", { ...a.editedValue, date: a.editedValue.dateOptions[optionIndex].value })
        )
      );
      const ids = new Set(targets.map((a) => a.id));
      setSession({
        ...session,
        anomalies: session.anomalies.map((a) =>
          ids.has(a.id)
            ? { ...a, resolution: "user_approved", editedValue: { ...a.editedValue, date: a.editedValue.dateOptions[optionIndex].value } }
            : a
        ),
      });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCommit = async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`http://localhost:3001/import/session/${session.id}/commit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to commit import session");
      setSuccessMsg("CSV imported and processed successfully!");
      setSession(null);
      setFile(null);
      setAutoFixedSkipped(new Set());
      setTimeout(() => { setSuccessMsg(""); onImportComplete(); }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Derived counts ─────────────────────────────────────────────────────────────
  const pendingCount      = session?.anomalies.filter((a) => a.resolution === "pending").length ?? 0;
  const autoFixedCount    = session?.anomalies.filter((a) => a.resolution === "auto_fixed").length ?? 0;
  const approvedCount     = session?.anomalies.filter((a) => a.resolution === "user_approved").length ?? 0;
  const skippedCount      = session?.anomalies.filter((a) => a.resolution === "user_rejected").length ?? 0;
  const resolvedUserCount = approvedCount + skippedCount;
  const ambiguousDatePending = session?.anomalies.filter(
    (a) => a.anomalyType === "ambiguous_date" && a.resolution === "pending"
  ) ?? [];

  const filteredAnomalies = session?.anomalies.filter((a) => {
    if (activeFilter === "pending")    return a.resolution === "pending";
    if (activeFilter === "auto_fixed") return a.resolution === "auto_fixed";
    if (activeFilter === "resolved")   return ["user_approved", "user_rejected"].includes(a.resolution);
    return true;
  }) ?? [];

  // ── Conflict row lookup ────────────────────────────────────────────────────────
  function getConflictFirstRow(anom: Anomaly): any | null {
    if (!session) return null;
    const match = anom.description.match(/Conflict: Row (\d+)/);
    if (!match) return null;
    return session.rows.find((r) => r.rowNumber === parseInt(match[1]))?.rawData ?? null;
  }

  function getConflictFirstRowNum(anom: Anomaly): string | null {
    return anom.description.match(/Conflict: Row (\d+)/)?.[1] ?? null;
  }

  // ── Resolution status badge ─────────────────────────────────────────────────────
  function StatusBadge({ resolution }: { resolution: string }) {
    const map: Record<string, { label: string; className: string }> = {
      pending:       { label: "NEEDS DECISION", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
      auto_fixed:    { label: "AUTO-FIXED",     className: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
      user_approved: { label: "APPROVED",       className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
      user_rejected: { label: "WILL SKIP",      className: "bg-slate-700/40 text-slate-400 border-white/[0.08]" },
    };
    const cfg = map[resolution] ?? { label: resolution.toUpperCase(), className: "bg-slate-700/40 text-slate-400 border-white/[0.08]" };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-bold tracking-wide border whitespace-nowrap ${cfg.className}`}>
        {cfg.label}
      </span>
    );
  }

  // ── Anomaly card ───────────────────────────────────────────────────────────────
  function renderCard(anom: Anomaly) {
    const cfg = getAnomalyConfig(anom.anomalyType);
    const borderColor =
      anom.resolution === "pending"         ? cfg.color
      : anom.resolution === "auto_fixed"    ? "rgba(129,140,248,0.3)"
      : anom.resolution === "user_approved" ? "rgba(16,185,129,0.3)"
      : "rgba(100,116,139,0.18)";

    const isConflict = anom.anomalyType === "conflicting_duplicate";
    const conflictFirstRowNum = isConflict ? getConflictFirstRowNum(anom) : null;
    const conflictFirstRowData = isConflict ? getConflictFirstRow(anom) : null;

    return (
      <div
        key={anom.id}
        style={{ borderColor }}
        className="bg-slate-950/55 border rounded-[10px] p-5 flex flex-col gap-3.5 transition-colors duration-200"
      >
        {/* ── Card header: row number + type badge + status ── */}
        <div className="flex justify-between items-start gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-slate-950/80 border border-white/9 px-2 py-0.5 rounded text-[0.68rem] text-slate-500 font-mono font-bold tracking-wide">
              ROW {anom.rowNumber}
            </span>
            <span
              className="px-2 py-0.5 rounded-full text-[0.7rem] font-bold tracking-wide"
              style={{ background: cfg.bg, color: cfg.color }}
            >
              {cfg.label.toUpperCase()}
            </span>
          </div>
          <StatusBadge resolution={anom.resolution} />
        </div>

        {/* ── Description ── */}
        <p className="text-sm text-slate-400 leading-relaxed m-0">
          {anom.description}
        </p>

        {/* ── Auto-fix explanation ── */}
        {anom.resolution === "auto_fixed" && anom.resolutionNotes && (
          <div className="bg-indigo-500/[0.07] border border-indigo-500/20 rounded-md px-3 py-2 text-sm text-indigo-300 flex gap-2 items-baseline">
            <span className="text-slate-500 shrink-0">Auto-fix applied:</span>
            <span className="font-bold">{anom.resolutionNotes}</span>
          </div>
        )}

        {/* ── User-approved note ── */}
        {anom.resolution === "user_approved" && anom.resolutionNotes && (
          <div className="bg-emerald-500/6 border border-emerald-500/20 rounded-md px-3 py-2 text-sm text-emerald-300 flex gap-2 items-baseline">
            <span className="text-slate-500 shrink-0">Decision:</span>
            <span className="font-bold">{anom.resolutionNotes}</span>
          </div>
        )}

        {/* ── Row data preview ── */}
        {isConflict ? (
          <div className="grid grid-cols-2 gap-2.5">
            <RowPreview
              rawRow={conflictFirstRowData}
              label={`Row ${conflictFirstRowNum ?? "?"}`}
            />
            <RowPreview
              rawRow={anom.rawRow}
              label={`Row ${anom.rowNumber} (this row)`}
              highlight
            />
          </div>
        ) : (
          anom.rawRow && <RowPreview rawRow={anom.rawRow} />
        )}

        {/* ── Actions ── */}
        <div className="pt-0.5">

          {/* Pending → show decision buttons */}
          {anom.resolution === "pending" && (
            <div className="flex gap-2 flex-wrap items-center">

              {anom.anomalyType === "exact_duplicate" && (
                <>
                  <ActionBtn color="#10b981" onClick={() => handleResolve(anom.id, "user_approved")}>
                    Keep This Row
                  </ActionBtn>
                  <ActionBtn color="#ef4444" onClick={() => handleResolve(anom.id, "user_rejected")}>
                    Discard Duplicate
                  </ActionBtn>
                </>
              )}

              {anom.anomalyType === "conflicting_duplicate" && (
                <>
                  <ActionBtn color="#6366f1" onClick={() => handleResolve(anom.id, "user_approved")}>
                    Use Row {anom.rowNumber} — this data
                  </ActionBtn>
                  <ActionBtn color="#ef4444" onClick={() => handleResolve(anom.id, "user_rejected")}>
                    {conflictFirstRowNum ? `Skip this, keep Row ${conflictFirstRowNum}` : "Skip This Row"}
                  </ActionBtn>
                </>
              )}

              {anom.anomalyType === "settlement_candidate" && (
                <>
                  <ActionBtn color="#0ea5e9" onClick={() => handleResolve(anom.id, "user_approved")}>
                    Convert to Settlement
                  </ActionBtn>
                  {/* user_skipped_settlement: not "user_rejected", so row is NOT skipped —
                      the commit logic only creates a settlement for user_approved;
                      any other non-pending, non-rejected resolution falls through to expense creation. */}
                  <ActionBtn color="#94a3b8" outline onClick={() => handleResolve(anom.id, "user_skipped_settlement")}>
                    Import as Regular Expense
                  </ActionBtn>
                </>
              )}

              {anom.anomalyType === "ambiguous_date" && anom.editedValue?.dateOptions && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-slate-500">
                    Which interpretation is correct?
                  </span>
                  <div className="flex gap-2 flex-wrap">
                    {anom.editedValue.dateOptions.map((opt: any, idx: number) => (
                      <ActionBtn
                        key={idx}
                        color="#6366f1"
                        outline
                        onClick={() => handleResolve(anom.id, "user_approved", { date: opt.value })}
                      >
                        {opt.label}
                      </ActionBtn>
                    ))}
                  </div>
                </div>
              )}

              {anom.anomalyType === "invalid_percentage_sum" && (
                <>
                  <ActionBtn color="#6366f1" onClick={() => handleResolve(anom.id, "user_approved", { percentages: {} })}>
                    Auto-Equalize Splits to 100%
                  </ActionBtn>
                  <ActionBtn color="#94a3b8" outline onClick={() => handleResolve(anom.id, "user_rejected")}>
                    Skip This Row
                  </ActionBtn>
                </>
              )}

              {/* missing / unknown payer → map to an existing member (importing as-is would
                  silently drop the row, since an expense needs a real payer) */}
              {(anom.anomalyType === "missing_payer" || anom.anomalyType === "unknown_payer") && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-slate-500">Map this payer to an existing member:</span>
                  <div className="flex gap-2 flex-wrap items-center">
                    <select
                      value={payerMapSel[anom.id] ?? ""}
                      onChange={(e) => setPayerMapSel((p) => ({ ...p, [anom.id]: e.target.value }))}
                      className="bg-slate-950/60 border border-white/15 rounded-md px-2 py-1.5 text-sm text-slate-100"
                    >
                      <option value="">Select member…</option>
                      {members.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
                    </select>
                    <ActionBtn color="#10b981" disabled={!payerMapSel[anom.id]} onClick={() => handleMapPayer(anom.id, payerMapSel[anom.id])}>
                      Map &amp; Import
                    </ActionBtn>
                    <ActionBtn color="#94a3b8" outline onClick={() => handleResolve(anom.id, "user_rejected")}>
                      Skip This Row
                    </ActionBtn>
                  </div>
                </div>
              )}

              {/* non-member payer → add to group, import as a one-off payer, or skip */}
              {anom.anomalyType === "non_member_payer" && (
                <div className="flex gap-2 flex-wrap items-center">
                  <ActionBtn color="#6366f1" onClick={() => handleAddAsMember(anom.id)}>
                    Add as Member
                  </ActionBtn>
                  <ActionBtn color="#10b981" outline onClick={() => handleResolve(anom.id, "user_approved")}>
                    Import as One-off Payer
                  </ActionBtn>
                  <ActionBtn color="#94a3b8" outline onClick={() => handleResolve(anom.id, "user_rejected")}>
                    Skip This Row
                  </ActionBtn>
                </div>
              )}

              {/* malformed amount → type the correct value, or skip */}
              {anom.anomalyType === "malformed_amount" && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-slate-500">Enter the correct amount:</span>
                  <div className="flex gap-2 flex-wrap items-center">
                    <input
                      type="number" step="0.01" placeholder="0.00"
                      value={amountEdits[anom.id] ?? ""}
                      onChange={(e) => setAmountEdits((p) => ({ ...p, [anom.id]: e.target.value }))}
                      className="bg-slate-950/60 border border-white/15 rounded-md px-2 py-1.5 text-sm text-slate-100 w-32"
                    />
                    <ActionBtn color="#10b981" disabled={!isValidAmount(amountEdits[anom.id])} onClick={() => handleApplyAmount(anom, amountEdits[anom.id])}>
                      Apply &amp; Import
                    </ActionBtn>
                    <ActionBtn color="#94a3b8" outline onClick={() => handleResolve(anom.id, "user_rejected")}>
                      Skip This Row
                    </ActionBtn>
                  </div>
                </div>
              )}

              {/* zero amount → keep as zero, correct it manually, or skip */}
              {anom.anomalyType === "zero_amount" && (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2 flex-wrap items-center">
                    <ActionBtn color="#10b981" onClick={() => handleResolve(anom.id, "user_approved")}>
                      Import as Zero
                    </ActionBtn>
                    <ActionBtn color="#94a3b8" outline onClick={() => handleResolve(anom.id, "user_rejected")}>
                      Skip This Row
                    </ActionBtn>
                  </div>
                  <div className="flex gap-2 flex-wrap items-center">
                    <span className="text-xs text-slate-500">or set a corrected amount:</span>
                    <input
                      type="number" step="0.01" placeholder="0.00"
                      value={amountEdits[anom.id] ?? ""}
                      onChange={(e) => setAmountEdits((p) => ({ ...p, [anom.id]: e.target.value }))}
                      className="bg-slate-950/60 border border-white/15 rounded-md px-2 py-1.5 text-sm text-slate-100 w-32"
                    />
                    <ActionBtn color="#6366f1" outline disabled={!isValidAmount(amountEdits[anom.id])} onClick={() => handleApplyAmount(anom, amountEdits[anom.id])}>
                      Apply Correction
                    </ActionBtn>
                  </div>
                </div>
              )}

              {/* generic fallback: invalid_date, inactive_member_payer, etc. */}
              {!["exact_duplicate", "conflicting_duplicate", "settlement_candidate", "ambiguous_date", "invalid_percentage_sum", "missing_payer", "unknown_payer", "non_member_payer", "malformed_amount", "zero_amount"].includes(anom.anomalyType) && (
                <>
                  <ActionBtn color="#10b981" onClick={() => handleResolve(anom.id, "user_approved")}>
                    {anom.anomalyType === "inactive_member_payer" ? "Import Anyway" : "Import This Row"}
                  </ActionBtn>
                  <ActionBtn color="#94a3b8" outline onClick={() => handleResolve(anom.id, "user_rejected")}>
                    Skip This Row
                  </ActionBtn>
                </>
              )}
            </div>
          )}

          {/* Auto-fixed → show what was applied + override options */}
          {anom.resolution === "auto_fixed" && (
            <div className="flex flex-col gap-2">
              {(anom.anomalyType === "whitespace_amount" || anom.anomalyType === "sub_paisa_precision") && (
                <div className="flex gap-2 flex-wrap items-center">
                  <span className="text-xs text-slate-500">Prefer a different amount?</span>
                  <input
                    type="number" step="0.01" placeholder="override amount"
                    value={amountEdits[anom.id] ?? ""}
                    onChange={(e) => setAmountEdits((p) => ({ ...p, [anom.id]: e.target.value }))}
                    className="bg-slate-950/60 border border-white/15 rounded-md px-2 py-1.5 text-sm text-slate-100 w-36"
                  />
                  <ActionBtn color="#6366f1" outline disabled={!isValidAmount(amountEdits[anom.id])} onClick={() => handleApplyAmount(anom, amountEdits[anom.id])}>
                    Use This Value Instead
                  </ActionBtn>
                </div>
              )}
              <div className="flex gap-2 flex-wrap items-center">
                {anom.anomalyType === "visitor_payer" && (
                  <ActionBtn color="#6366f1" outline onClick={() => handleAddAsMember(anom.id)}>
                    Add as Member Instead
                  </ActionBtn>
                )}
                <ActionBtn color="#64748b" outline onClick={() => handleSkipAutoFixed(anom.id)}>
                  Override: Skip This Row Instead
                </ActionBtn>
              </div>
            </div>
          )}

          {/* Skipped → show undo */}
          {anom.resolution === "user_rejected" && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-slate-500">
                This row <strong className="text-slate-400">will not</strong> be imported.
              </span>
              <ActionBtn color="#f59e0b" outline onClick={() => handleUndoSkip(anom.id)}>
                Undo — Reconsider
              </ActionBtn>
            </div>
          )}

          {/* Approved → show context + undo */}
          {anom.resolution === "user_approved" && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-emerald-400">
                ✓{" "}
                {anom.editedValue?.mapToUserId ? `Payer mapped to ${memberName(anom.editedValue.mapToUserId)}; row will be imported.`
                 : anom.editedValue?.addAsMember ? "Payer will be added to the group as a member; row will be imported."
                 : anom.editedValue?.amount != null ? `Amount set to ${formatCurrency(anom.editedValue.amount, anom.rawRow?.currency?.trim().toUpperCase() || "INR")}; row will be imported.`
                 : anom.anomalyType === "settlement_candidate" ? "Will be converted to a settlement."
                 : anom.anomalyType === "conflicting_duplicate" ? `Row ${anom.rowNumber} data will be used.`
                 : anom.anomalyType === "exact_duplicate" ? "Row will be kept."
                 : "Row will be imported."}
              </span>
              <ActionBtn color="#64748b" outline onClick={() => handleResolve(anom.id, "pending")}>
                Change Decision
              </ActionBtn>
            </div>
          )}

          {/* user_skipped_settlement (import as expense) → show undo */}
          {anom.resolution === "user_skipped_settlement" && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-sky-400">
                ✓ Will be imported as a regular expense (not a settlement).
              </span>
              <ActionBtn color="#64748b" outline onClick={() => handleResolve(anom.id, "pending")}>
                Change Decision
              </ActionBtn>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Clubbed card for repeated anomalies ───────────────────────────────────────
  function renderClubbedCard(group: Anomaly[]) {
    const rep = group[0];
    const cfg = getAnomalyConfig(rep.anomalyType);
    const ids = group.map((a) => a.id);
    const groupKey = ids.join(",");

    // Resolution summary
    const pendingIds    = group.filter((a) => a.resolution === "pending").map((a) => a.id);
    const autoFixedIds  = group.filter((a) => a.resolution === "auto_fixed").map((a) => a.id);
    const approvedIds   = group.filter((a) => a.resolution === "user_approved").map((a) => a.id);
    const rejectedIds   = group.filter((a) => a.resolution === "user_rejected").map((a) => a.id);
    const uniformRes    = new Set(group.map((a) => a.resolution)).size === 1 ? rep.resolution : "mixed";

    const borderColor =
      uniformRes === "pending"         ? cfg.color
      : uniformRes === "auto_fixed"    ? "rgba(129,140,248,0.3)"
      : uniformRes === "user_approved" ? "rgba(16,185,129,0.3)"
      : uniformRes === "mixed"         ? "rgba(99,102,241,0.35)"
      : "rgba(100,116,139,0.18)";

    // Row numbers label: show first 5, then "+N more"
    const rowNums = group.map((a) => a.rowNumber).sort((a, b) => a - b);
    const rowLabel =
      rowNums.length <= 5
        ? `Rows ${rowNums.join(", ")}`
        : `Rows ${rowNums.slice(0, 5).join(", ")} +${rowNums.length - 5} more`;

    return (
      <div
        key={ids.join(",")}
        style={{ borderColor }}
        className="bg-slate-950/55 border rounded-[10px] p-5 flex flex-col gap-3.5 transition-colors duration-200"
      >
        {/* ── Header ── */}
        <div className="flex justify-between items-start gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-slate-950/80 border border-white/9 px-2 py-0.5 rounded text-[0.68rem] text-slate-500 font-mono font-bold tracking-wide">
              {rowLabel}
            </span>
            <span
              className="px-2 py-0.5 rounded-full text-[0.7rem] font-bold tracking-wide"
              style={{ background: cfg.bg, color: cfg.color }}
            >
              {cfg.label.toUpperCase()}
            </span>
            <span className="bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full text-[0.7rem] font-bold tracking-wide">
              {group.length} INSTANCES
            </span>
          </div>
          {uniformRes !== "mixed" ? (
            <StatusBadge resolution={uniformRes} />
          ) : (
            <span className="text-xs text-slate-500 flex gap-1.5 flex-wrap">
              {pendingIds.length > 0   && <span className="text-amber-400 font-semibold">{pendingIds.length} pending</span>}
              {autoFixedIds.length > 0 && <span className="text-indigo-400 font-semibold">{autoFixedIds.length} auto-fixed</span>}
              {approvedIds.length > 0  && <span className="text-emerald-400 font-semibold">{approvedIds.length} approved</span>}
              {rejectedIds.length > 0  && <span className="text-slate-400 font-semibold">{rejectedIds.length} will skip</span>}
            </span>
          )}
        </div>

        {/* ── Description (once) ── */}
        <p className="text-sm text-slate-400 leading-relaxed m-0">
          {rep.description}
        </p>

        {/* ── Auto-fix note ── */}
        {uniformRes === "auto_fixed" && rep.resolutionNotes && (
          <div className="bg-indigo-500/[0.07] border border-indigo-500/20 rounded-md px-3 py-2 text-sm text-indigo-300 flex gap-2 items-baseline">
            <span className="text-slate-500 shrink-0">Auto-fix applied to all:</span>
            <span className="font-bold">{rep.resolutionNotes}</span>
          </div>
        )}

        {/* ── Bulk actions ── */}
        <div className="pt-0.5 flex flex-col gap-2.5">

          {/* Pending bulk actions */}
          {pendingIds.length > 0 && (
            <div className="flex gap-2 flex-wrap items-center">
              {pendingIds.length < group.length && (
                <span className="text-xs text-slate-500 mr-1">
                  {pendingIds.length} pending:
                </span>
              )}
              {rep.anomalyType === "exact_duplicate" && (
                <>
                  <ActionBtn color="#10b981" onClick={() => handleResolveMany(pendingIds, "user_approved")}>
                    Keep All {pendingIds.length} Rows
                  </ActionBtn>
                  <ActionBtn color="#ef4444" onClick={() => handleResolveMany(pendingIds, "user_rejected")}>
                    Discard All {pendingIds.length} Duplicates
                  </ActionBtn>
                </>
              )}
              {rep.anomalyType === "settlement_candidate" && (
                <>
                  <ActionBtn color="#0ea5e9" onClick={() => handleResolveMany(pendingIds, "user_approved")}>
                    Convert All {pendingIds.length} to Settlements
                  </ActionBtn>
                  <ActionBtn color="#94a3b8" outline onClick={() => handleResolveMany(pendingIds, "user_skipped_settlement")}>
                    Import All {pendingIds.length} as Expenses
                  </ActionBtn>
                </>
              )}
              {rep.anomalyType === "invalid_percentage_sum" && (
                <>
                  <ActionBtn color="#6366f1" onClick={() => handleResolveMany(pendingIds, "user_approved", { percentages: {} })}>
                    Auto-Equalize All {pendingIds.length} Splits
                  </ActionBtn>
                  <ActionBtn color="#94a3b8" outline onClick={() => handleResolveMany(pendingIds, "user_rejected")}>
                    Skip All {pendingIds.length}
                  </ActionBtn>
                </>
              )}
              {/* ambiguous dates that share the same value → apply one reading to all */}
              {rep.anomalyType === "ambiguous_date" && rep.editedValue?.dateOptions && (
                <>
                  {rep.editedValue.dateOptions.map((opt: any, idx: number) => (
                    <ActionBtn key={idx} color="#6366f1" outline onClick={() => handleResolveMany(pendingIds, "user_approved", { ...rep.editedValue, date: opt.value })}>
                      All → {opt.label}
                    </ActionBtn>
                  ))}
                  <ActionBtn color="#94a3b8" outline onClick={() => handleResolveMany(pendingIds, "user_rejected")}>
                    Skip All {pendingIds.length}
                  </ActionBtn>
                </>
              )}
              {/* missing / unknown payer → map all to one member */}
              {(rep.anomalyType === "missing_payer" || rep.anomalyType === "unknown_payer") && (
                <div className="flex flex-col gap-1.5 w-full">
                  <span className="text-xs text-slate-500">Map all {pendingIds.length} to one member:</span>
                  <div className="flex gap-2 flex-wrap items-center">
                    <select
                      value={payerMapSel[groupKey] ?? ""}
                      onChange={(e) => setPayerMapSel((p) => ({ ...p, [groupKey]: e.target.value }))}
                      className="bg-slate-950/60 border border-white/15 rounded-md px-2 py-1.5 text-sm text-slate-100"
                    >
                      <option value="">Select member…</option>
                      {members.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
                    </select>
                    <ActionBtn color="#10b981" disabled={!payerMapSel[groupKey]} onClick={() => handleMapPayerMany(pendingIds, payerMapSel[groupKey])}>
                      Map All {pendingIds.length} &amp; Import
                    </ActionBtn>
                    <ActionBtn color="#94a3b8" outline onClick={() => handleResolveMany(pendingIds, "user_rejected")}>
                      Skip All {pendingIds.length}
                    </ActionBtn>
                  </div>
                </div>
              )}
              {/* non-member payers → add all as members, import all as one-off, or skip */}
              {rep.anomalyType === "non_member_payer" && (
                <>
                  <ActionBtn color="#6366f1" onClick={() => handleAddAsMemberMany(pendingIds)}>
                    Add All {pendingIds.length} as Members
                  </ActionBtn>
                  <ActionBtn color="#10b981" outline onClick={() => handleResolveMany(pendingIds, "user_approved")}>
                    Import All as One-off
                  </ActionBtn>
                  <ActionBtn color="#94a3b8" outline onClick={() => handleResolveMany(pendingIds, "user_rejected")}>
                    Skip All {pendingIds.length}
                  </ActionBtn>
                </>
              )}
              {/* malformed amounts (same bad value) → apply one correction to all */}
              {rep.anomalyType === "malformed_amount" && (
                <div className="flex flex-col gap-1.5 w-full">
                  <span className="text-xs text-slate-500">Apply one corrected amount to all {pendingIds.length}:</span>
                  <div className="flex gap-2 flex-wrap items-center">
                    <input
                      type="number" step="0.01" placeholder="0.00"
                      value={amountEdits[groupKey] ?? ""}
                      onChange={(e) => setAmountEdits((p) => ({ ...p, [groupKey]: e.target.value }))}
                      className="bg-slate-950/60 border border-white/15 rounded-md px-2 py-1.5 text-sm text-slate-100 w-32"
                    />
                    <ActionBtn color="#10b981" disabled={!isValidAmount(amountEdits[groupKey])} onClick={() => handleApplyAmountMany(group.filter((a) => a.resolution === "pending"), amountEdits[groupKey])}>
                      Apply to All {pendingIds.length}
                    </ActionBtn>
                    <ActionBtn color="#94a3b8" outline onClick={() => handleResolveMany(pendingIds, "user_rejected")}>
                      Skip All {pendingIds.length}
                    </ActionBtn>
                  </div>
                </div>
              )}
              {/* generic fallback: invalid_date, inactive_member_payer, zero_amount, etc. */}
              {!["exact_duplicate", "conflicting_duplicate", "settlement_candidate", "ambiguous_date", "invalid_percentage_sum", "missing_payer", "unknown_payer", "non_member_payer", "malformed_amount"].includes(rep.anomalyType) && (
                <>
                  <ActionBtn color="#10b981" onClick={() => handleResolveMany(pendingIds, "user_approved")}>
                    {rep.anomalyType === "zero_amount" ? `Import All ${pendingIds.length} as Zero`
                     : rep.anomalyType === "inactive_member_payer" ? `Import All ${pendingIds.length} Anyway`
                     : `Import All ${pendingIds.length} Rows`}
                  </ActionBtn>
                  <ActionBtn color="#94a3b8" outline onClick={() => handleResolveMany(pendingIds, "user_rejected")}>
                    Skip All {pendingIds.length}
                  </ActionBtn>
                </>
              )}
            </div>
          )}

          {/* Auto-fixed bulk override */}
          {uniformRes === "auto_fixed" && (
            <div className="flex gap-2 flex-wrap items-center">
              {rep.anomalyType === "visitor_payer" && (
                <ActionBtn color="#6366f1" outline onClick={() => handleAddAsMemberMany(ids)}>
                  Add All {group.length} as Members Instead
                </ActionBtn>
              )}
              <ActionBtn color="#64748b" outline onClick={() => handleSkipAutoFixedMany(ids)}>
                Override: Skip All {group.length} Instead
              </ActionBtn>
            </div>
          )}

          {/* Rejected bulk undo */}
          {uniformRes === "user_rejected" && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-slate-500">
                All {group.length} rows <strong className="text-slate-400">will not</strong> be imported.
              </span>
              <ActionBtn color="#f59e0b" outline onClick={() => handleUndoSkipMany(ids)}>
                Undo All — Reconsider
              </ActionBtn>
            </div>
          )}

          {/* Approved bulk undo */}
          {uniformRes === "user_approved" && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-emerald-400">
                ✓ All {group.length} rows will be imported.
              </span>
              <ActionBtn color="#64748b" outline onClick={() => handleResolveMany(ids, "pending")}>
                Change Decision for All
              </ActionBtn>
            </div>
          )}

          {/* user_skipped_settlement bulk */}
          {uniformRes === "user_skipped_settlement" && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-sky-400">
                ✓ All {group.length} will be imported as regular expenses.
              </span>
              <ActionBtn color="#64748b" outline onClick={() => handleResolveMany(ids, "pending")}>
                Change Decision for All
              </ActionBtn>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Group anomalies by type + description for clubbing ─────────────────────────
  function buildDisplayGroups(anomalies: Anomaly[]): Array<Anomaly[]> {
    const map = new Map<string, Anomaly[]>();
    for (const a of anomalies) {
      const key = `${a.anomalyType}|||${a.description}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return Array.from(map.values());
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="mt-8 flex flex-col gap-5">
      {/* Section title */}
      <div>
        <h2 className="text-2xl font-bold text-slate-100 mb-1">Import CSV Expenses</h2>
        <p className="text-slate-400 text-sm max-w-[60ch]">
          Upload your flat's raw CSV export. The pipeline detects conflicts, duplicates, currency mismatches, and split errors — surfacing each one for your review before anything is committed.
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-500/12 border border-red-500/40 text-red-300 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-500/12 border border-emerald-500/40 text-emerald-300 px-4 py-3 rounded-lg text-sm">
          {successMsg}
        </div>
      )}

      {!session ? (
        /* ── Upload form ── */
        <div className="glass-card">
          <form onSubmit={handleUpload} className="flex gap-4 items-center flex-wrap">
            <label className={`flex items-center gap-2.5 bg-slate-950/60 border-dashed rounded-lg px-4 py-2.5 cursor-pointer text-sm transition-colors ${
              file
                ? "border border-indigo-500/50 text-slate-100"
                : "border border-white/15 text-slate-500"
            }`}>
              <span>📂</span>
              <span>{file ? file.name : "Choose CSV file…"}</span>
              <input type="file" accept=".csv" onChange={handleFileChange} required className="hidden" />
            </label>
            <Button
              type="submit"
              disabled={loading || !file}
              className={`font-bold ${
                file
                  ? "bg-sky-500 hover:bg-sky-600 text-white border-transparent"
                  : "bg-sky-500/15 text-slate-400 border-transparent"
              }`}
            >
              {loading ? "Parsing…" : "Start Import"}
            </Button>
          </form>
        </div>
      ) : (
        /* ── Review session ── */
        <div className="flex flex-col gap-5">

          {/* Session header card */}
          <div className="glass-card p-5">
            <div className="flex justify-between items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2.5 mb-3 flex-wrap">
                  <span className="text-base font-bold text-slate-100">{session.filename}</span>
                  <span className="text-[0.72rem] text-slate-500 bg-black/25 px-2 py-0.5 rounded font-mono">
                    {session.anomalies.length} anomalies
                  </span>
                </div>
                <div className="flex gap-5 flex-wrap">
                  {pendingCount > 0 ? (
                    <span className="text-sm">
                      <strong className="text-amber-400">{pendingCount}</strong>
                      <span className="text-slate-500 ml-1">need your decision</span>
                    </span>
                  ) : (
                    <span className="text-sm text-emerald-400">✓ All decisions made</span>
                  )}
                  <span className="text-sm">
                    <strong className="text-indigo-400">{autoFixedCount}</strong>
                    <span className="text-slate-500 ml-1">auto-fixed</span>
                  </span>
                  {approvedCount > 0 && (
                    <span className="text-sm">
                      <strong className="text-emerald-400">{approvedCount}</strong>
                      <span className="text-slate-500 ml-1">approved</span>
                    </span>
                  )}
                  {skippedCount > 0 && (
                    <span className="text-sm">
                      <strong className="text-slate-400">{skippedCount}</strong>
                      <span className="text-slate-500 ml-1">marked to skip</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2 shrink-0">
                <Button
                  variant="outline"
                  onClick={() => { setSession(null); setFile(null); setAutoFixedSkipped(new Set()); setError(""); }}
                  disabled={loading}
                  className="border-red-500/40 text-red-400 hover:bg-red-500/10 whitespace-nowrap"
                >
                  Abort Import
                </Button>
                <Button
                  onClick={handleCommit}
                  disabled={pendingCount > 0 || loading}
                  className={`whitespace-nowrap font-bold ${
                    pendingCount === 0
                      ? "bg-emerald-500 hover:bg-emerald-600 text-white border-transparent"
                      : "bg-emerald-500/10 text-slate-500 border border-emerald-500/20"
                  }`}
                >
                  {loading ? "Committing…"
                   : pendingCount > 0 ? `${pendingCount} decision${pendingCount === 1 ? "" : "s"} remaining`
                   : "Commit Import ✓"}
                </Button>
              </div>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 bg-black/20 rounded-lg p-1 w-fit">
            {([
              { key: "all",        label: `All (${session.anomalies.length})` },
              { key: "pending",    label: `Needs Decision (${pendingCount})` },
              { key: "auto_fixed", label: `Auto-fixed (${autoFixedCount})` },
              { key: "resolved",   label: `Resolved (${resolvedUserCount})` },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveFilter(key)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors border-b-2 cursor-pointer ${
                  activeFilter === key
                    ? "text-indigo-400 border-indigo-500 font-semibold"
                    : "text-slate-500 border-transparent hover:text-slate-300 font-medium"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Bulk ambiguous-date policy — apply one DD/MM vs MM/DD reading to every ambiguous date */}
          {ambiguousDatePending.length >= 2 && (
            <div className="glass-card p-4 border border-amber-500/30 flex items-center gap-3 flex-wrap">
              <span className="text-sm text-amber-300 font-semibold">{ambiguousDatePending.length} ambiguous dates</span>
              <span className="text-sm text-slate-400">— apply one interpretation to all:</span>
              <ActionBtn color="#6366f1" outline onClick={() => handleBulkAmbiguousDate(0)}>
                Treat all as DD/MM/YYYY
              </ActionBtn>
              <ActionBtn color="#6366f1" outline onClick={() => handleBulkAmbiguousDate(1)}>
                Treat all as MM/DD/YYYY
              </ActionBtn>
            </div>
          )}

          {/* Anomaly list */}
          <div className="flex flex-col gap-3">
            {filteredAnomalies.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-sm">
                {activeFilter === "pending"
                  ? "No pending decisions — ready to commit!"
                  : "No anomalies in this category."}
              </div>
            ) : (
              buildDisplayGroups(filteredAnomalies).map((group) =>
                group.length === 1 ? renderCard(group[0]) : renderClubbedCard(group)
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
