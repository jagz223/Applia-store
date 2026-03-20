import { Link } from "wouter";
import { Facebook, Twitter, Instagram, Linkedin, Heart } from "lucide-react";
import { useShowBecomePro } from "@/hooks/use-show-become-pro";

export function Footer() {
  const showBecomePro = useShowBecomePro();
  // "Suscríbete" oculto en todo el sitio (requisito UI).
  const hideNewsletterAlways = true;

  return (
    <footer className="bg-white border-t border-border/50 mt-auto">
      <div className="container mx-auto px-4 py-12 md:py-16 max-w-7xl">
        <div className={`grid grid-cols-1 gap-12 md:grid-cols-3`}>
          
          {/* Brand */}
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <img src="/logo GenFeb.jpg" alt="GENFEB" className="h-8 w-auto" />
              <span className="text-xl font-bold font-display text-primary">GENFEB</span>
            </Link>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-xs">
              Conectándote con los mejores asociados y servicios técnicos de la ciudad. Simple, rápido y confiable.
            </p>
            <div className="flex gap-4">
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors"><Facebook className="h-5 w-5" /></a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors"><Twitter className="h-5 w-5" /></a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors"><Instagram className="h-5 w-5" /></a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors"><Linkedin className="h-5 w-5" /></a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-bold text-foreground mb-4">Plataforma</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/explore" className="hover:text-primary transition-colors">Explorar Servicios</Link></li>
              <li><Link href="/categories" className="hover:text-primary transition-colors">Categorías</Link></li>
              {showBecomePro && <li><Link href="/become-pro" className="hover:text-primary transition-colors">Conviértete en Asociado</Link></li>}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-bold text-foreground mb-4">Soporte</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <Link href="/chat?support=1" className="hover:text-primary transition-colors">
                  Centro de Ayuda
                </Link>
              </li>
            </ul>
          </div>

          {/* Newsletter (Visual Only) - oculto */}
          {hideNewsletterAlways ? null : null}
        </div>

        <div className="mt-12 pt-8 border-t border-border/50 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} GenFeb S.A.S. Todos los derechos reservados.</p>
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
