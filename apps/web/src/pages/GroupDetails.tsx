import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import ImportPanel from "../components/ImportPanel";

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

export default function GroupDetails() {
  const { id } = useParams<{ id: string }>();
  const [group, setGroup] = useState<any>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const [balances, setBalances] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [asOfDate, setAsOfDate] = useState("");
  const [selectedDrilldownUser, setSelectedDrilldownUser] = useState<string | null>(null);
  const [drilldownData, setDrilldownData] = useState<UserBreakdown | null>(null);

  // Forms
  const [memberEmail, setMemberEmail] = useState("");
  const [memberJoinDate, setMemberJoinDate] = useState("");

  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [splitType, setSplitType] = useState("equal");
  const [paidBy, setPaidBy] = useState("");
  const [expenseDate, setExpenseDate] = useState("");

  // Settlement Form
  const [setFrom, setSetFrom] = useState("");
  const [setTo, setSetTo] = useState("");
  const [setAmountVal, setSetAmountVal] = useState("");
  const [setDateVal, setSetDateVal] = useState("");

  const [error, setError] = useState("");


  const loadAll = async () => {
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
      
      // Fetch group details
      const groupRes = await fetch(`http://localhost:3001/groups/${id}`, { headers });
      const groupData = await groupRes.json();
      setGroup(groupData);

      // Fetch expenses
      const expRes = await fetch(`http://localhost:3001/expenses/group/${id}`, { headers });
      setExpenses(await expRes.json());

      // Fetch settlements
      const setRes = await fetch(`http://localhost:3001/settlements/group/${id}`, { headers });
      const setData = await setRes.json();
      // Keep state if needed or log
      if (setData) {
        // Log or save
      }


      // Fetch balances
      const balUrl = asOfDate 
        ? `http://localhost:3001/balances/group/${id}?asOfDate=${asOfDate}`
        : `http://localhost:3001/balances/group/${id}`;
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

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`http://localhost:3001/groups/${id}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ email: memberEmail, joinedAt: memberJoinDate }),
      });
      if (!res.ok) throw new Error("Failed to add member");
      setMemberEmail("");
      setMemberJoinDate("");
      loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();

    // Only include members who were active on the selected expense date
    const selectedDate = expenseDate ? new Date(expenseDate) : null;
    const activeSplits = group.members
      .filter((m: Member) => {
        if (!selectedDate) return !m.leftAt; // if no date chosen, include current members only
        const joined = new Date(m.joinedAt);
        const left = m.leftAt ? new Date(m.leftAt) : null;
        return selectedDate >= joined && (!left || selectedDate <= left);
      })
      .map((m: Member) => ({ userId: m.id }));

    try {
      const res = await fetch("http://localhost:3001/expenses", {
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
          splits: activeSplits,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Failed to create expense");
      }
      setDesc("");
      setAmount("");
      setPaidBy("");
      setExpenseDate("");
      loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreateSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("http://localhost:3001/settlements", {
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
          currency: "INR",
          date: setDateVal,
        }),
      });
      if (!res.ok) throw new Error("Failed to record settlement");
      setSetFrom("");
      setSetTo("");
      setSetAmountVal("");
      setSetDateVal("");
      loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleFetchDrilldown = async (userId: string) => {
    setSelectedDrilldownUser(userId);
    try {
      const balUrl = asOfDate 
        ? `http://localhost:3001/balances/group/${id}/user/${userId}?asOfDate=${asOfDate}`
        : `http://localhost:3001/balances/group/${id}/user/${userId}`;
      const res = await fetch(balUrl, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();
      setDrilldownData(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const markMemberLeft = async (memberId: string) => {
    const leftDate = prompt("Enter exit date (YYYY-MM-DD):");
    if (!leftDate) return;

    try {
      const res = await fetch(`http://localhost:3001/groups/${id}/members/${memberId}`, {
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

  if (!group) return <div className="container"><p>Loading...</p></div>;

  return (
    <div className="container animate-fade-in flex flex-col gap-8">
      {/* Group Header */}
      <div className="flex justify-between items-center">
        <div>
          <Link to="/" style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>&larr; Back to Dashboard</Link>
          <h1 style={{ marginTop: "0.5rem" }}>{group.name}</h1>
        </div>
        <div className="flex gap-2 items-center">
          <label style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>As of Date:</label>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            style={{
              background: "rgba(30, 41, 59, 0.7)",
              border: "1px solid var(--panel-border)",
              borderRadius: "var(--radius-sm)",
              padding: "0.4rem 0.8rem",
              color: "white"
            }}
          />
        </div>
      </div>

      {error && (
        <div style={{
          background: "rgba(239, 68, 68, 0.2)",
          border: "1px solid var(--color-danger)",
          color: "var(--color-danger)",
          padding: "1rem",
          borderRadius: "var(--radius-sm)"
        }}>
          {error}
        </div>
      )}

      {/* Grid of details */}
      <div className="grid" style={{ gridTemplateColumns: "2fr 1fr", gap: "2rem" }}>
        
        {/* Left column: Expenses & Settlements */}
        <div className="flex flex-col gap-6">
          
          {/* Members List */}
          <div className="card">
            <h3>Group Members</h3>
            <div className="flex flex-col gap-2" style={{ marginTop: "1rem" }}>
              {group.members.map((m: Member) => (
                <div key={m.id} className="flex justify-between items-center" style={{
                  padding: "0.6rem",
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: "var(--radius-sm)"
                }}>
                  <div>
                    <strong>{m.name}</strong>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginLeft: "0.5rem" }}>
                      ({m.email})
                    </span>
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    {m.leftAt ? (
                      <span style={{ color: "var(--color-danger)" }}>Left {new Date(m.leftAt).toLocaleDateString()}</span>
                    ) : (
                      <button
                        onClick={() => markMemberLeft(m.id)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--color-warning)",
                          cursor: "pointer"
                        }}
                      >
                        Mark Left
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add Member form */}
            <form onSubmit={handleAddMember} className="flex gap-2" style={{ marginTop: "1rem" }}>
              <input
                type="email"
                placeholder="User Email"
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                required
                style={{
                  flex: 1,
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--panel-border)",
                  color: "white",
                  padding: "0.4rem",
                  borderRadius: "var(--radius-sm)"
                }}
              />
              <input
                type="date"
                value={memberJoinDate}
                onChange={(e) => setMemberJoinDate(e.target.value)}
                required
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--panel-border)",
                  color: "white",
                  padding: "0.4rem",
                  borderRadius: "var(--radius-sm)"
                }}
              />
              <button
                type="submit"
                style={{
                  background: "var(--color-primary)",
                  border: "none",
                  color: "white",
                  padding: "0.4rem 0.8rem",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer"
                }}
              >
                Add Member
              </button>
            </form>
          </div>

          {/* Expenses list */}
          <div className="card">
            <h3>Expenses</h3>
            <div className="flex flex-col gap-4" style={{ marginTop: "1rem" }}>
              {expenses.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No expenses recorded yet.</p>
              ) : (
                expenses.map((e) => (
                  <div key={e.id} style={{
                    padding: "1rem",
                    borderBottom: "1px solid var(--panel-border)"
                  }}>
                    <div className="flex justify-between items-start">
                      <div>
                        <strong>{e.description}</strong>
                        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                          Paid by {e.paidBy?.name} on {new Date(e.date).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: "1.1rem", fontWeight: "bold" }}>
                          {e.amountOriginalCurrency === "USD" ? `$${e.amountOriginal}` : `₹${e.amountOriginal}`}
                        </span>
                        {e.amountOriginalCurrency === "USD" && (
                          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                            (₹{parseFloat(e.convertedAmountInr).toFixed(2)})
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Splits breakdown for Rohan */}
                    <div style={{ marginTop: "0.8rem", paddingLeft: "1rem", borderLeft: "2px dashed var(--panel-border)" }}>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Splits:</span>
                      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "0.4rem", marginTop: "0.2rem" }}>
                        {e.splits.map((s, idx) => (
                          <div key={idx} style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                            {s.user?.name || s.guest?.name}: <span style={{ color: "white" }}>₹{parseFloat(s.owedAmount).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Right column: Balances & Calculations */}
        <div className="flex flex-col gap-6">
          
          {/* Net Balances */}
          <div className="card">
            <h3>Net Balances</h3>
            <div className="flex flex-col gap-3" style={{ marginTop: "1rem" }}>
              {balances.map((b) => (
                <div
                  key={b.userId}
                  onClick={() => handleFetchDrilldown(b.userId)}
                  style={{
                    padding: "0.8rem",
                    background: selectedDrilldownUser === b.userId ? "rgba(99, 102, 241, 0.15)" : "rgba(255,255,255,0.02)",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    border: selectedDrilldownUser === b.userId ? "1px solid var(--color-primary)" : "1px solid transparent",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <span>{b.name}</span>
                  <strong style={{
                    color: b.netBalance >= 0 ? "var(--color-success)" : "var(--color-danger)"
                  }}>
                    {b.netBalance >= 0 ? `+₹${b.netBalance.toFixed(2)}` : `-₹${Math.abs(b.netBalance).toFixed(2)}`}
                  </strong>
                </div>
              ))}
            </div>
          </div>

          {/* Settlement Suggestions (Aisha's View) */}
          <div className="card">
            <h3>Settlement Suggestions</h3>
            <div className="flex flex-col gap-3" style={{ marginTop: "1rem" }}>
              {suggestions.length === 0 ? (
                <p style={{ color: "var(--text-success)", fontSize: "0.9rem" }}>Everyone is settled up!</p>
              ) : (
                suggestions.map((s, idx) => (
                  <div key={idx} style={{
                    padding: "0.8rem",
                    background: "rgba(16, 185, 129, 0.05)",
                    border: "1px solid rgba(16, 185, 129, 0.2)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.95rem"
                  }}>
                    <strong>{s.fromUserName}</strong> pays <strong>{s.toUserName}</strong>
                    <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--color-success)", marginTop: "0.2rem" }}>
                      ₹{s.amount.toFixed(2)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Record Settlement Form */}
          <div className="card">
            <h3>Record Payment</h3>
            <form onSubmit={handleCreateSettlement} className="flex flex-col gap-3" style={{ marginTop: "1rem" }}>
              <select
                value={setFrom}
                onChange={(e) => setSetFrom(e.target.value)}
                required
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--panel-border)",
                  color: "white",
                  padding: "0.5rem"
                }}
              >
                <option value="">Who paid?</option>
                {group.members.map((m: any) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <select
                value={setTo}
                onChange={(e) => setSetTo(e.target.value)}
                required
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--panel-border)",
                  color: "white",
                  padding: "0.5rem"
                }}
              >
                <option value="">To whom?</option>
                {group.members.map((m: any) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <input
                type="number"
                placeholder="Amount (INR)"
                value={setAmountVal}
                onChange={(e) => setSetAmountVal(e.target.value)}
                required
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--panel-border)",
                  color: "white",
                  padding: "0.5rem"
                }}
              />
              <input
                type="date"
                value={setDateVal}
                onChange={(e) => setSetDateVal(e.target.value)}
                required

                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--panel-border)",
                  color: "white",
                  padding: "0.5rem"
                }}
              />
              <button
                type="submit"
                style={{
                  background: "var(--color-success)",
                  border: "none",
                  color: "white",
                  padding: "0.6rem",
                  fontWeight: "bold",
                  cursor: "pointer"
                }}
              >
                Record Payment
              </button>
            </form>
          </div>

          {/* Quick Expense Form */}
          <div className="card">
            <h3>Add Expense</h3>
            <form onSubmit={handleCreateExpense} className="flex flex-col gap-3" style={{ marginTop: "1rem" }}>
              <input
                type="text"
                placeholder="Description"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                required
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--panel-border)",
                  color: "white",
                  padding: "0.5rem"
                }}
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  style={{
                    flex: 1,
                    background: "rgba(0,0,0,0.2)",
                    border: "1px solid var(--panel-border)",
                    color: "white",
                    padding: "0.5rem"
                  }}
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{
                    background: "rgba(0,0,0,0.2)",
                    border: "1px solid var(--panel-border)",
                    color: "white",
                    padding: "0.5rem"
                  }}
                >
                  <option value="INR">INR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <select
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                required
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--panel-border)",
                  color: "white",
                  padding: "0.5rem"
                }}
              >
                <option value="">Paid By...</option>
                {group.members.map((m: any) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <select
                value={splitType}
                onChange={(e) => setSplitType(e.target.value)}
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--panel-border)",
                  color: "white",
                  padding: "0.5rem"
                }}
              >
                <option value="equal">Equal</option>
                <option value="unequal">Unequal</option>
                <option value="percentage">Percentage</option>
                <option value="share">Share (weighted)</option>
              </select>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                required
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--panel-border)",
                  color: "white",
                  padding: "0.5rem"
                }}
              />
              <button
                type="submit"
                style={{
                  background: "var(--color-primary)",
                  border: "none",
                  color: "white",
                  padding: "0.6rem",
                  fontWeight: "bold",
                  cursor: "pointer"
                }}
              >
                Add Expense
              </button>
            </form>
          </div>

        </div>

      </div>

      {/* Rohan's Drilldown Panel */}
      {selectedDrilldownUser && drilldownData && (
        <div className="card animate-fade-in" style={{ marginTop: "2rem" }}>
          <div className="flex justify-between items-center" style={{ borderBottom: "1px solid var(--panel-border)", paddingBottom: "1rem" }}>
            <h3>Drilldown Breakdown: {group.members.find((m: any) => m.id === selectedDrilldownUser)?.name}</h3>
            <button
              onClick={() => setSelectedDrilldownUser(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer"
              }}
            >
              Close
            </button>
          </div>

          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "2rem", marginTop: "1rem" }}>
            <div>
              <h4 style={{ color: "var(--color-success)", marginBottom: "0.5rem" }}>Payments Made (Increases balance)</h4>
              <div className="flex flex-col gap-2">
                {drilldownData.paidExpenses.map((exp: any) => (
                  <div key={exp.id} style={{ fontSize: "0.9rem", padding: "0.4rem", background: "rgba(255,255,255,0.02)" }}>
                    {exp.description} ({new Date(exp.date).toLocaleDateString()}): <strong>+₹{parseFloat(exp.convertedAmountInr).toFixed(2)}</strong>
                  </div>
                ))}
                {drilldownData.sentSettlements.map((set: any) => (
                  <div key={set.id} style={{ fontSize: "0.9rem", padding: "0.4rem", background: "rgba(255,255,255,0.02)" }}>
                    Settled to {set.toUser.name} ({new Date(set.date).toLocaleDateString()}): <strong>+₹{parseFloat(set.amount).toFixed(2)}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 style={{ color: "var(--color-danger)", marginBottom: "0.5rem" }}>Debts Owed (Decreases balance)</h4>
              <div className="flex flex-col gap-2">
                {drilldownData.owedSplits.map((split: any) => (
                  <div key={split.id} style={{ fontSize: "0.9rem", padding: "0.4rem", background: "rgba(255,255,255,0.02)" }}>
                    Share for "{split.expense.description}" (paid by {split.expense.paidBy.name}): <strong>-₹{parseFloat(split.owedAmount).toFixed(2)}</strong>
                  </div>
                ))}
                {drilldownData.receivedSettlements.map((set: any) => (
                  <div key={set.id} style={{ fontSize: "0.9rem", padding: "0.4rem", background: "rgba(255,255,255,0.02)" }}>
                    Settled from {set.fromUser.name} ({new Date(set.date).toLocaleDateString()}): <strong>-₹{parseFloat(set.amount).toFixed(2)}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Pipeline */}
      <ImportPanel groupId={id!} onImportComplete={loadAll} />
    </div>
  );
}
