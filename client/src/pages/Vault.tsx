import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Shield, 
  Lock, 
  Folder, 
  FileText, 
  Upload, 
  Download, 
  Trash2, 
  Eye, 
  EyeOff,
  Key,
  Clock,
  CheckCircle,
  AlertTriangle,
  Search,
  Filter,
  Plus,
  File,
  Image,
  FileCheck,
  CreditCard,
  User,
  Building2,
  Search as SearchIcon
} from "lucide-react";
import { motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";

// Mock data
const documents = [
  { 
    id: 1, 
    name: "Contrato de Prestación de Servicios.pdf", 
    type: "contract", 
    size: "2.4 MB",
    date: "22 Feb 2026",
    encrypted: true,
    status: "verified"
  },
  { 
    id: 2, 
    name: "Factura_2026_0156.pdf", 
    type: "invoice", 
    size: "156 KB",
    date: "20 Feb 2026",
    encrypted: true,
    status: "verified"
  },
  { 
    id: 3, 
    name: "Cédula_Identidad.jpg", 
    type: "identity", 
    size: "3.2 MB",
    date: "15 Feb 2026",
    encrypted: true,
    status: "verified"
  },
  { 
    id: 4, 
    name: "Póliza_Seguro_2026.pdf", 
    type: "insurance", 
    size: "1.8 MB",
    date: "10 Feb 2026",
    encrypted: true,
    status: "pending"
  },
  { 
    id: 5, 
    name: "Acta_Constitutiva.pdf", 
    type: "legal", 
    size: "4.5 MB",
    date: "05 Feb 2026",
    encrypted: true,
    status: "verified"
  },
];

const folders = [
  { id: 1, name: "Contratos", count: 12, icon: FileCheck },
  { id: 2, name: "Facturación", count: 48, icon: CreditCard },
  { id: 3, name: "Identificación", count: 5, icon: User },
  { id: 4, name: "Legales", count: 8, icon: Building2 },
  { id: 5, name: "Seguros", count: 3, icon: Shield },
];

export default function Vault() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showEncryption, setShowEncryption] = useState(true);
  const isMobile = useIsMobile();

  const getFileIcon = (type: string) => {
    switch (type) {
      case "contract":
        return <FileCheck className="w-5 h-5 text-primary" />;
      case "invoice":
        return <CreditCard className="w-5 h-5 text-accent" />;
      case "identity":
        return <User className="w-5 h-5 text-secondary" />;
      case "legal":
        return <Building2 className="w-5 h-5 text-warning" />;
      case "insurance":
        return <Shield className="w-5 h-5 text-primary" />;
      default:
        return <FileText className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return <Badge className="badge-success"><CheckCircle className="w-3 h-3 mr-1" />Verificado</Badge>;
      case "pending":
        return <Badge className="badge-warning"><Clock className="w-3 h-3 mr-1" />Pendiente</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredDocs = documents.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || doc.type === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/20 via-background to-accent/20 border-b border-border">
        <div className="absolute inset-0 grid-pattern opacity-30"></div>
        <div className="container px-4 py-12 mx-auto max-w-7xl relative">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-xl bg-primary/20 glow-primary">
                <Shield className="w-8 h-8 text-primary" />
              </div>
              <div>
                <Badge variant="outline" className="border-primary/50 text-primary mb-2">
                  <Lock className="w-3 h-3 mr-1" />
                  Cifrado AES-256
                </Badge>
                <h1 className="text-3xl font-display font-bold">
                  Bóveda <span className="text-gradient-primary">Segura</span>
                </h1>
              </div>
            </div>
            <p className="text-muted-foreground max-w-2xl">
              Almacena y gestiona tus documentos y contratos de forma segura con cifrado de grado militar. 
              Acceso protegido con autenticación de dos factores.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Security Status */}
      <section className="py-6 border-b border-border">
        <div className="container px-4 mx-auto max-w-7xl">
          <div className="grid md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-accent/5 border border-accent/20">
              <div className="p-2 rounded-lg bg-accent/10">
                <Lock className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estado de Seguridad</p>
                <p className="font-medium text-accent">Protegido</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
              <div className="p-2 rounded-lg bg-primary/10">
                <Key className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cifrado</p>
                <p className="font-medium">AES-256</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
              <div className="p-2 rounded-lg bg-primary/10">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Documentos</p>
                <p className="font-medium">{documents.length} archivos</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-accent/5 border border-accent/20">
              <div className="p-2 rounded-lg bg-accent/10">
                <CheckCircle className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Verificados</p>
                <p className="font-medium">{documents.filter(d => d.status === 'verified').length} archivos</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content — ancho máximo y centrado para que no se alargue a la derecha */}
      <section className="py-8">
        <div className="container px-4 mx-auto max-w-7xl flex justify-center">
          <div className="w-full max-w-4xl min-w-0 overflow-hidden">
          <Tabs defaultValue="documents" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-4">
              <TabsList className="bg-card border border-border w-full sm:w-auto flex-nowrap overflow-x-auto min-h-10 h-auto py-1 px-1 gap-0 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-muted/50 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
                <TabsTrigger value="documents" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shrink-0 px-3 py-2 text-sm">
                  <FileText className="w-4 h-4 mr-2 shrink-0" />
                  Documentos
                </TabsTrigger>
                <TabsTrigger value="folders" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shrink-0 px-3 py-2 text-sm">
                  <Folder className="w-4 h-4 mr-2 shrink-0" />
                  Carpetas
                </TabsTrigger>
                <TabsTrigger value="shared" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shrink-0 px-3 py-2 text-sm">
                  <Shield className="w-4 h-4 mr-2 shrink-0" />
                  Compartidos
                </TabsTrigger>
              </TabsList>

              <div className="flex flex-wrap gap-3 justify-center sm:justify-end">
                <div className="relative w-full sm:w-auto">
                  <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar documentos..." 
                    className="input-industrial pl-10 w-full sm:w-[250px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button className="bg-accent hover:bg-accent/90 w-full sm:w-auto">
                  <Upload className="w-4 h-4 mr-2" />
                  Subir Archivo
                </Button>
              </div>
            </div>

            <TabsContent value="documents" className="space-y-6">
              {/* Category Filters */}
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  { id: "all", label: "Todos" },
                  { id: "contract", label: "Contratos" },
                  { id: "invoice", label: "Facturas" },
                  { id: "identity", label: "Identificación" },
                  { id: "legal", label: "Legales" },
                  { id: "insurance", label: "Seguros" },
                ].map((cat) => (
                  <Button
                    key={cat.id}
                    variant={selectedCategory === cat.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={selectedCategory === cat.id ? "bg-primary" : "border-border"}
                  >
                    {cat.label}
                  </Button>
                ))}
              </div>

              {/* Documents List */}
              <Card className="card-industrial min-w-0 overflow-hidden">
                <CardContent className="p-0 min-w-0">
                  <div className="divide-y divide-border min-w-0">
                    {filteredDocs.map((doc) => {
                      const infoBlock = (
                        <>
                          <div className="p-2 rounded-lg bg-primary/10 shrink-0 self-start sm:self-center">
                            {getFileIcon(doc.type)}
                          </div>
                          <div className="min-w-0 flex-1 flex flex-col gap-1">
                            <p 
                              className="font-medium text-foreground truncate text-sm sm:text-base" 
                              title={!isMobile ? doc.name : undefined}
                            >
                              {doc.name}
                            </p>
                            <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground flex-nowrap min-w-0 overflow-x-auto [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20">
                              <span className="shrink-0">{doc.size}</span>
                              <span className="shrink-0 text-muted-foreground/70">·</span>
                              <span className="shrink-0">{doc.date}</span>
                              {doc.encrypted && (
                                <>
                                  <span className="shrink-0 text-muted-foreground/70">·</span>
                                  <span className="flex items-center gap-1 text-accent shrink-0">
                                    <Lock className="w-3 h-3 flex-shrink-0" />
                                    <span>Cifrado</span>
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </>
                      );
                      return (
                        <div 
                          key={doc.id}
                          className="flex items-center gap-3 sm:gap-4 p-4 hover:bg-primary/5 transition-colors min-w-0"
                        >
                          {isMobile ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="flex items-center gap-3 min-w-0 flex-1 text-left outline-none rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                  {infoBlock}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent 
                                side="top" 
                                align="start" 
                                className="w-[min(calc(100vw-2rem),320px)] p-3 rounded-xl shadow-lg border bg-popover"
                              >
                                <div className="space-y-2 text-sm">
                                  <p className="font-medium text-foreground break-words leading-snug">
                                    {doc.name}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                                    <span>{doc.size}</span>
                                    <span>·</span>
                                    <span>{doc.date}</span>
                                    {doc.encrypted && (
                                      <>
                                        <span>·</span>
                                        <span className="flex items-center gap-1 text-accent">
                                          <Lock className="w-3 h-3" />
                                          Cifrado
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <div className="flex items-center gap-4 min-w-0 flex-1">
                              {infoBlock}
                            </div>
                          )}
                          <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-shrink-0">
                            {getStatusBadge(doc.status)}
                            <div className="flex gap-0.5 sm:gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Download className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {filteredDocs.length === 0 && (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">No se encontraron documentos</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="folders">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {folders.map((folder) => (
                  <Card key={folder.id} className="card-industrial hover:border-primary/50 cursor-pointer transition-all">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-lg bg-primary/10">
                          <folder.icon className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{folder.name}</p>
                          <p className="text-sm text-muted-foreground">{folder.count} archivos</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <Card className="card-industrial border-dashed hover:border-primary/50 cursor-pointer transition-all">
                  <CardContent className="p-6 flex items-center justify-center">
                    <div className="text-center">
                      <Plus className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Nueva Carpeta</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="shared">
              <Card className="card-industrial">
                <CardContent className="py-12 text-center">
                  <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">Documentos compartidos con terceros</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Comparte documentos de forma segura con clientes o socios
                  </p>
                  <Button className="mt-4 bg-primary">
                    <Plus className="w-4 h-4 mr-2" />
                    Crear Enlace Compartido
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          </div>
        </div>
      </section>
    </div>
  );
}
