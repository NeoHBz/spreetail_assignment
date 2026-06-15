import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Keep the /api prefix end-to-end: the API mounts its routes under /api,
      // matching the reverse proxy in production. No prefix stripping.
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true
      }
    }
  }
});
