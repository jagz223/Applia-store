import type { Express } from "express";

/** Dominio canónico (sitemap / robots / TWA). Apex sin www (coincide con Play + bubblewrap). Sobrescribible con PUBLIC_SITE_URL. */
const CANONICAL_SITE_ORIGIN = "https://genfeb.com";

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
 * - En producción sin env, se usa CANONICAL_SITE_ORIGIN (https://genfeb.com).
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

/** Package name de la TWA / Play (com.genfeb.www.twa). Sobrescribible con TWA_PACKAGE_NAME. */
const DEFAULT_TWA_PACKAGE_NAME = "com.genfeb.www.twa";

/**
 * Huellas SHA-256 exigidas por Play Console para Digital Asset Links
 * (App Signing + upload key). Deben coincidir exactamente con el JSON de
 * «Agregar dominio» o Google rechaza la asociación.
 */
const REQUIRED_PLAY_SHA256_FINGERPRINTS = [
  "0E:7E:FB:C9:7B:22:24:84:A6:6F:A1:A6:E7:D2:23:B6:91:9B:28:57:1C:C6:5F:A1:C6:82:29:43:C4:4B:AB:A1",
  "4B:90:DF:7B:23:C6:12:F9:AD:B5:EF:73:35:FD:FE:A1:65:6D:FE:40:64:3E:65:D8:17:0B:01:B5:36:0D:B2:06",
] as const;

function resolveTwaSha256Fingerprints(): string[] {
  const fromEnv = (process.env.TWA_SHA256_FINGERPRINTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Unión: nunca omitir los fingerprints oficiales de Play (el env a veces trae solo uno).
  const merged = new Set<string>([...REQUIRED_PLAY_SHA256_FINGERPRINTS, ...fromEnv]);
  return Array.from(merged);
}

/**
 * Digital Asset Links para la app TWA + compartir credenciales con el sitio.
 * Debe responder 200 + JSON en https://genfeb.com/.well-known/assetlinks.json
 * (mismo origen que pide Play; un 301 solo hacia www puede romper la verificación).
 */
export function registerAssetLinksRoute(app: Express): void {
  app.get("/.well-known/assetlinks.json", (_req, res) => {
    const packageName = process.env.TWA_PACKAGE_NAME?.trim() || DEFAULT_TWA_PACKAGE_NAME;
    const sha256_cert_fingerprints = resolveTwaSha256Fingerprints();

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    // Play revalida; evitar CDN/proxy con JSON viejo incompleto.
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.json([
      {
        relation: [
          "delegate_permission/common.handle_all_urls",
          "delegate_permission/common.get_login_creds",
        ],
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
