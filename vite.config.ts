import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { metaImagesPlugin } from "./vite-plugin-meta-images";

// Get base path from environment variable, default to /pixlab/ for production
// This ensures assets are loaded from the correct path when deployed at a subpath
const base = process.env.VITE_BASE_URL || (process.env.NODE_ENV === "production" ? "/pixlab/" : "/");

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    metaImagesPlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          // @ts-expect-error - Optional Replit plugin, may not be installed
          await import("@replit/vite-plugin-runtime-error-modal").then((m) =>
            m.default(),
          ),
          // @ts-expect-error - Optional Replit plugin, may not be installed
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          // @ts-expect-error - Optional Replit plugin, may not be installed
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
