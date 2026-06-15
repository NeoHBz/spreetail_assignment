// Base URL for the backend API.
// Configured via the VITE_API_URL environment variable (set in Vercel / .env).
// Falls back to the same-origin "/api" prefix, which the Vite dev proxy and the
// reverse proxy (Nginx Proxy Manager) forward to the API.
export const API_URL = import.meta.env.VITE_API_URL ?? "/api";
