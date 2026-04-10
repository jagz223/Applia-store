import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProviderTermsOfUseContent } from "@/constants/provider-terms-of-use-es";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";

export default function Politics() {
  const [, setLocation] = useLocation();

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation("/");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <Button 
          variant="ghost" 
          onClick={handleBack}
          className="mb-8 hover:bg-primary/10 group transition-all"
        >
          <ArrowLeft className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          Volver
        </Button>

        <Card className="border-border/50 shadow-2xl overflow-hidden backdrop-blur-sm bg-card/95">
          <CardHeader className="border-b border-border/50 bg-muted/30 px-6 py-8 sm:px-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </div>
              <Badge variant="outline" className="border-primary/30 text-primary">Legal</Badge>
            </div>
            <CardTitle className="text-3xl font-display font-bold text-foreground leading-tight">
              Términos y Condiciones de Uso
            </CardTitle>
            <CardDescription className="text-base mt-2">
              Estatuto oficial de GenFeb - Última actualización: Marzo 2026
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 py-10 sm:px-10">
            <div className="prose prose-sm sm:prose-base max-w-none prose-headings:font-display prose-headings:font-bold prose-p:text-muted-foreground prose-strong:text-foreground">
              <ProviderTermsOfUseContent />
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} GenFeb. Todos los derechos reservados.</p>
        </div>
      </div>
    </div>
  );
}

