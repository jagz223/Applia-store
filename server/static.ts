import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  const faviconPng = path.join(distPath, "favicon.png");
  // Muchos navegadores piden /favicon.ico aunque el HTML declare /favicon.png.
  app.get("/favicon.ico", (_req, res) => {
    res.type("image/png");
    res.sendFile(faviconPng);
  });

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
