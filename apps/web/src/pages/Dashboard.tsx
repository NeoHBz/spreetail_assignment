import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center mt-16">
        <p className="text-slate-400">Loading your flat groups...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-slate-100">Your Groups</h1>
        <form onSubmit={handleCreateGroup} className="flex gap-2">
          <Input
            type="text"
            placeholder="New Group Name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            required
            className="w-56"
          />
          <Button type="submit" variant="default">
            Create Group
          </Button>
        </form>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/40 text-red-400 px-4 py-3 rounded-md mb-6 text-sm">
          {error}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="glass-card text-center py-12">
          <p className="text-slate-400">
            You aren't in any groups yet. Create a group above to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-6">
          {groups.map((group) => (
            <Link key={group.id} to={`/group/${group.id}`} className="no-underline block">
              <div className="glass-card h-full min-h-[180px] flex flex-col justify-between cursor-pointer">
                <div>
                  <h3 className="text-slate-100 font-semibold mb-1">{group.name}</h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Created on {new Date(group.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="border-t border-white/[0.08] pt-3">
                  <span className="text-sm text-slate-400">
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
