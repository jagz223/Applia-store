import type { Express } from "express";

/** Dominio canónico (sitemap / robots). Usar www: es la URL que Google rastrea. Sobrescribible con PUBLIC_SITE_URL en Render. */
const CANONICAL_SITE_ORIGIN = "https://www.genfeb.com";

/** Entradas del sitemap: sin /login ni /register (no suelen indexarse). */
const SITEMAP_ENTRIES: readonly { path: string; changefreq: string; priority: string }[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/explore", changefreq: "daily", priority: "0.9" },
  { path: "/categories", changefreq: "weekly", priority: "0.9" },
  { path: "/become-pro", changefreq: "monthly", priority: "0.5" },
];

/**
 * Origen canónico del sitio (sin barra final).
 * - Definí PUBLIC_SITE_URL si usás otro dominio o staging (p. ej. https://xxx.onrender.com).
 * - En producción sin env, se usa CANONICAL_SITE_ORIGIN (www.genfeb.com).
 * - En desarrollo: RENDER_EXTERNAL_URL si existe, si no localhost.
 */
function getPublicOrigin(): string {
  const explicit = process.env.PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production") {
    return CANONICAL_SITE_ORIGIN;
  }

  const render = process.env.RENDER_EXTERNAL_URL?.trim();
  if (render) return render.replace(/\/$/, "");

  const port = process.env.PORT || "5000";
  return `http://localhost:${port}`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Digital Asset Links para la app TWA (Bubblewrap).
 * Sin huella SHA-256 del keystore, Chrome muestra barra tipo navegador.
 * En producción: TWA_SHA256_FINGERPRINTS (coma-separado, formato keytool con :).
 * Opcional: TWA_PACKAGE_NAME (default com.genfeb.www.twa si coincide con tu Android).
 * Obtener huella: keytool -list -v -keystore android.keystore
 */
export function registerAssetLinksRoute(app: Express): void {
  app.get("/.well-known/assetlinks.json", (_req, res) => {
    const packageName = process.env.TWA_PACKAGE_NAME?.trim() || "com.genfeb.www.twa";
    const raw = process.env.TWA_SHA256_FINGERPRINTS?.trim();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (!raw) {
      res.json([]);
      return;
    }
    const sha256_cert_fingerprints = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (sha256_cert_fingerprints.length === 0) {
      res.json([]);
      return;
    }
    res.json([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: packageName,
          sha256_cert_fingerprints,
        },
      },
    ]);
  });
}

export function registerSeoRoutes(app: Express): void {
  registerAssetLinksRoute(app);

  app.get("/sitemap.xml", (_req, res) => {
    const base = getPublicOrigin();
    const body = SITEMAP_ENTRIES.map(({ path, changefreq, priority }) => {
      const loc = path === "/" ? base : `${base}${path}`;
      return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
    }).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;

    res.type("application/xml; charset=utf-8");
    res.send(xml);
  });

  app.get("/robots.txt", (_req, res) => {
    const base = getPublicOrigin();
    res.type("text/plain; charset=utf-8");
    res.send(`User-agent: *
Allow: /

# Bloqueamos el rastreo de páginas de autenticación (no aportan SEO)
Disallow: /login
Disallow: /register

# Indicamos la ruta de tu sitemap oficial
Sitemap: ${base}/sitemap.xml
`);
  });
}
