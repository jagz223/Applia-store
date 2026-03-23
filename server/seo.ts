import type { Express } from "express";

/** Entradas del sitemap: sin /login ni /register (no suelen indexarse). */
const SITEMAP_ENTRIES: readonly { path: string; changefreq: string; priority: string }[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/explore", changefreq: "daily", priority: "0.9" },
  { path: "/categories", changefreq: "weekly", priority: "0.9" },
  { path: "/become-pro", changefreq: "monthly", priority: "0.5" },
];

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

Sitemap: ${base}/sitemap.xml
`);
  });
}
