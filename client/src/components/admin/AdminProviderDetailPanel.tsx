import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, FileText, Loader2, Save } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useSubcategories } from "@/hooks/use-mango-data";
import { AdminProviderServiceEditorCard } from "@/components/admin/AdminProviderServiceEditorCard";
import { AdminProviderCategorySlotServices } from "@/components/admin/AdminProviderCategorySlotServices";
import {
  AdminVerificationDocumentDialog,
  type AdminVerificationSlide,
} from "@/components/admin/AdminVerificationDocumentDialog";
import {
  buildProviderDetailPatchBody,
  fetchAdminProviderDetail,
  patchAdminProviderDetail,
  snapshotKey,
  toDatetimeLocalValue,
  type AdminProviderDetailPayload,
} from "@/components/admin/admin-provider-detail-lib";

export type { AdminProviderDetailPayload } from "@/components/admin/admin-provider-detail-lib";

type Props = {
  providerId: number;
  canEdit: boolean;
  returnHref: string;
  /** Abre el visor de documentos al cargar (p. ej. desde listado con ?docs=1). */
  initialDocumentsOpen?: boolean;
};

export function AdminProviderDetailPanel({
  providerId,
  canEdit,
  returnHref,
  initialDocumentsOpen = false,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<AdminProviderDetailPayload | null>(null);
  const [subscriptionEndsLocal, setSubscriptionEndsLocal] = useState("");
  const [baselineKey, setBaselineKey] = useState<string | null>(null);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(initialDocumentsOpen);

  useEffect(() => {
    if (initialDocumentsOpen) {
      setDocumentsOpen(true);
    }
  }, [initialDocumentsOpen]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-provider-detail", providerId],
    queryFn: () => fetchAdminProviderDetail(providerId),
    enabled: providerId > 0,
    staleTime: 0,
  });

  useEffect(() => {
    if (data) {
      const nextDraft = structuredClone(data);
      const subEnd = toDatetimeLocalValue(data.provider.visibilitySubscriptionEndsAt);
      setDraft(nextDraft);
      setSubscriptionEndsLocal(subEnd);
      setBaselineKey(snapshotKey(nextDraft, subEnd));
    }
  }, [data]);

  const isDirty = useMemo(() => {
    if (!draft || baselineKey == null) return false;
    return snapshotKey(draft, subscriptionEndsLocal) !== baselineKey;
  }, [draft, subscriptionEndsLocal, baselineKey]);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const requestLeave = useCallback(() => {
    if (isDirty) {
      setDiscardDialogOpen(true);
      return false;
    }
    return true;
  }, [isDirty]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Sin datos");
      return patchAdminProviderDetail(providerId, buildProviderDetailPatchBody(draft, subscriptionEndsLocal));
    },
    onSuccess: async () => {
      toast({ title: "Guardado", description: "Los datos del asociado se actualizaron." });
      await queryClient.invalidateQueries({ queryKey: ["admin-active-services"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-provider-detail", providerId] });
      const refreshed = await refetch();
      if (refreshed.data) {
        const nextDraft = structuredClone(refreshed.data);
        const subEnd = toDatetimeLocalValue(refreshed.data.provider.visibilitySubscriptionEndsAt);
        setDraft(nextDraft);
        setSubscriptionEndsLocal(subEnd);
        setBaselineKey(snapshotKey(nextDraft, subEnd));
      } else if (draft) {
        setBaselineKey(snapshotKey(draft, subscriptionEndsLocal));
      }
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const { data: primarySubs = [] } = useSubcategories(draft?.provider.categoryId ?? undefined);
  const goBrandSet = useMemo(() => new Set(draft?.provider.goBrands ?? []), [draft?.provider.goBrands]);

  const verificationSlides = useMemo((): AdminVerificationSlide[] => {
    const vd = draft?.verificationDocuments;
    if (!vd) return [];
    const credTitle =
      vd.providerCategorySlug === "transport" ? "Licencia de conducir" : "Documento profesional";
    return [
      { id: "avatar", title: "Foto de perfil", src: vd.avatar },
      { id: "id", title: "Identificación", src: vd.userIdentification },
      { id: "credential", title: credTitle, src: vd.professionalCredentialUrl },
    ];
  }, [draft?.verificationDocuments]);

  const hasVerificationDocuments = verificationSlides.some((s) => Boolean(s.src));

  const toggleGoBrand = (brand: "transport" | "delivery" | "marketplace") => {
    if (!draft) return;
    const next = new Set(goBrandSet);
    if (next.has(brand)) next.delete(brand);
    else next.add(brand);
    setDraft({ ...draft, provider: { ...draft.provider, goBrands: Array.from(next) } });
  };

  const extendSubscription = async (months: number) => {
    if (!canEdit) return;
    try {
      await patchAdminProviderDetail(providerId, { provider: { extendSubscriptionMonths: months } });
      toast({ title: "Suscripción extendida", description: `+${months} mes(es) aplicado(s).` });
      void refetch();
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo extender",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <div className="w-full bg-background pb-24">
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/90">
          <div className="mx-auto flex max-w-5xl flex-wrap items-start gap-3 px-4 py-4 sm:px-6">
            <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" asChild>
              <Link
                href={returnHref}
                onClick={(e) => {
                  if (!requestLeave()) e.preventDefault();
                }}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Volver
              </Link>
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold leading-tight sm:text-xl">Ficha del asociado</h1>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                {draft?.user
                  ? `${draft.user.name} ${draft.user.lastName} · ${draft.user.email ?? "sin correo"}`
                  : "Datos del asociado, categorías, servicios y suscripción."}
              </p>
              {isDirty ? (
                <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">Hay cambios sin guardar</p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={!draft || !hasVerificationDocuments}
                onClick={() => setDocumentsOpen(true)}
              >
                <FileText className="h-4 w-4" aria-hidden />
                Ver documentos
              </Button>
              {canEdit ? (
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  disabled={!draft || saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Guardar
                </Button>
              ) : null}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
{isLoading ? (
              <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                Cargando ficha…
              </div>
            ) : isError || !draft ? (
              <p className="py-16 text-center text-sm text-destructive">No se pudo cargar el asociado.</p>
            ) : (
              <div className="space-y-8">
                <section className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-3 rounded-xl border border-border p-4">
                    <h3 className="font-semibold">Cuenta de usuario</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Nombre</Label>
                        <Input
                          value={draft.user?.name ?? ""}
                          disabled={!canEdit}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              user: draft.user ? { ...draft.user, name: e.target.value } : draft.user,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Apellido</Label>
                        <Input
                          value={draft.user?.lastName ?? ""}
                          disabled={!canEdit}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              user: draft.user ? { ...draft.user, lastName: e.target.value } : draft.user,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Correo</Label>
                        <Input
                          type="email"
                          value={draft.user?.email ?? ""}
                          disabled={!canEdit}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              user: draft.user ? { ...draft.user, email: e.target.value } : draft.user,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Teléfono</Label>
                        <Input
                          value={draft.user?.phone ?? ""}
                          disabled={!canEdit}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              user: draft.user ? { ...draft.user, phone: e.target.value } : draft.user,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Rol</Label>
                        <Input
                          value={draft.user?.role ?? ""}
                          disabled={!canEdit}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              user: draft.user ? { ...draft.user, role: e.target.value } : draft.user,
                            })
                          }
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Reservas: {draft.bookingsCount} · Valoración: {draft.user?.rating?.toFixed(1) ?? "—"} (
                      {draft.user?.ratingCount ?? 0})
                    </p>
                  </div>

                  <div className="space-y-3 rounded-xl border border-border p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold">Perfil profesional</h3>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="prov-verified" className="text-xs">
                          Verificado
                        </Label>
                        <Switch
                          id="prov-verified"
                          checked={draft.provider.isVerified}
                          disabled={!canEdit}
                          onCheckedChange={(v) =>
                            setDraft({ ...draft, provider: { ...draft.provider, isVerified: v } })
                          }
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Profesión</Label>
                        <Input
                          value={draft.provider.profession}
                          disabled={!canEdit}
                          onChange={(e) =>
                            setDraft({ ...draft, provider: { ...draft.provider, profession: e.target.value } })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Años de experiencia</Label>
                        <Input
                          type="number"
                          min={0}
                          value={draft.provider.yearsExperience}
                          disabled={!canEdit}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              provider: { ...draft.provider, yearsExperience: Number(e.target.value) || 0 },
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Tarifa horaria</Label>
                        <Input
                          value={draft.provider.hourlyRate ?? ""}
                          disabled={!canEdit}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              provider: { ...draft.provider, hourlyRate: e.target.value || null },
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Biografía</Label>
                        <Textarea
                          rows={3}
                          value={draft.provider.bio}
                          disabled={!canEdit}
                          onChange={(e) =>
                            setDraft({ ...draft, provider: { ...draft.provider, bio: e.target.value } })
                          }
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Preparación / cursos</Label>
                        <Textarea
                          rows={2}
                          value={draft.provider.preparationLevel}
                          disabled={!canEdit}
                          onChange={(e) =>
                            setDraft({ ...draft, provider: { ...draft.provider, preparationLevel: e.target.value } })
                          }
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Certificaciones</Label>
                        <Textarea
                          rows={2}
                          value={draft.provider.certifications}
                          disabled={!canEdit}
                          onChange={(e) =>
                            setDraft({ ...draft, provider: { ...draft.provider, certifications: e.target.value } })
                          }
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Habilidades (coma)</Label>
                        <Input
                          value={(draft.provider.skills ?? []).join(", ")}
                          disabled={!canEdit}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              provider: {
                                ...draft.provider,
                                skills: e.target.value
                                  .split(",")
                                  .map((x) => x.trim())
                                  .filter(Boolean),
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-3 rounded-xl border border-border p-4">
                  <h3 className="font-semibold">Categorías del asociado</h3>
                  <p className="text-xs text-muted-foreground">
                    Principal, secundaria y terciaria. En Man Go y Pro Go se listan todas las fichas de servicio de esa
                    marca en cada columna.
                  </p>
                  <div className="grid gap-4 md:grid-cols-3">
                    {(
                      [
                        ["Principal", "categoryId", true] as const,
                        ["Secundaria", "secondCategoryId", false] as const,
                        ["Terciaria", "thirdCategoryId", false] as const,
                      ] as const
                    ).map(([label, catKey, showSub]) => (
                      <div key={catKey} className="space-y-2 rounded-lg bg-muted/30 p-3">
                        <p className="text-sm font-medium">{label}</p>
                        <Select
                          value={draft.provider[catKey] != null ? String(draft.provider[catKey]) : "none"}
                          disabled={!canEdit}
                          onValueChange={(v) =>
                            setDraft({
                              ...draft,
                              provider: {
                                ...draft.provider,
                                [catKey]: v === "none" ? null : Number(v),
                                ...(showSub && v === "none" ? { subcategoryId: null } : {}),
                              },
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sin categoría" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— Ninguna —</SelectItem>
                            {draft.categories.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.displayName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {showSub ? (
                          <Select
                            value={
                              draft.provider.subcategoryId != null
                                ? String(draft.provider.subcategoryId)
                                : "none"
                            }
                            disabled={!canEdit || !draft.provider.categoryId}
                            onValueChange={(v) =>
                              setDraft({
                                ...draft,
                                provider: {
                                  ...draft.provider,
                                  subcategoryId: v === "none" ? null : Number(v),
                                },
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Subcategoría" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— Ninguna —</SelectItem>
                              {primarySubs.map((s) => (
                                <SelectItem key={s.id} value={String(s.id)}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : null}
                        {draft ? (
                          <AdminProviderCategorySlotServices
                            services={draft.services}
                            categoryId={draft.provider[catKey]}
                            categories={draft.categories}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(["transport", "delivery", "marketplace"] as const).map((b) => (
                      <Button
                        key={b}
                        type="button"
                        size="sm"
                        variant={goBrandSet.has(b) ? "default" : "outline"}
                        disabled={!canEdit}
                        onClick={() => toggleGoBrand(b)}
                      >
                        Go: {b}
                      </Button>
                    ))}
                  </div>
                </section>

                <section className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                  <h3 className="font-semibold">Suscripción de visibilidad (catálogo)</h3>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[220px] flex-1 space-y-1.5">
                      <Label>Fin del período</Label>
                      <Input
                        type="datetime-local"
                        value={subscriptionEndsLocal}
                        disabled={!canEdit}
                        onChange={(e) => setSubscriptionEndsLocal(e.target.value)}
                      />
                    </div>
                    {draft.provider.subscriptionDaysRemaining != null ? (
                      <Badge variant="secondary">
                        {draft.provider.subscriptionDaysRemaining} día(s) restantes
                      </Badge>
                    ) : (
                      <Badge variant="outline">Sin fecha / legado</Badge>
                    )}
                    {canEdit ? (
                      <>
                        <Button type="button" variant="outline" size="sm" onClick={() => void extendSubscription(1)}>
                          +1 mes
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => void extendSubscription(3)}>
                          +3 meses
                        </Button>
                      </>
                    ) : null}
                  </div>
                  <div className="space-y-1.5 max-w-md">
                    <Label>Slug tarifa suscripción</Label>
                    <Input
                      value={draft.provider.subscriptionCategorySlug ?? ""}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          provider: {
                            ...draft.provider,
                            subscriptionCategorySlug: e.target.value || null,
                          },
                        })
                      }
                    />
                  </div>
                </section>

                {draft.vehicle ? (
                  <section className="space-y-3 rounded-xl border border-border p-4">
                    <h3 className="font-semibold">Vehículo (Car Go / Delivery)</h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {(
                        [
                          ["license_plate", "Placa"],
                          ["brand", "Marca"],
                          ["model", "Modelo"],
                          ["vehicle_type", "Tipo"],
                          ["model_year", "Año"],
                          ["vehicle_status", "Estado"],
                        ] as const
                      ).map(([key, lbl]) => (
                        <div key={key} className="space-y-1.5">
                          <Label>{lbl}</Label>
                          <Input
                            value={String((draft.vehicle as Record<string, unknown>)?.[key] ?? "")}
                            disabled={!canEdit}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                vehicle: { ...draft.vehicle, [key]: e.target.value },
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className="space-y-3">
                  <h3 className="font-semibold">Servicios ({draft.services.length})</h3>
                  <Separator />
                  <div className="space-y-4">
                    {draft.services.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Este asociado no tiene fichas de servicio.</p>
                    ) : (
                      draft.services.map((svc, idx) => (
                        <AdminProviderServiceEditorCard
                          key={svc.id}
                          service={svc}
                          categories={draft.categories}
                          disabled={!canEdit}
                          onChange={(patch) => {
                            const next = [...draft.services];
                            next[idx] = { ...svc, ...patch };
                            setDraft({ ...draft, services: next });
                          }}
                        />
                      ))
                    )}
                  </div>
                </section>
              </div>
            )}
        </main>
      </div>

      <AdminVerificationDocumentDialog
        open={documentsOpen}
        onOpenChange={setDocumentsOpen}
        userId={draft?.provider.userId ?? ""}
        revieweeName={
          draft?.user
            ? `${draft.user.name} ${draft.user.lastName}`.trim() || "Asociado"
            : "Asociado"
        }
        slides={verificationSlides}
        initialIndex={0}
        loading={documentsOpen && isLoading}
      />

      <AlertDialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Salir sin guardar?</AlertDialogTitle>
            <AlertDialogDescription>
              Tienes cambios sin guardar en esta ficha. Si sales ahora, se perderán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <Button type="button" variant="destructive" asChild>
              <Link href={returnHref}>Salir sin guardar</Link>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
