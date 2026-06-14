import { API_URL } from "@/lib/api";
import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import ImportPanel from "../components/ImportPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CURRENCIES = [
  { code: "INR", symbol: "₹",   label: "INR ₹",    locale: "en-IN", decimals: 2 },
  { code: "USD", symbol: "$",   label: "USD $",    locale: "en-US", decimals: 2 },
  { code: "EUR", symbol: "€",   label: "EUR €",    locale: "en-US", decimals: 2 },
  { code: "JPY", symbol: "¥",   label: "JPY ¥",    locale: "ja-JP", decimals: 0 },
  { code: "GBP", symbol: "£",   label: "GBP £",    locale: "en-GB", decimals: 2 },
  { code: "CNY", symbol: "¥",   label: "CNY ¥",    locale: "zh-CN", decimals: 2 },
  { code: "CAD", symbol: "CA$", label: "CAD CA$",  locale: "en-CA", decimals: 2 },
  { code: "AUD", symbol: "A$",  label: "AUD A$",   locale: "en-AU", decimals: 2 },
  { code: "CHF", symbol: "CHF", label: "CHF",      locale: "de-CH", decimals: 2 },
  { code: "HKD", symbol: "HK$", label: "HKD HK$",  locale: "zh-HK", decimals: 2 },
  { code: "SGD", symbol: "S$",  label: "SGD S$",   locale: "en-SG", decimals: 2 },
] as const;

const CURRENCY_MAP = Object.fromEntries(CURRENCIES.map((c) => [c.code, c]));

function fmtCurrency(amount: string | number, currency = "INR"): string {
  const num = parseFloat(String(amount).replace(/,/g, ""));
  if (isNaN(num)) return String(amount);
  const cfg = CURRENCY_MAP[currency] ?? CURRENCY_MAP["INR"];
  return `${cfg.symbol}${num.toLocaleString(cfg.locale, { minimumFractionDigits: cfg.decimals, maximumFractionDigits: cfg.decimals })}`;
}

function fmtDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

interface Member {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  leftAt: string | null;
}

interface Expense {
  id: string;
  description: string;
  amountOriginal: string;
  amountOriginalCurrency: string;
  convertedAmountInr: string;
  date: string;
  splitType: string;
  notes: string | null;
  paidBy: { name: string };
  splits: { user?: { name: string }; guest?: { name: string }; owedAmount: string }[];
}

interface Suggestion {

  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  amount: number;
}

interface UserBreakdown {
  paidExpenses: any[];
  owedSplits: any[];
  sentSettlements: any[];
  receivedSettlements: any[];
}

const todayStr = () => new Date().toISOString().split("T")[0];

