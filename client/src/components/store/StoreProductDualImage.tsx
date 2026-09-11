import { ImageIcon } from "lucide-react";
import { storeTransparentImageSurfaceStyle } from "@/components/store/store-admin-ui";
import { cn } from "@/lib/utils";

type StoreProductDualImageProps = {
  primaryUrl?: string | null;
  secondaryUrl?: string | null;
  className?: string;
  /** Clases del contenedor (aspecto, redondeo, etc.). */
  frameClassName?: string;
  imgClassName?: string;
  /** Tamaño del cuadrito inferior derecho. */
  secondaryClassName?: string;
  placeholderClassName?: string;
  alt?: string;
  onClick?: () => void;
  /** Si true, el thumb es botón (p. ej. swap en lightbox). */
  onSecondaryClick?: () => void;
  loading?: "lazy" | "eager";
  /** Damero para comprobar PNG sin fondo (p. ej. preview del recorte en admin). */
  checkerboard?: boolean;
};

/**
 * Imagen principal con segunda imagen opcional en esquina inferior derecha.
 * Fondo `bg-background` (sigue el tema) para PNG/WebP sin fondo.
 * `object-contain` para no recortar productos recortados.
 */
export function StoreProductDualImage({
  primaryUrl,
  secondaryUrl,
  className,
  frameClassName,
  imgClassName,
  secondaryClassName,
  placeholderClassName,
  alt = "",
  onClick,
  onSecondaryClick,
  loading = "lazy",
  checkerboard = false,
}: StoreProductDualImageProps) {
  const surfaceStyle = checkerboard ? storeTransparentImageSurfaceStyle : undefined;
  const surfaceClass = checkerboard ? undefined : "bg-background";
  const primary = primaryUrl?.trim() || null;
  const secondary = secondaryUrl?.trim() || null;
  const showSecondary = Boolean(primary && secondary && secondary !== primary);

  const content = (
    <>
      {primary ? (
        <img
          src={primary}
          alt={alt}
          className={cn("h-full w-full object-contain", imgClassName)}
          loading={loading}
          referrerPolicy="no-referrer"
          draggable={false}
        />
      ) : (
        <div
          className={cn(
            "flex h-full w-full items-center justify-center text-muted-foreground/50",
            surfaceClass,
            placeholderClassName,
          )}
        >
          <ImageIcon className="h-8 w-8 sm:h-10 sm:w-10" aria-hidden />
        </div>
      )}
      {showSecondary ? (
        onSecondaryClick ? (
          <button
            type="button"
            className={cn(
              "absolute bottom-1.5 right-1.5 z-10 overflow-hidden rounded-md border-2 border-border shadow-md",
              surfaceClass,
              "h-11 w-11 sm:h-12 sm:w-12",
              "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              secondaryClassName,
            )}
            style={surfaceStyle}
            aria-label="Intercambiar imagen"
            onClick={(e) => {
              e.stopPropagation();
              onSecondaryClick();
            }}
          >
            <img
              src={secondary!}
              alt=""
              className="h-full w-full object-contain"
              loading={loading}
              referrerPolicy="no-referrer"
              draggable={false}
            />
          </button>
        ) : (
          <div
            className={cn(
              "pointer-events-none absolute bottom-1.5 right-1.5 z-10 overflow-hidden rounded-md border-2 border-border shadow-md",
              surfaceClass,
              "h-9 w-9 sm:h-11 sm:w-11",
              secondaryClassName,
            )}
            style={surfaceStyle}
            aria-hidden
          >
            <img
              src={secondary!}
              alt=""
              className="h-full w-full object-contain"
              loading={loading}
              referrerPolicy="no-referrer"
              draggable={false}
            />
          </div>
        )
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        className={cn(
          "relative block w-full cursor-pointer overflow-hidden text-left",
          surfaceClass,
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          frameClassName,
          className,
        )}
        style={surfaceStyle}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        aria-label={alt ? `Ver imagen de ${alt}` : "Ver imagen ampliada"}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      className={cn("relative overflow-hidden", surfaceClass, frameClassName, className)}
      style={surfaceStyle}
    >
      {content}
    </div>
  );
}
