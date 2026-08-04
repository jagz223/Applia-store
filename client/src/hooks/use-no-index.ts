import { useEffect } from "react";

/** Marca la vista actual como no indexable (p. ej. login / registro). */
export function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    meta.setAttribute("data-applia-seo", "noindex");
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);
}
