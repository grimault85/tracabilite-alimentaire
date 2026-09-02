import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",            // indispensable : chargement via file:// en production
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
});
