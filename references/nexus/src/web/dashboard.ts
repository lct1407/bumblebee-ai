import express, { type Express } from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Resolve from project root since tsup bundles into dist/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "src", "web", "public");

export function setupDashboard(app: Express): void {
  app.use(express.static(publicDir));

  app.get("/api/sessions", (_req, res) => {
    res.json([]);
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });
}
