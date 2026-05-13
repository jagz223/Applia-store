import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";

/**
 * SUV / camioneta / van (pasajeros extra o envíos voluminosos).
 * Silueta lateral distinta del icono «camión» de carga (semirremolque).
 */
export const CamionetaVehicleIcon = forwardRef<SVGSVGElement, LucideProps>(function CamionetaVehicleIcon(
  { className, size = 24, strokeWidth = 2, absoluteStrokeWidth, ...rest },
  ref
) {
  const px = typeof size === "number" ? size : Number(size) || 24;
  const sw = absoluteStrokeWidth ? Number(strokeWidth) : Number(strokeWidth) || 2;
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...rest}
    >
      <ellipse cx="6.8" cy="16.8" rx="2.15" ry="2.15" />
      <ellipse cx="17.2" cy="16.8" rx="2.15" ry="2.15" />
      <path d="M3 17V12.5l1.2-.9h2.1L7.4 8h6.2l1.1 3.6H17l2.1.9V17" />
      <path d="M7.4 8 8.6 5.2h4.6L14.4 8" />
      <path d="M13.6 11.6h3.2l1.6.9" opacity="0.45" />
    </svg>
  );
});
