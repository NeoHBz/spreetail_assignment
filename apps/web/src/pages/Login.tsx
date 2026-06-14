import React, { useState } from "react";
import { Link } from "react-router-dom";

interface LoginProps {
  onLogin: (token: string, user: { id: string; name: string; email: string }) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:3001/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Invalid credentials");
      }
      onLogin(data.token, data.user);
    } catch (err: any) {
      setError(err.message || "Failed to login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "80vh",
      padding: "1rem"
    }}>
      <div className="card animate-fade-in" style={{ width: "100%", maxWidth: "420px" }}>
        <h2 style={{ marginBottom: "1.5rem", textAlign: "center" }}>Welcome Back</h2>
        {error && (
          <div style={{
            background: "rgba(239, 68, 68, 0.2)",
            border: "1px solid var(--color-danger)",
            color: "var(--color-danger)",
            padding: "0.8rem",
            borderRadius: "var(--radius-sm)",
            marginBottom: "1rem",
            fontSize: "0.9rem"
          }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                background: "rgba(15, 23, 42, 0.6)",
                border: "1px solid var(--panel-border)",
                borderRadius: "var(--radius-sm)",
                padding: "0.75rem",
                color: "var(--text-primary)",
                outline: "none"
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                background: "rgba(15, 23, 42, 0.6)",
                border: "1px solid var(--panel-border)",
                borderRadius: "var(--radius-sm)",
                padding: "0.75rem",
                color: "var(--text-primary)",
                outline: "none"
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              background: "var(--color-primary)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: "white",
              padding: "0.8rem",
              fontWeight: "bold",
              cursor: "pointer",
              transition: "background var(--transition-fast)",
              marginTop: "0.5rem"
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <p style={{ marginTop: "1.5rem", textAlign: "center", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
          Don't have an account? <Link to="/register" style={{ color: "var(--color-secondary)" }}>Register here</Link>
        </p>
      </div>
    </div>
  );
}
