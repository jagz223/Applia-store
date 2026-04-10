import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Search as SearchIcon,
  Receipt,
  Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";
import { useWalletTransfers } from "@/hooks/use-mango-data";
import { downloadInvoicePdf, getTransferTypeLabel, type TransferForInvoice } from "@/lib/invoice-pdf";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

const folders = [
  { id: 1, name: "Contratos", count: 12, icon: FileCheck },
  { id: 2, name: "Facturación", count: 48, icon: CreditCard },
  { id: 3, name: "Identificación", count: 5, icon: User },
  { id: 4, name: "Legales", count: 8, icon: Building2 },
  { id: 5, name: "Seguros", count: 3, icon: Shield },
];

function formatTransferDate(value: unknown): string {
  if (value == null) return "—";
  const d = typeof value === "string" ? new Date(value) : value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(d.getTime()) ? format(d, "dd MMM yyyy HH:mm", { locale: es }) : "—";
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(amount);
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, idx);
  const decimals = idx === 0 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[idx]}`;
}

function formatVaultDate(value: unknown): string {
  if (value == null) return "—";
  const d =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : new Date(String(value));
  return Number.isFinite(d.getTime()) ? format(d, "dd MMM yyyy", { locale: es }) : "—";
}

export default function Vault() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showEncryption, setShowEncryption] = useState(true);
  const [transfersPage, setTransfersPage] = useState(1);
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { toast } = useToast();
  const [hasUserIdentification, setHasUserIdentification] = useState(false);

  const [viewIdentificationOpen, setViewIdentificationOpen] = useState(false);
  const [viewIdentificationLoading, setViewIdentificationLoading] = useState(false);
  const [viewIdentificationImageUrl, setViewIdentificationImageUrl] = useState<string | null>(null);
  const { data: transfersData, isLoading: transfersLoading } = useWalletTransfers({
    page: transfersPage,
    limit: 10,
    // En "Todos" también mostramos Facturas para conservar la opción de descargar.
    enabled: selectedCategory === "invoice" || selectedCategory === "all",
  });
  const transfers = transfersData?.transfers ?? [];
  const transfersTotal = transfersData?.total ?? 0;
  const transfersTotalPages = Math.max(1, Math.ceil(transfersTotal / 10));

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

  type VaultDocumentApi = {
    id: number | string;
    name: string;
    type: string;
    size?: number;
    mimeType?: string;
    encryptedPath?: string;
    status?: string;
    uploadedAt?: unknown;
  };

  type VaultDocumentUi = {
    id: number;
    name: string;
    type: string;
    size: string;
    date: string;
    encrypted: boolean;
    status: string;
  };

  const {
    data: vaultDocumentsApi,
    isLoading: vaultDocsLoading,
    isError: vaultDocsError,
  } = useQuery<VaultDocumentApi[]>({
    queryKey: ["vault-documents", String(user?.id ?? "anon")],
    enabled: !!user?.id,
    retry: false,
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/documents", {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "x-user-id": String(user?.id ?? ""),
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudieron cargar documentos");
      }
      return (await res.json()) as VaultDocumentApi[];
    },
  });

  const vaultDocuments: VaultDocumentUi[] = (vaultDocumentsApi ?? []).map((doc) => ({
    id: typeof doc.id === "number" ? doc.id : Number(doc.id),
    name: String(doc.name ?? ""),
    type: String(doc.type ?? "other"),
    size: typeof doc.size === "number" ? formatBytes(doc.size) : "—",
    date: formatVaultDate(doc.uploadedAt),
    encrypted: Boolean(doc.encryptedPath),
    status: String(doc.status ?? "pending"),
  }));

  const handleViewIdentification = async () => {
    if (!user?.id) return;
    try {
      setViewIdentificationLoading(true);
      setViewIdentificationImageUrl(null);

      const token = localStorage.getItem("token");
      const res = await fetch("/api/me/professional-verification", {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "No se pudo cargar la identificación");
      }

      const data = (await res.json()) as { imageUrl?: string | null };
      setViewIdentificationImageUrl(data.imageUrl ?? null);
      setViewIdentificationOpen(true);
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo cargar la identificación",
        variant: "destructive",
      });
    } finally {
      setViewIdentificationLoading(false);
    }
  };

  // Mostrar la pestaña/filtro "Identificación" solo si existe user_identification
  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/me/professional-verification", {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!res.ok) {
          setHasUserIdentification(false);
          return;
        }

        const data = (await res.json()) as { imageUrl?: string | null };
        setHasUserIdentification(Boolean(data.imageUrl?.trim()));
      } catch {
        setHasUserIdentification(false);
      }
    };

    load();
  }, [user?.id]);

  useEffect(() => {
    if (selectedCategory === "identity" && !hasUserIdentification) {
      setSelectedCategory("all");
    }
  }, [selectedCategory, hasUserIdentification]);

  const filteredDocs = vaultDocuments.filter((doc) => {
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());
    // En "Todos" la "factura" se muestra desde la lista de transacciones (Facturas),
    // por eso excluimos type="invoice" del listado de documentos para evitar duplicados.
    const matchesCategory =
      selectedCategory === "all"
        ? doc.type !== "invoice"
        : doc.type === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Página de documentos/comprobantes: ocultar pestañas/UI específicas (Carpetas/Compartidos/Buscar y subidas)
  // y ocultar filtros/subpestañas: Contratos, Legales, Seguros.
  const SHOW_VAULT_DOCUMENTS_TAB = false;
  const SHOW_VAULT_FOLDERS_TAB = false;
  const SHOW_VAULT_SHARED_TAB = false;
  const SHOW_VAULT_SEARCH_UPLOAD = false;

  const SHOW_VAULT_TABS_LIST = SHOW_VAULT_DOCUMENTS_TAB || SHOW_VAULT_FOLDERS_TAB || SHOW_VAULT_SHARED_TAB;

  useEffect(() => {
    const hiddenCategories = new Set(["contract", "legal", "insurance"]);
    if (hiddenCategories.has(selectedCategory)) setSelectedCategory("all");
  }, [selectedCategory]);

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
                  Mis <span className="text-gradient-primary">documentos</span>
                </h1>
              </div>
            </div>
            <p className="text-muted-foreground max-w-2xl">
              Consulta tus comprobantes y facturas de la plataforma, y mantén a mano la documentación que subas a tu cuenta.
              La información sensible se trata con medidas de protección acordes al servicio.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Panel superior oculto */}
      {false && (
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
            </div>
          </div>
        </section>
      )}

      {/* Main Content — ancho máximo y centrado para que no se alargue a la derecha */}
      <section className="py-8">
        <div className="container px-4 mx-auto max-w-7xl flex justify-center">
          <div className="w-full max-w-4xl min-w-0 overflow-hidden">
          <Tabs defaultValue="documents" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-4">
              {SHOW_VAULT_TABS_LIST && (
                <TabsList className="bg-card border border-border w-full sm:w-auto flex-nowrap overflow-x-auto min-h-10 h-auto py-1 px-1 gap-0 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-muted/50 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
                  {SHOW_VAULT_DOCUMENTS_TAB && (
                    <TabsTrigger value="documents" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shrink-0 px-3 py-2 text-sm">
                      <FileText className="w-4 h-4 mr-2 shrink-0" />
                      Documentos
                    </TabsTrigger>
                  )}
                  {SHOW_VAULT_FOLDERS_TAB && (
                    <TabsTrigger value="folders" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shrink-0 px-3 py-2 text-sm">
                      <Folder className="w-4 h-4 mr-2 shrink-0" />
                      Carpetas
                    </TabsTrigger>
                  )}
                  {SHOW_VAULT_SHARED_TAB && (
                    <TabsTrigger value="shared" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shrink-0 px-3 py-2 text-sm">
                      <Shield className="w-4 h-4 mr-2 shrink-0" />
                      Compartidos
                    </TabsTrigger>
                  )}
                </TabsList>
              )}

              {SHOW_VAULT_SEARCH_UPLOAD && (
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
              )}
            </div>

            <TabsContent value="documents" className="space-y-6">
              {/* Category Filters */}
              <div className="flex flex-wrap gap-3 justify-center items-center">
                {[
                  { id: "all", label: "Todos" },
                  { id: "invoice", label: "Facturas" },
                  ...(hasUserIdentification ? [{ id: "identity", label: "Identificación" }] : []),
                ].map((cat) => (
                  <Button
                    key={cat.id}
                    variant={selectedCategory === cat.id ? "default" : "outline"}
                    size="default"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={selectedCategory === cat.id ? undefined : "border-border"}
                  >
                    {cat.label}
                  </Button>
                ))}
              </div>

              {/* Sección Facturas (transacciones) */}
              {(selectedCategory === "invoice" || selectedCategory === "all") && (
                <>
                  <Card className="card-industrial min-w-0 overflow-hidden">
                    <CardContent className="p-0 min-w-0">
                      {transfersLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                          <Loader2 className="w-8 h-8 animate-spin" />
                          <p className="text-sm">Cargando transacciones…</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-border min-w-0">
                          {transfers.map((t: TransferForInvoice & { id: number; status?: string }) => {
                            const label = getTransferTypeLabel(t.transferType);
                            return (
                              <div
                                key={t.id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-primary/5 transition-colors min-w-0"
                              >
                                <div className="flex items-start gap-3 min-w-0">
                                  <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                                    <Receipt className="w-5 h-5 text-primary" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-foreground text-sm sm:text-base">{label}</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {t.description?.trim() || "Sin descripción"}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {formatTransferDate(t.createdAt)} · {formatAmount(t.amount)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {t.status && (
                                    <Badge
                                      variant={
                                        t.status === "completed"
                                          ? "default"
                                          : t.status === "rejected"
                                            ? "destructive"
                                            : "secondary"
                                      }
                                    >
                                      {t.status === "pending_approval"
                                        ? "Pendiente"
                                        : t.status === "completed"
                                          ? "Completado"
                                          : "Rechazado"}
                                    </Badge>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      user &&
                                      downloadInvoicePdf(
                                        {
                                          id: t.id,
                                          amount: t.amount,
                                          transferType: t.transferType,
                                          description: t.description,
                                          createdAt: t.createdAt,
                                          status: t.status,
                                        },
                                        {
                                          firstName: user.firstName,
                                          lastName: user.lastName,
                                          name: (user as { name?: string }).name,
                                          email: user.email,
                                        }
                                      )
                                    }
                                    disabled={!user}
                                  >
                                    <Download className="w-4 h-4 mr-2" />
                                    Generar factura
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  {!transfersLoading && transfers.length === 0 && (
                    <div className="text-center py-12">
                      <Receipt className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <p className="text-muted-foreground">No hay transacciones para facturar</p>
                    </div>
                  )}
                  {!transfersLoading && transfers.length > 0 && transfersTotalPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-xs text-muted-foreground">
                        Página {transfersPage} de {transfersTotalPages}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={transfersPage <= 1}
                          onClick={() => setTransfersPage((p) => Math.max(1, p - 1))}
                        >
                          Anterior
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={transfersPage >= transfersTotalPages}
                          onClick={() => setTransfersPage((p) => Math.min(transfersTotalPages, p + 1))}
                        >
                          Siguiente
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Sección Documentos */}
              {selectedCategory !== "invoice" && (
                <Card className="card-industrial min-w-0 overflow-hidden">
                  <CardContent className="p-0 min-w-0">
                    <div className="divide-y divide-border min-w-0">
                      {selectedCategory === "identity" && hasUserIdentification && (
                        <div className="flex items-center gap-3 sm:gap-4 p-4 hover:bg-primary/5 transition-colors min-w-0">
                          <div className="p-2 rounded-lg bg-primary/10 shrink-0 self-start sm:self-center">
                            <User className="w-5 h-5 text-secondary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground text-sm sm:text-base">Ver identificación</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Muestra la imagen que tienes registrada para verificación.
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleViewIdentification}
                              disabled={viewIdentificationLoading}
                            >
                              {viewIdentificationLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              ) : (
                                <Eye className="w-4 h-4 mr-2" />
                              )}
                              ver identificación
                            </Button>
                          </div>
                        </div>
                      )}
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
              )}

              {!vaultDocsLoading && selectedCategory !== "invoice" && filteredDocs.length === 0 && (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">No se encontraron documentos</p>
                </div>
              )}
            </TabsContent>

            <Dialog open={viewIdentificationOpen} onOpenChange={setViewIdentificationOpen}>
              <DialogContent className="sm:max-w-3xl border-border bg-card">
                <DialogHeader>
                  <DialogTitle>Identificación</DialogTitle>
                  <DialogDescription>
                    {viewIdentificationImageUrl
                      ? "Tu documento registrado para verificación."
                      : "Aún no tienes una identificación registrada."}
                  </DialogDescription>
                </DialogHeader>
                {viewIdentificationImageUrl ? (
                  <div className="w-full">
                    <img
                      src={viewIdentificationImageUrl}
                      alt="Identificación"
                      className="w-full max-h-[70vh] object-contain rounded-md border border-border bg-background"
                    />
                  </div>
                ) : (
                  <div className="py-6 text-sm text-muted-foreground text-center">
                    No hay imagen disponible.
                  </div>
                )}
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setViewIdentificationOpen(false)} disabled={viewIdentificationLoading}>
                    Cerrar
                  </Button>
                  <Button
                    asChild
                    onClick={() => setViewIdentificationOpen(false)}
                    disabled={viewIdentificationLoading}
                  >
                    <Link href="/professional/verify">Ir a verificar</Link>
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {SHOW_VAULT_FOLDERS_TAB && (
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
            )}

            {SHOW_VAULT_SHARED_TAB && (
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
            )}
          </Tabs>
          </div>
        </div>
      </section>
    </div>
  );
}
