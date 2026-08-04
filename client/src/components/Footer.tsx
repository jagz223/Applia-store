import { Link } from "wouter";
import { Heart } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-background border-t border-border/50 mt-auto">
      <div className="container mx-auto px-4 py-12 md:py-16 max-w-7xl">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background p-0.5 ring-1 ring-border" aria-hidden>
                <img
                  src="/genfeb-logo-new.png"
                  alt=""
                  className="h-full w-full object-contain"
                  width={32}
                  height={32}
                  decoding="async"
                />
              </span>
              <span className="text-xl font-bold font-display text-primary">GENFEB</span>
            </Link>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-xs">
              Tu tienda online. Simple, rápido y confiable.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-foreground mb-4">Soporte</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <Link href="/politics" className="hover:text-primary transition-colors">
                  Términos y Condiciones
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border/50 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} GenFeb. Todos los derechos reservados.</p>
          <div className="flex items-center gap-1">
            <span>Hecho con</span>
            <Heart className="h-4 w-4 text-red-500 fill-red-500" />
            <span>para la comunidad</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
