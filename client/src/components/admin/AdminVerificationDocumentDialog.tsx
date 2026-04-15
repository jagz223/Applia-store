import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Visor de PDF en admin: se usa <iframe> con la URL directa (p. ej. Firebase Storage).
 * `react-pdf`/pdf.js hace fetch al archivo y suele fallar por CORS en URLs de Storage;
 * el iframe delega en el visor nativo del navegador y no tiene ese problema.
 */

export type AdminVerificationSlide = { id: string; title: string; src: string | null };

type DocKind = "image" | "pdf" | "office" | "unknown";

function inferKindFromUrl(url: string): DocKind {
  try {
    const u = new URL(url);
    const afterO = u.pathname.includes("/o/") ? decodeURIComponent(u.pathname.split("/o/")[1] ?? "") : "";
    const seg = afterO.split("/").pop() || "";
    const ext = seg.includes(".") ? seg.split(".").pop()?.toLowerCase() ?? "" : "";
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
    if (ext === "pdf") return "pdf";
    if (ext === "doc" || ext === "docx") return "office";
  } catch {
    /* ignore */
  }
  if (/\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(url)) return "image";
  if (/\.pdf(\?|#|$)/i.test(url)) return "pdf";
  if (/\.(doc|docx)(\?|#|$)/i.test(url)) return "office";
  return "unknown";
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  /** Nombre del asociado cuyos documentos se revisan. */
  revieweeName: string;
  slides: AdminVerificationSlide[];
  initialIndex: number;
};

export function AdminVerificationDocumentDialog({
  open,
  onOpenChange,
  userId,
  revieweeName,
  slides,
  initialIndex,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const slide = slides[activeIndex];
  const src = slide?.src ?? null;
  const title = slide?.title ?? "Documento";

  const kind = useMemo(() => (src ? inferKindFromUrl(src) : "unknown"), [src]);
  const [pdfFrameLoaded, setPdfFrameLoaded] = useState(false);

  useEffect(() => {
    if (open) {
      const clamped = Math.max(0, Math.min(initialIndex, Math.max(0, slides.length - 1)));
      setActiveIndex(clamped);
    }
  }, [open, initialIndex, userId, slides.length]);

  useEffect(() => {
    setPdfFrameLoaded(false);
  }, [src, open, activeIndex]);

  /** Si onLoad del iframe no llega (poco habitual en cross-origin), ocultar el overlay de carga. */
  useEffect(() => {
    if (!open || kind !== "pdf") return;
    const t = window.setTimeout(() => setPdfFrameLoaded(true), 15000);
    return () => window.clearTimeout(t);
  }, [open, kind, src, activeIndex]);

  const canPrevSlide = activeIndex > 0;
  const canNextSlide = activeIndex < slides.length - 1;
  const showSlideNav = slides.length > 1;

  const viewerBody = !src ? (
    <div className="flex min-h-[200px] items-center justify-center rounded-md border border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-600 shadow-sm">
      No hay archivo para este ítem.
    </div>
  ) : kind === "image" || kind === "unknown" ? (
    <div className="flex min-h-[120px] items-center justify-center px-2 py-3">
      <img
        src={src}
        alt={title}
        className="h-auto w-auto max-h-[min(55vh,520px)] max-w-[min(100%,380px)] rounded-sm object-contain"
      />
    </div>
  ) : kind === "pdf" ? (
    <div className="flex min-h-0 w-full flex-col items-center gap-2 px-1 py-2">
      <div className="relative w-full overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 shadow-sm">
        {!pdfFrameLoaded ? (
          <div className="absolute inset-0 z-10 flex min-h-[220px] items-center justify-center bg-white/95 text-sm text-zinc-500">
            Cargando PDF…
          </div>
        ) : null}
        <iframe
          src={src}
          title={title}
          className="block h-[min(55vh,560px)] w-full min-h-[220px] border-0 bg-white"
          onLoad={() => setPdfFrameLoaded(true)}
        />
      </div>
      <p className="max-w-[280px] text-center text-xs text-muted-foreground">
        Si no ves el documento, usa <span className="font-medium">Abrir en pestaña nueva</span> abajo.
      </p>
    </div>
  ) : (
    <div className="flex flex-col items-center gap-4 rounded-md border border-zinc-200 bg-white px-4 py-10 text-center shadow-sm">
      <FileText className="h-14 w-14 text-zinc-400" aria-hidden />
      <p className="max-w-sm text-sm text-zinc-600">
        Vista previa no disponible para este tipo de archivo. Ábrelo en una pestaña nueva para revisarlo.
      </p>
      <Button variant="secondary" className="gap-2" asChild>
        <a href={src} target="_blank" rel="noopener noreferrer">
          Abrir documento
          <ExternalLink className="h-4 w-4" />
        </a>
      </Button>
    </div>
  );

  const overlayClass =
    "fixed inset-0 z-50 bg-black/45 backdrop-blur-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName={overlayClass}
        className="flex max-h-[min(92vh,100dvh)] w-[min(94vw,32rem)] max-w-[min(94vw,32rem)] flex-col gap-0 overflow-hidden border-border bg-card p-0 text-foreground shadow-2xl !top-[min(5vh,1.5rem)] !translate-y-0 sm:w-[min(94vw,34rem)] sm:max-w-[min(94vw,34rem)]"
      >
        <DialogHeader className="shrink-0 space-y-1.5 border-b border-border bg-card px-5 py-3 text-left sm:py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Documentos de</p>
          <p className="text-lg font-semibold leading-tight text-foreground">{revieweeName || "—"}</p>
          <DialogTitle className="text-base font-semibold text-foreground">{title}</DialogTitle>
          {showSlideNav ? (
            <p className="text-xs text-muted-foreground">
              {activeIndex + 1} de {slides.length} · Usa las flechas para cambiar de documento
            </p>
          ) : null}
        </DialogHeader>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-background px-2 py-2 sm:px-3">
          <div className="flex h-full min-h-0 items-stretch gap-1 sm:gap-2">
            {showSlideNav ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!canPrevSlide}
                className="h-28 max-h-[min(28vh,200px)] w-9 shrink-0 self-center border-border bg-card shadow-sm hover:bg-muted disabled:opacity-40 sm:h-32 sm:w-10"
                aria-label="Documento anterior"
                onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            ) : null}

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-border bg-muted/30 p-2 shadow-inner [scrollbar-gutter:stable]">
              <div className="mx-auto min-h-0 max-w-full rounded-md bg-white p-2 shadow-sm ring-1 ring-border/60 dark:bg-white">
                {viewerBody}
              </div>
            </div>

            {showSlideNav ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!canNextSlide}
                className="h-28 max-h-[min(28vh,200px)] w-9 shrink-0 self-center border-border bg-card shadow-sm hover:bg-muted disabled:opacity-40 sm:h-32 sm:w-10"
                aria-label="Documento siguiente"
                onClick={() => setActiveIndex((i) => Math.min(slides.length - 1, i + 1))}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            ) : null}
          </div>
        </div>

        {src ? (
          <DialogFooter className="shrink-0 border-t border-border bg-card px-5 py-3 sm:justify-between">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" asChild>
              <a href={src} target="_blank" rel="noopener noreferrer">
                Abrir en pestaña nueva
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter className="shrink-0 border-t border-border bg-card px-5 py-3 sm:justify-between">
            <div />
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
