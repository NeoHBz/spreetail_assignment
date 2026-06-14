import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";

interface Group {
  id: string;
  name: string;
  createdAt: string;
  members: { id: string; name: string }[];
}

export default function Dashboard() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchGroups = async () => {
    try {
      const res = await fetch("http://localhost:3001/groups", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to fetch groups");
      setGroups(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    try {
      const res = await fetch("http://localhost:3001/groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ name: newGroupName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to create group");
      
      setNewGroupName("");
      fetchGroups();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ textAlign: "center", marginTop: "4rem" }}>
        <p style={{ color: "var(--text-secondary)" }}>Loading your flat groups...</p>
      </div>
    );
  }

  return (
    <div className="container animate-fade-in">
      <div className="flex justify-between items-center" style={{ marginBottom: "2rem" }}>
        <h1>Your Groups</h1>
        <form onSubmit={handleCreateGroup} className="flex gap-2">
          <input
            type="text"
            placeholder="New Group Name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            required
            style={{
              background: "rgba(30, 41, 59, 0.7)",
              border: "1px solid var(--panel-border)",
              borderRadius: "var(--radius-sm)",
              padding: "0.5rem 1rem",
              color: "white",
              outline: "none"
            }}
          />
          <button
            type="submit"
            style={{
              background: "var(--color-primary)",
              border: "none",
              color: "white",
              padding: "0.5rem 1rem",
              borderRadius: "var(--radius-sm)",
              fontWeight: "bold",
              cursor: "pointer",
              transition: "background var(--transition-fast)"
            }}
          >
            Create Group
          </button>
        </form>
      </div>

      {error && (
        <div style={{
          background: "rgba(239, 68, 68, 0.2)",
          border: "1px solid var(--color-danger)",
          color: "var(--color-danger)",
          padding: "1rem",
          borderRadius: "var(--radius-sm)",
          marginBottom: "1.5rem"
        }}>
          {error}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
          <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
            You aren't in any groups yet. Create a group above to get started.
          </p>
        </div>
      ) : (
        <div className="grid" style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: "1.5rem"
        }}>
          {groups.map((group) => (
            <Link key={group.id} to={`/group/${group.id}`} style={{ textDecoration: "none" }}>
              <div className="card flex flex-col justify-between" style={{ height: "100%", minHeight: "180px" }}>
                <div>
                  <h3 style={{ color: "var(--text-primary)", marginBottom: "0.5rem" }}>{group.name}</h3>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                    Created on {new Date(group.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div style={{ borderTop: "1px solid var(--panel-border)", paddingTop: "0.8rem" }}>
                  <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                    {group.members.length} {group.members.length === 1 ? "member" : "members"}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
