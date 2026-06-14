import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import GroupDetails from "./pages/GroupDetails";
import { Button } from "@/components/ui/button";

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
        <div className="text-slate-400 text-lg">Loading App...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {user && (
        <header className="sticky top-0 z-50 h-15 px-8 flex justify-between items-center bg-slate-950/80 border-b border-white/[0.08] backdrop-blur-md">
          <Link to="/" className="text-indigo-300 font-semibold text-xl tracking-tight no-underline">
            FlatBalance
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-slate-400">Hello, {user.name}</span>
            <Button
              onClick={handleLogout}
              variant="outline"
              size="sm"
              className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500/60"
            >
              Logout
            </Button>
          </div>
        </header>
      )}
      <main className="flex-1">
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
