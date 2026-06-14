import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import GroupDetails from "./pages/GroupDetails";

interface User {
  id: string;
  name: string;
  email: string;
}

export function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    if (token && storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const handleLogin = (token: string, userData: User) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
    navigate("/");
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-secondary text-lg">Loading App...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {user && (
        <header style={{
          background: "var(--panel-bg)",
          borderBottom: "1px solid var(--panel-border)",
          padding: "1rem 2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backdropFilter: "blur(10px)"
        }}>
          <Link to="/" style={{ fontSize: "1.5rem", fontWeight: "bold", color: "var(--text-primary)" }}>
            FlatBalance
          </Link>
          <div className="flex items-center gap-4">
            <span style={{ color: "var(--text-secondary)" }}>Hello, {user.name}</span>
            <button
              onClick={handleLogout}
              style={{
                background: "transparent",
                border: "1px solid var(--color-danger)",
                color: "var(--color-danger)",
                padding: "0.4rem 0.8rem",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                transition: "all var(--transition-fast)"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--color-danger)";
                e.currentTarget.style.color = "white";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--color-danger)";
              }}
            >
              Logout
            </button>
          </div>
        </header>
      )}
      <main style={{ flex: 1 }}>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" /> : <Login onLogin={handleLogin} />} />
          <Route path="/register" element={user ? <Navigate to="/" /> : <Register />} />
          <Route path="/" element={user ? <Dashboard /> : <Navigate to="/login" />} />
          <Route path="/group/:id" element={user ? <GroupDetails /> : <Navigate to="/login" />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
