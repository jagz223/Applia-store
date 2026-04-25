import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
/** Leaflet antes del primer paint evita mapa colapsado si el CSS del chunk llega tarde al reiniciar Vite. */
import "leaflet/dist/leaflet.css";

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch(() => {});
  });
}
