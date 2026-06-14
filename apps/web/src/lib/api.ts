// Base URL for the backend API.
// Configured via the VITE_API_URL environment variable (set in Vercel / .env).
// Falls back to the local dev server when unset.
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
