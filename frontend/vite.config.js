import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api/* is proxied to FastAPI, so no CORS or URL changes are needed later
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": { target: "http://127.0.0.1:8000", rewrite: (p) => p.replace(/^\/api/, "") } } },
});
