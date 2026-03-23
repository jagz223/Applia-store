import type { Express } from "express";

/** Rutas públicas que interesan para SEO (sin áreas autenticadas ni admin). */
const PUBLIC_SEO_PATHS = [
  "/",
  "/explore",
  "/categories",
  "/login",
  "/register",
  "/become-pro",
] as const;

/**
 * Origen canónico del sitio (sin barra final).
 * - En Render: suele bastar con RENDER_EXTERNAL_URL (lo inyecta Render).
 * - Con dominio propio: definí PUBLIC_SITE_URL=https://tudominio.com
 */
function getPublicOrigin(): string {
  const explicit = process.env.PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const render = process.env.RENDER_EXTERNAL_URL?.trim();
  if (render) return render.replace(/\/$/, "");

  const port = process.env.PORT || "5000";
  return `http://localhost:${port}`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function registerSeoRoutes(app: Express): void {
  app.get("/sitemap.xml", (_req, res) => {
    const base = getPublicOrigin();
    const body = PUBLIC_SEO_PATHS.map((p) => {
      const loc = p === "/" ? base : `${base}${p}`;
      const priority = p === "/" ? "1.0" : "0.8";
      return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <changefreq>weekly</changefreq>
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

Sitemap: ${base}/sitemap.xml
`);
  });
}
