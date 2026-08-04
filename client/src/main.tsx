import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ThemeProvider } from "@/contexts/ThemeContext";
/** Leaflet antes del primer paint evita mapa colapsado si el CSS del chunk llega tarde al reiniciar Vite. */
import "leaflet/dist/leaflet.css";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
);

if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => {});
    });
  } else {
    // Evita que un SW de un build de producción anterior sirva CSS/tema viejo en dev.
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) void reg.unregister();
    });
    if ("caches" in window) {
      void caches.keys().then((keys) => {
        for (const key of keys) {
          if (key.startsWith("applia-")) void caches.delete(key);
        }
      });
    }
  }
}
