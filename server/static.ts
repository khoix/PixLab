import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // When bundled to CJS, __dirname points to dist/, so public is at dist/public
  // Fallback to process.cwd()/dist/public if __dirname isn't available
  const distPath = typeof __dirname !== "undefined"
    ? path.resolve(__dirname, "public")
    : path.resolve(process.cwd(), "dist", "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