export default function GroupDetails() {
  const { id } = useParams<{ id: string }>();
  const [group, setGroup] = useState<any>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const [balances, setBalances] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [asOfDate, setAsOfDate] = useState(todayStr);
  const [selectedDrilldownUser, setSelectedDrilldownUser] = useState<string | null>(null);
  const [drilldownData, setDrilldownData] = useState<UserBreakdown | null>(null);

  // Forms
  const [memberEmail, setMemberEmail] = useState("");
  const [memberJoinDate, setMemberJoinDate] = useState(todayStr);

  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [splitType, setSplitType] = useState("equal");
  const [splitDetails, setSplitDetails] = useState<Record<string, string>>({}); // userId -> amount/pct/weight string
  const [paidBy, setPaidBy] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayStr);

  // Transiently highlighted expense — set when a cross-import-duplicate card in the
  // ImportPanel asks to point at its matching ledger entry. Cleared after a short delay.
  const [highlightedExpenseId, setHighlightedExpenseId] = useState<string | null>(null);

  // Edit expense state
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Modal visibility
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);

  // Settlement Form
  const [setFrom, setSetFrom] = useState("");
  const [setTo, setSetTo] = useState("");
  const [setAmountVal, setSetAmountVal] = useState("");
  const [setDateVal, setSetDateVal] = useState(todayStr);
  const [settlementCurrency, setSettlementCurrency] = useState("INR");

  // FX rates (INR-based, keyed by currency code)
  const [fxRates, setFxRates] = useState<Record<string, number>>({});

  const [error, setError] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});


  const loadAll = async () => {
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };

      // Fetch group details
      const groupRes = await fetch(`${API_URL}/groups/${id}`, { headers });
      const groupData = await groupRes.json();
      setGroup(groupData);

      // Fetch expenses
      const expRes = await fetch(`${API_URL}/expenses/group/${id}`, { headers });
      setExpenses(await expRes.json());

      // Fetch settlements
      const setRes = await fetch(`${API_URL}/settlements/group/${id}`, { headers });
      const setData = await setRes.json();
      // Keep state if needed or log
      if (setData) {
        // Log or save
      }


      // Fetch balances
      const balUrl = asOfDate
        ? `${API_URL}/balances/group/${id}?asOfDate=${asOfDate}`
        : `${API_URL}/balances/group/${id}`;
      const balRes = await fetch(balUrl, { headers });
      const balData = await balRes.json();
      setBalances(balData.balances || []);
      setSuggestions(balData.suggestions || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadAll();
  }, [id, asOfDate]);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const fetched = localStorage.getItem("fx_rates_fetched");
    const cacheKey = `fx_rates_${today}`;
    if (fetched === today) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try { setFxRates(JSON.parse(cached)); } catch {}
        return;
      }
    }
    fetch(`${API_URL}/fx-rates`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.rates) {
          setFxRates(data.rates);
          localStorage.setItem(cacheKey, JSON.stringify(data.rates));
          localStorage.setItem("fx_rates_fetched", today);
        }
      })
      .catch(() => {});
  }, []);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/groups/${id}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ email: memberEmail, joinedAt: memberJoinDate }),
      });
      if (!res.ok) throw new Error("Failed to add member");
      setMemberEmail("");
      setMemberJoinDate(todayStr());
      loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    // Only include members who were active on the selected expense date
    const selectedDate = expenseDate ? new Date(expenseDate) : null;
    const activeMembers = group.members.filter((m: Member) => {
      if (!selectedDate) return !m.leftAt;
      const joined = new Date(m.joinedAt);
      const left = m.leftAt ? new Date(m.leftAt) : null;
      return selectedDate >= joined && (!left || selectedDate <= left);
    });

    // Inline validation
    if (!desc.trim()) errors.desc = "Description is required.";
    const parsedAmt = parseFloat(amount);
    if (!amount || isNaN(parsedAmt) || parsedAmt === 0) errors.amount = "Enter a valid non-zero amount.";
    if (!paidBy) errors.paidBy = "Select who paid.";
    if (!expenseDate) errors.expenseDate = "Select an expense date.";

    if (splitType === "percentage") {
      const pctSum = Object.values(splitDetails).reduce((s, v) => s + parseFloat(v || "0"), 0);
      if (Math.abs(pctSum - 100) > 0.01) errors.splits = `Percentages must sum to 100% (currently ${pctSum.toFixed(1)}%).`;
    }
    if (splitType === "unequal" && amount) {
      const unequalSum = Object.values(splitDetails).reduce((s, v) => s + parseFloat(v || "0"), 0);
      if (Math.abs(unequalSum - parsedAmt) > 0.01) errors.splits = `Amounts must sum to ${parsedAmt.toFixed(2)} (currently ${unequalSum.toFixed(2)}).`;
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    // Build splits payload based on split type
    let splits: object[];
    if (splitType === "equal") {
      splits = activeMembers.map((m: Member) => ({ userId: m.id }));
    } else if (splitType === "unequal") {
      splits = activeMembers.map((m: Member) => ({
        userId: m.id,
        amount: parseFloat(splitDetails[m.id] || "0"),
      }));
    } else if (splitType === "percentage") {
      splits = activeMembers.map((m: Member) => ({
        userId: m.id,
        percentage: parseFloat(splitDetails[m.id] || "0"),
      }));
    } else {
      // share (weighted)
      splits = activeMembers.map((m: Member) => ({
        userId: m.id,
        weight: parseFloat(splitDetails[m.id] || "1"),
      }));
    }

    try {
      const res = await fetch(`${API_URL}/expenses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          groupId: id,
          paidByUserId: paidBy,
          description: desc,
          amountOriginal: parseFloat(amount),
          amountOriginalCurrency: currency,
          date: expenseDate,
          splitType,
          splits,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Failed to create expense");
      }
      setDesc("");
      setAmount("");
      setPaidBy("");
      setExpenseDate(todayStr());
      setSplitDetails({});
      setSplitType("equal");
      setShowExpenseModal(false);
      loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreateSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/settlements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          groupId: id,
          fromUserId: setFrom,
          toUserId: setTo,
          amount: parseFloat(setAmountVal),
          currency: settlementCurrency,
          date: setDateVal,
        }),
      });
      if (!res.ok) throw new Error("Failed to record settlement");
      setSetFrom("");
      setSetTo("");
      setSetAmountVal("");
      setSetDateVal(todayStr());
      setSettlementCurrency("INR");
      setShowSettlementModal(false);
      loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleFetchDrilldown = async (userId: string) => {
    setSelectedDrilldownUser(userId);
    try {
      const balUrl = asOfDate
        ? `${API_URL}/balances/group/${id}/user/${userId}?asOfDate=${asOfDate}`
        : `${API_URL}/balances/group/${id}/user/${userId}`;
      const res = await fetch(balUrl, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();
      setDrilldownData(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteExpense = async (expenseId: string, description: string) => {
    if (!window.confirm(`Delete "${description}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_URL}/expenses/${expenseId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to delete expense");
      loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEditExpense = async (expenseId: string) => {
    try {
      const res = await fetch(`${API_URL}/expenses/${expenseId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          description: editDesc || undefined,
          amountOriginal: editAmount ? parseFloat(editAmount) : undefined,
          notes: editNotes || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Failed to update expense");
      }
      setEditingExpenseId(null);
      loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const markMemberLeft = async (memberId: string) => {
    const leftDate = prompt("Enter exit date (YYYY-MM-DD):");
    if (!leftDate) return;

    try {
      const res = await fetch(`${API_URL}/groups/${id}/members/${memberId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ leftAt: leftDate }),
      });
      if (!res.ok) throw new Error("Failed to set leave date");
      loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Scroll the matching ledger entry into view and flash a highlight on it.
  const handleJumpToExpense = (expenseId: string) => {
    const el = document.getElementById(`expense-${expenseId}`);
    if (!el) {
      setError("That expense is no longer in the ledger.");
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedExpenseId(expenseId);
    window.setTimeout(
      () => setHighlightedExpenseId((cur) => (cur === expenseId ? null : cur)),
      2500,
    );
  };

  if (!group) return <div className="max-w-6xl mx-auto px-4 py-8"><p className="text-slate-400">Loading...</p></div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 animate-fade-in flex flex-col gap-8">
      {/* Group Header */}
      <div className="flex justify-between items-center">
        <div>
          <Link to="/" className="text-sm text-slate-400 hover:text-indigo-400 transition-colors">&larr; Back to Dashboard</Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-100">{group.name}</h1>
        </div>
        <div className="flex gap-2 items-center">
          <label className="text-sm text-slate-400">View As of Date:</label>
          <Input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="w-auto bg-slate-800/70 border-white/8 text-white"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/40 text-red-400 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Grid of details */}
      <div className="grid grid-cols-[2fr_1fr] gap-8">

        {/* Left column: Members & Expenses */}
        <div className="flex flex-col gap-6">

          {/* Members List */}
          <div className="glass-card">
            <h3 className="text-slate-100 font-semibold mb-4">Group Members</h3>
            <div className="flex flex-col gap-2">
              {group.members.map((m: Member) => (
                <div key={m.id} className="flex justify-between items-center p-2 rounded-md bg-white/2">
                  <div>
                    <strong className="text-slate-100">{m.name}</strong>
                    <span className="text-xs text-slate-500 ml-2">({m.email})</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {m.leftAt ? (
                      <span className="text-red-400">Left {new Date(m.leftAt).toLocaleDateString()}</span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-amber-400 hover:text-amber-300"
                        onClick={() => markMemberLeft(m.id)}
                      >
                        Mark Left
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add Member form */}
            <form onSubmit={handleAddMember} className="flex gap-2 mt-4 items-end">
              <div className="flex flex-col gap-1 flex-1">
                <label htmlFor="member-email" className="text-xs text-slate-400 font-medium">Email</label>
                <Input
                  id="member-email"
                  type="email"
                  placeholder="user@example.com"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  required
                  className="bg-black/20 border-white/8 text-white"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="member-join-date" className="text-xs text-slate-400 font-medium">Join Date</label>
                <Input
                  id="member-join-date"
                  type="date"
                  value={memberJoinDate}
                  onChange={(e) => setMemberJoinDate(e.target.value)}
                  required
                  className="w-auto bg-black/20 border-white/8 text-white"
                />
              </div>
              <Button type="submit" size="sm">Add Member</Button>
            </form>
          </div>

          {/* Expenses list */}
          <div className="glass-card">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-slate-100 font-semibold">Expenses</h3>
              <Button
                variant="outline"
                size="sm"
                className="border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/15"
                onClick={() => setShowExpenseModal(true)}
              >
                + Add Expense
              </Button>
            </div>
            <div className="flex flex-col">
              {expenses.length === 0 ? (
                <p className="text-slate-500 text-sm">No expenses recorded yet.</p>
              ) : (
                expenses.map((e) => (
                  <div
                    key={e.id}
                    id={`expense-${e.id}`}
                    className={`py-4 border-b border-white/8 last:border-0 transition-all duration-500 ${
                      highlightedExpenseId === e.id
                        ? "bg-indigo-500/10 ring-2 ring-indigo-500/60 rounded-lg -mx-2 px-2"
                        : ""
                    }`}
                  >

                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <strong className="text-[0.95rem] block mb-1 text-slate-100">{e.description}</strong>
                        <div className="text-[0.82rem] text-slate-400">
                          Paid by{" "}
                          <span className="text-slate-100 font-semibold">{e.paidBy?.name}</span>
                          {" · "}
                          {fmtDate(e.date)}
                          {" · "}
                          <span className="capitalize text-slate-500">{e.splitType} split</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className={`text-[1.05rem] font-bold ${e.amountOriginalCurrency !== "INR" ? "text-sky-400" : "text-slate-100"}`}>
                          {fmtCurrency(e.amountOriginal, e.amountOriginalCurrency)}
                        </span>
                        {e.amountOriginalCurrency !== "INR" && (
                          <span className="text-[0.76rem] text-slate-500">
                            ≈ {fmtCurrency(e.convertedAmountInr)} INR
                          </span>
                        )}
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/15"
                            onClick={() => {
                              setEditingExpenseId(e.id);
                              setEditDesc(e.description);
                              setEditAmount(String(e.amountOriginal));
                              setEditNotes(e.notes || "");
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                            onClick={() => handleDeleteExpense(e.id, e.description)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Splits breakdown */}
                    <div className="mt-1.5 pl-3 pt-2 pb-1 border-l-2 border-white/8 flex flex-wrap gap-1.5">
                      {e.splits.map((s: any, idx: number) => (
                        <span key={idx} className="split-chip">
                          {s.user?.name || s.guest?.name}
                          <span className="opacity-60 mx-0.5">·</span>
                          {fmtCurrency(s.owedAmount)}
                        </span>
                      ))}
                    </div>

                    {/* Inline edit form */}
                    {editingExpenseId === e.id && (
                      <div className="mt-3 p-3 bg-indigo-500/6 border border-indigo-500/25 rounded-md flex flex-col gap-2">
                        <span className="text-[0.72rem] text-slate-500 uppercase tracking-wide font-bold">Edit Expense</span>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-slate-400 font-medium">Description</label>
                          <Input
                            type="text"
                            value={editDesc}
                            onChange={(ev) => setEditDesc(ev.target.value)}
                            className="bg-black/20 border-white/8 text-white"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-slate-400 font-medium">Amount</label>
                          <Input
                            type="number"
                            value={editAmount}
                            onChange={(ev) => setEditAmount(ev.target.value)}
                            step="0.01"
                            className="bg-black/20 border-white/8 text-white"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-slate-400 font-medium">Notes <span className="text-slate-600">(optional)</span></label>
                          <Input
                            type="text"
                            value={editNotes}
                            onChange={(ev) => setEditNotes(ev.target.value)}
                            className="bg-black/20 border-white/8 text-white"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleEditExpense(e.id)}>Save</Button>
                          <Button variant="outline" size="sm" onClick={() => setEditingExpenseId(null)}>Cancel</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Right column: Balances & Calculations */}
        <div className="flex flex-col gap-6">

          {/* Net Balances */}
          <div className="glass-card">
            <h3 className="text-slate-100 font-semibold mb-4">Net Balances</h3>
            <div className="flex flex-col gap-3">
              {balances.map((b) => (
                <div
                  key={b.userId}
                  onClick={() => handleFetchDrilldown(b.userId)}
                  className={`flex justify-between items-center p-3 rounded-md cursor-pointer border transition-colors ${
                    selectedDrilldownUser === b.userId
                      ? "bg-indigo-500/15 border-indigo-500"
                      : "bg-white/2 border-transparent hover:bg-white/4"
                  }`}
                >
                  <span className="text-slate-100">{b.name}</span>
                  <strong className={`font-bold ${b.netBalance > 0 ? "text-emerald-400" : b.netBalance < 0 ? "text-red-400" : "text-slate-400"}`}>
                    {b.netBalance > 0
                      ? `+${fmtCurrency(b.netBalance)}`
                      : b.netBalance < 0
                      ? `−${fmtCurrency(Math.abs(b.netBalance))}`
                      : fmtCurrency(0)
                    }
                  </strong>
                </div>
              ))}
            </div>
          </div>

          {/* Settlement Suggestions */}
          <div className="glass-card">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-slate-100 font-semibold">Settlement Suggestions</h3>
              <Button
                variant="outline"
                size="sm"
                className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15"
                onClick={() => setShowSettlementModal(true)}
              >
                Record Payment
              </Button>
            </div>
            <div className="flex flex-col gap-3">
              {suggestions.length === 0 ? (
                <p className="text-emerald-400 text-sm">Everyone is settled up!</p>
              ) : (
                suggestions.map((s, idx) => (
                  <div key={idx} className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-md text-sm">
                    <span className="text-slate-100"><strong>{s.fromUserName}</strong> pays <strong>{s.toUserName}</strong></span>
                    <div className="text-[1.05rem] font-bold text-emerald-400 mt-1">
                      {fmtCurrency(s.amount)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

      {/* ── Modals ── */}

      <Dialog open={showSettlementModal} onOpenChange={setShowSettlementModal}>
        <DialogContent className="bg-slate-900 border-white/8 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Record Payment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSettlement} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 font-medium">Paid by</label>
              <Select value={setFrom} onValueChange={setSetFrom} required>
                <SelectTrigger className="bg-black/20 border-white/8 text-slate-100">
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/8">
                  {group.members.map((m: any) => (
                    <SelectItem key={m.id} value={m.id} className="text-slate-100">{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 font-medium">Received by</label>
              <Select value={setTo} onValueChange={setSetTo} required>
                <SelectTrigger className="bg-black/20 border-white/8 text-slate-100">
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/8">
                  {group.members.map((m: any) => (
                    <SelectItem key={m.id} value={m.id} className="text-slate-100">{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 font-medium">Amount</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={setAmountVal}
                  onChange={(e) => setSetAmountVal(e.target.value)}
                  required
                  className="flex-1 bg-black/20 border-white/8 text-white"
                />
                <Select value={settlementCurrency} onValueChange={setSettlementCurrency}>
                  <SelectTrigger className="w-32 bg-black/20 border-white/8 text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/8">
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code} className="text-slate-100">{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 font-medium">Date</label>
              <Input
                type="date"
                value={setDateVal}
                onChange={(e) => setSetDateVal(e.target.value)}
                required
                className="bg-black/20 border-white/8 text-white"
              />
            </div>
            <div className="flex gap-2 mt-1">
              <Button type="submit" className="flex-1 bg-emerald-500 hover:bg-emerald-600">Record Payment</Button>
              <Button type="button" variant="outline" onClick={() => setShowSettlementModal(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showExpenseModal} onOpenChange={setShowExpenseModal}>
        <DialogContent className="bg-slate-900 border-white/8 max-w-[460px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Add Expense</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateExpense} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="expense-desc" className="text-xs text-slate-400 font-medium">Description</label>
              <Input
                id="expense-desc"
                type="text"
                value={desc}
                onChange={(e) => { setDesc(e.target.value); setFormErrors((prev) => ({ ...prev, desc: "" })); }}
                className={`bg-black/20 border-white/8 text-white ${formErrors.desc ? "border-red-500/60 bg-red-500/8" : ""}`}
              />
              {formErrors.desc && <span className="text-red-400 text-[0.78rem]">{formErrors.desc}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 font-medium">Amount</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setFormErrors((prev) => ({ ...prev, amount: "" })); }}
                  className={`flex-1 bg-black/20 border-white/8 text-white ${formErrors.amount ? "border-red-500/60 bg-red-500/8" : ""}`}
                />
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="w-32 bg-black/20 border-white/8 text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/8">
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code} className="text-slate-100">{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formErrors.amount && <span className="text-red-400 text-[0.78rem]">{formErrors.amount}</span>}
              {currency !== "INR" && amount && fxRates[currency] && (
                <span className="text-[0.76rem] text-slate-500">
                  ≈ {fmtCurrency(parseFloat(amount) / fxRates[currency])} INR
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 font-medium">Paid by</label>
              <Select value={paidBy} onValueChange={(v) => { setPaidBy(v); setFormErrors((prev) => ({ ...prev, paidBy: "" })); }}>
                <SelectTrigger className={`bg-black/20 border-white/8 text-slate-100 ${formErrors.paidBy ? "border-red-500/60" : ""}`}>
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/8">
                  {group.members.map((m: any) => (
                    <SelectItem key={m.id} value={m.id} className="text-slate-100">{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.paidBy && <span className="text-red-400 text-[0.78rem]">{formErrors.paidBy}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 font-medium">Split type</label>
              <Select value={splitType} onValueChange={(v) => { setSplitType(v); setFormErrors((prev) => ({ ...prev, splits: "" })); }}>
                <SelectTrigger className="bg-black/20 border-white/8 text-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/8">
                  <SelectItem value="equal" className="text-slate-100">Equal</SelectItem>
                  <SelectItem value="unequal" className="text-slate-100">Unequal</SelectItem>
                  <SelectItem value="percentage" className="text-slate-100">Percentage</SelectItem>
                  <SelectItem value="share" className="text-slate-100">Share (weighted)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {splitType !== "equal" && group.members.filter((m: Member) => {
              if (!expenseDate) return !m.leftAt;
              const d = new Date(expenseDate);
              const joined = new Date(m.joinedAt);
              const left = m.leftAt ? new Date(m.leftAt) : null;
              return d >= joined && (!left || d <= left);
            }).length > 0 && (
              <div className="bg-black/15 border border-white/8 rounded-md p-3 flex flex-col gap-2">
                <span className="text-[0.8rem] text-slate-500 uppercase">
                  {splitType === "unequal" && "Per-person amount (INR)"}
                  {splitType === "percentage" && "Per-person percentage (must sum to 100%)"}
                  {splitType === "share" && "Per-person weight (proportional)"}
                </span>
                {group.members.filter((m: Member) => {
                  if (!expenseDate) return !m.leftAt;
                  const d = new Date(expenseDate);
                  const joined = new Date(m.joinedAt);
                  const left = m.leftAt ? new Date(m.leftAt) : null;
                  return d >= joined && (!left || d <= left);
                }).map((m: Member) => (
                  <div key={m.id} className="flex gap-2 items-center">
                    <span className="flex-1 text-sm text-slate-400">{m.name}</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={splitType === "share" ? "1" : "0"}
                      value={splitDetails[m.id] ?? ""}
                      onChange={(e) => { setSplitDetails((prev) => ({ ...prev, [m.id]: e.target.value })); setFormErrors((prev) => ({ ...prev, splits: "" })); }}
                      className="w-24 bg-black/20 border border-white/8 text-white px-2 py-1 rounded text-sm outline-none"
                    />
                    {splitType === "percentage" && <span className="text-slate-500 text-sm">%</span>}
                  </div>
                ))}
                {splitType === "percentage" && (
                  <span className={`text-[0.8rem] ${Math.abs(Object.values(splitDetails).reduce((s, v) => s + parseFloat(v || "0"), 0) - 100) < 0.01 ? "text-emerald-400" : "text-red-400"}`}>
                    Total: {Object.values(splitDetails).reduce((s, v) => s + parseFloat(v || "0"), 0).toFixed(1)}%
                    {Math.abs(Object.values(splitDetails).reduce((s, v) => s + parseFloat(v || "0"), 0) - 100) < 0.01 ? " ✓" : " — must equal 100%"}
                  </span>
                )}
                {splitType === "unequal" && (
                  <span className={`text-[0.8rem] ${amount && Math.abs(Object.values(splitDetails).reduce((s, v) => s + parseFloat(v || "0"), 0) - parseFloat(amount)) < 0.01 ? "text-emerald-400" : "text-red-400"}`}>
                    Total: {Object.values(splitDetails).reduce((s, v) => s + parseFloat(v || "0"), 0).toFixed(2)}
                    {amount ? ` / ${parseFloat(amount).toFixed(2)}` : ""}
                    {amount && Math.abs(Object.values(splitDetails).reduce((s, v) => s + parseFloat(v || "0"), 0) - parseFloat(amount)) < 0.01 ? " ✓" : " — must match total"}
                  </span>
                )}
              </div>
            )}
            {formErrors.splits && <span className="text-red-400 text-[0.78rem]">{formErrors.splits}</span>}

            <div className="flex flex-col gap-1">
              <label htmlFor="expense-date" className="text-xs text-slate-400 font-medium">Date</label>
              <Input
                id="expense-date"
                type="date"
                value={expenseDate}
                onChange={(e) => { setExpenseDate(e.target.value); setFormErrors((prev) => ({ ...prev, expenseDate: "" })); }}
                className={`bg-black/20 border-white/8 text-white ${formErrors.expenseDate ? "border-red-500/60 bg-red-500/8" : ""}`}
              />
              {formErrors.expenseDate && <span className="text-red-400 text-[0.78rem]">{formErrors.expenseDate}</span>}
            </div>
            <div className="flex gap-2 mt-1">
              <Button type="submit" className="flex-1">Add Expense</Button>
              <Button type="button" variant="outline" onClick={() => setShowExpenseModal(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Drilldown Panel */}
      {selectedDrilldownUser && drilldownData && (
        <div className="glass-card animate-fade-in mt-8">
          <div className="flex justify-between items-center border-b border-white/8 pb-4 mb-4">
            <h3 className="text-slate-100 font-semibold">Drilldown Breakdown: {group.members.find((m: any) => m.id === selectedDrilldownUser)?.name}</h3>
            <Button variant="ghost" size="sm" onClick={() => setSelectedDrilldownUser(null)}>Close</Button>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div>
              <h4 className="text-emerald-400 font-medium mb-2">Payments Made (Increases balance)</h4>
              <div className="flex flex-col gap-2">
                {drilldownData.paidExpenses.map((exp: any) => (
                  <div key={exp.id} className="text-[0.85rem] px-2 py-1.5 bg-emerald-500/4 rounded flex justify-between gap-2">
                    <span className="text-slate-400">{exp.description} <span className="text-slate-500">· {fmtDate(exp.date)}</span></span>
                    <strong className="text-emerald-400 shrink-0">+{fmtCurrency(exp.convertedAmountInr)}</strong>
                  </div>
                ))}
                {drilldownData.sentSettlements.map((set: any) => (
                  <div key={set.id} className="text-[0.85rem] px-2 py-1.5 bg-emerald-500/4 rounded flex justify-between gap-2">
                    <span className="text-slate-400">Settlement → {set.toUser.name} <span className="text-slate-500">· {fmtDate(set.date)}</span></span>
                    <strong className="text-emerald-400 shrink-0">+{fmtCurrency(set.amount)}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-red-400 font-medium mb-2">Debts Owed (Decreases balance)</h4>
              <div className="flex flex-col gap-2">
                {drilldownData.owedSplits.map((split: any) => (
                  <div key={split.id} className="text-[0.85rem] px-2 py-1.5 bg-red-500/4 rounded flex justify-between gap-2">
                    <span className="text-slate-400">{split.expense.description} <span className="text-slate-500">· paid by {split.expense.paidBy.name}</span></span>
                    <strong className="text-red-400 shrink-0">−{fmtCurrency(split.owedAmount)}</strong>
                  </div>
                ))}
                {drilldownData.receivedSettlements.map((set: any) => (
                  <div key={set.id} className="text-[0.85rem] px-2 py-1.5 bg-red-500/4 rounded flex justify-between gap-2">
                    <span className="text-slate-400">Settlement from {set.fromUser.name} <span className="text-slate-500">· {fmtDate(set.date)}</span></span>
                    <strong className="text-red-400 shrink-0">−{fmtCurrency(set.amount)}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Pipeline */}
      <ImportPanel groupId={id!} onImportComplete={loadAll} onJumpToExpense={handleJumpToExpense} />
    </div>
  );
}
