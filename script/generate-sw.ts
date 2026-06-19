import { readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TEMPLATE_PATH = path.join(ROOT, "client", "public", "sw.template.js");
const OUTPUT_PATH = path.join(ROOT, "client", "public", "sw.js");

const FIREBASE_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

export async function generateServiceWorker(): Promise<void> {
  let template = await readFile(TEMPLATE_PATH, "utf-8");

  for (const key of FIREBASE_KEYS) {
    const value = process.env[key]?.trim() ?? "";
    if (!value) {
      console.warn(`[generate-sw] Falta ${key} — el Service Worker puede fallar para push.`);
    }
    template = template.replaceAll(`__${key}__`, value);
  }

  await writeFile(OUTPUT_PATH, template, "utf-8");
  console.log("[generate-sw] client/public/sw.js actualizado.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  generateServiceWorker().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
