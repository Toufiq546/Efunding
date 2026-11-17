// In-browser demo build: one self-contained HTML file with sample data and no backend (src/lib/demo).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: { "import.meta.env.VITE_DEMO": JSON.stringify("1") },
  build: { outDir: "dist-demo", emptyOutDir: true },
});
