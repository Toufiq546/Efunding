// Dev server for the LOCAL preview backend (scripts/local-supabase.sh).
// The browser talks to Supabase through this server's own origin, so the preview works from any device.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error plain JS helper
import { localAnonKey } from "./scripts/local-anon-key.mjs";

const strip = (prefix: string) => (path: string) => path.slice(prefix.length) || "/";

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_SUPABASE_URL": "window.location.origin",
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(localAnonKey()),
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      "/auth/v1": { target: "http://localhost:9999", changeOrigin: true, rewrite: strip("/auth/v1") },
      "/rest/v1": { target: "http://localhost:3000", changeOrigin: true, rewrite: strip("/rest/v1") },
    },
  },
});
