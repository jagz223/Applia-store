import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DownloadAppButton() {
  return (
    <div className="pt-4 mt-4 border-t border-border/50 text-center">
      <p className="text-xs text-muted-foreground mb-3">
        ¿Prefieres usar nuestra App?
      </p>
      <a 
        href="/Applia.apk" 
        download="Applia.apk"
        className="inline-block w-full group"
      >
        <Button 
          variant="outline" 
          className="w-full flex items-center justify-center gap-2 border-mango-orange/30 hover:border-mango-orange hover:bg-mango-orange/5 transition-all duration-300 py-6"
        >
          <div className="bg-mango-orange p-1.5 rounded-md text-white group-hover:scale-110 transition-transform">
            <Smartphone size={18} />
          </div>
          <div className="text-left">
            <p className="text-[10px] leading-none uppercase font-bold opacity-70">Descargar para</p>
            <p className="text-sm font-bold">Android (APK)</p>
          </div>
        </Button>
      </a>
      <p className="text-[10px] text-muted-foreground mt-2 px-4">
        * Para instalar, activa "Fuentes desconocidas" en la configuración de tu teléfono.
      </p>
    </div>
  );
}
