import { useCallback, useEffect, useMemo, useState } from "react";
import { es } from "date-fns/locale";
import { CalendarIcon, Loader2, Pencil, Plus, Trash2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  useAdminPromotionalCodes,
  useCreatePromotionalCode,
  useDeletePromotionalCode,
  useUpdatePromotionalCode,
  type PromotionalCodeApiError,
} from "@/hooks/use-promotional-codes";
import {
  applyPromotionalExpiresTime,
  formatPromotionalCodeBenefit,
  formatPromotionalExpiresAtDisplay,
  getPromotionalExpiresTimeParts,
  isPromotionalExpiresCalendarDayDisabled,
  mergePromotionalExpiresCalendarDay,
  parsePromotionalExpiresAt,
  type PromotionalCodeRecord,
} from "@shared/promotional-code-utils";
import { PromotionalCodeExpiresCell } from "@/components/admin/PromotionalCodeExpiresCell";
import { usePromotionalExpiryClock } from "@/hooks/use-promotional-expiry-clock";
import { isValidDate } from "@/lib/date-utils";
import type {
  PromotionalCodeBenefitType,
  PromotionalCodeExpirationType,
} from "@shared/promotional-code-schema";

type FormState = {
  code: string;
  expirationType: PromotionalCodeExpirationType;
  expiresAt: Date | undefined;
  maxUses: string;
  benefitType: PromotionalCodeBenefitType;
  benefitValue: string;
};

const EMPTY_FORM: FormState = {
  code: "",
  expirationType: "por_tiempo",
  expiresAt: undefined,
  maxUses: "",
  benefitType: "descuento",
  benefitValue: "",
};

function recordToForm(row: PromotionalCodeRecord): FormState {
  const expirationType = (row.expirationType as PromotionalCodeExpirationType) ?? "por_tiempo";
  const parsedExpires = parsePromotionalExpiresAt(row.expiresAt);
  return {
    code: row.code,
    expirationType,
    expiresAt: expirationType === "por_tiempo" ? (parsedExpires ?? undefined) : undefined,
    maxUses: row.maxUses != null ? String(row.maxUses) : "",
    benefitType: (row.benefitType as PromotionalCodeBenefitType) ?? "descuento",
    benefitValue: String(row.benefitValue ?? ""),
  };
}

function PromotionalExpiresTimeFields({
  expiresAt,
  onChange,
}: {
  expiresAt: Date;
  onChange: (date: Date) => void;
}) {
  const { hour12, minute, isPm } = getPromotionalExpiresTimeParts(expiresAt);

  const setTime = (patch: { hour12?: number; minute?: number; isPm?: boolean }) => {
    const current = getPromotionalExpiresTimeParts(expiresAt);
    onChange(
      applyPromotionalExpiresTime(
        expiresAt,
        patch.hour12 ?? current.hour12,
        patch.minute ?? current.minute,
        patch.isPm ?? current.isPm,
      ),
    );
  };

  return (
    <div className="flex flex-row flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground shrink-0">Hora</span>
      <Select value={String(hour12)} onValueChange={(v) => setTime({ hour12: Number(v) })}>
        <SelectTrigger className={cn("h-8 w-[3.25rem] shrink-0 text-xs px-2")}>
          <SelectValue />
        </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
              <SelectItem key={h} value={String(h)}>
                {h}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      <span className="text-xs text-muted-foreground">:</span>
      <Select value={String(minute)} onValueChange={(v) => setTime({ minute: Number(v) })}>
        <SelectTrigger className={cn("h-8 w-[3.25rem] shrink-0 text-xs px-2")}>
          <SelectValue />
        </SelectTrigger>
          <SelectContent className="max-h-48">
            {Array.from({ length: 60 }, (_, i) => i).map((m) => (
              <SelectItem key={m} value={String(m)}>
                {String(m).padStart(2, "0")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      <Select value={isPm ? "pm" : "am"} onValueChange={(v) => setTime({ isPm: v === "pm" })}>
        <SelectTrigger className={cn("h-8 w-[4.5rem] shrink-0 text-xs px-2")}>
          <SelectValue />
        </SelectTrigger>
          <SelectContent>
            <SelectItem value="am">a. m.</SelectItem>
            <SelectItem value="pm">p. m.</SelectItem>
          </SelectContent>
        </Select>
    </div>
  );
}

function flattenFieldErrors(errors?: PromotionalCodeApiError["errors"]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!errors?.fieldErrors) return out;
  for (const [key, messages] of Object.entries(errors.fieldErrors)) {
    if (messages?.[0]) out[key] = messages[0];
  }
  return out;
}

type AdminPromotionalCodesPanelProps = {
  enabled?: boolean;
  createModalOpen?: boolean;
  onCreateModalOpenChange?: (open: boolean) => void;
};

export function AdminPromotionalCodesPanel({
  enabled = true,
  createModalOpen,
  onCreateModalOpenChange,
}: AdminPromotionalCodesPanelProps) {
  const { data: codes = [], isLoading, isError, error } = useAdminPromotionalCodes(enabled);
  const createMutation = useCreatePromotionalCode();
  const updateMutation = useUpdatePromotionalCode();
  const deleteMutation = useDeletePromotionalCode();

  const [internalModalOpen, setInternalModalOpen] = useState(false);
  const [editing, setEditing] = useState<PromotionalCodeRecord | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PromotionalCodeRecord | null>(null);

  const modalOpen = createModalOpen ?? internalModalOpen;
  const setModalOpen = onCreateModalOpenChange ?? setInternalModalOpen;

  const isEditMode = editing != null;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const sortedCodes = useMemo(
    () => [...codes].sort((a, b) => String(a.code).localeCompare(String(b.code))),
    [codes],
  );

  const expiryNowMs = usePromotionalExpiryClock(enabled, sortedCodes);

  const openCreateModal = useCallback(() => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError(null);
    setModalOpen(true);
  }, [setModalOpen]);

  const openEditModal = useCallback(
    (row: PromotionalCodeRecord) => {
      setEditing(row);
      setForm(recordToForm(row));
      setFieldErrors({});
      setFormError(null);
      setModalOpen(true);
    },
    [setModalOpen],
  );

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError(null);
  }, [setModalOpen]);

  useEffect(() => {
    if (createModalOpen && !editing) {
      setForm(EMPTY_FORM);
      setFieldErrors({});
      setFormError(null);
    }
  }, [createModalOpen, editing]);

  const buildPayload = () => ({
    code: form.code.trim(),
    expirationType: form.expirationType,
    expiresAt: form.expirationType === "por_tiempo" ? form.expiresAt : null,
    maxUses:
      form.expirationType === "por_usos"
        ? form.maxUses.trim()
          ? Number(form.maxUses)
          : null
        : null,
    benefitType: form.benefitType,
    benefitValue: Number(form.benefitValue),
  });

  const handleSubmit = async () => {
    setFieldErrors({});
    setFormError(null);
    const payload = buildPayload();

    try {
      if (isEditMode && editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      closeModal();
    } catch (err) {
      const apiErr = err as PromotionalCodeApiError;
      if (apiErr.errors) setFieldErrors(flattenFieldErrors(apiErr.errors));
      setFormError(apiErr.message ?? "No se pudo guardar el código");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      /* toast en hook */
    }
  };

  const benefitValueLabel =
    form.benefitType === "descuento" ? "Porcentaje de descuento" : "Cantidad de meses";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-mango-orange" />
              Códigos promocionales
            </CardTitle>
            <CardDescription>
              Gestiona tickets de descuento o meses gratuitos para el flujo de pago.
            </CardDescription>
          </div>
          <Button type="button" className="shrink-0 gap-2" onClick={openCreateModal}>
            <Plus className="h-4 w-4" />
            Crear código
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 flex items-center justify-center text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Cargando códigos…</span>
            </div>
          ) : isError ? (
            <p className="text-sm text-destructive py-6 text-center">
              {(error as Error)?.message ?? "Error al cargar códigos"}
            </p>
          ) : sortedCodes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No hay códigos promocionales. Crea el primero con el botón superior.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-3 font-medium">Código</th>
                    <th className="text-left p-3 font-medium">Beneficio</th>
                    <th className="text-left p-3 font-medium">Vence en</th>
                    <th className="text-right p-3 font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCodes.map((row) => (
                      <tr key={row.id} className="border-b border-border hover:bg-muted/30">
                        <td className="p-3 font-mono font-semibold tracking-wide">{row.code}</td>
                        <td className="p-3">{formatPromotionalCodeBenefit(row)}</td>
                        <PromotionalCodeExpiresCell row={row} nowMs={expiryNowMs} />
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              onClick={() => openEditModal(row)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Editar
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(row)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Eliminar
                            </Button>
                          </div>
                        </td>
                      </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto border-border bg-card">
          <DialogHeader>
            <DialogTitle>{isEditMode ? "Editar código" : "Crear código"}</DialogTitle>
            <DialogDescription>
              {isEditMode
                ? "Modifica los datos del código promocional."
                : "Define el código, expiración y beneficio para los clientes."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="promo-code">Código</Label>
              <Input
                id="promo-code"
                placeholder="Ej: PROMO2026"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                className="font-mono uppercase"
                autoComplete="off"
              />
              {fieldErrors.code ? (
                <p className="text-xs text-destructive">{fieldErrors.code}</p>
              ) : null}
            </div>

            <div className="space-y-3">
              <Label>Tipo de expiración</Label>
              <RadioGroup
                value={form.expirationType}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    expirationType: v as PromotionalCodeExpirationType,
                    expiresAt: v === "por_tiempo" ? f.expiresAt : undefined,
                    maxUses: v === "por_usos" ? f.maxUses : "",
                  }))
                }
                className="flex flex-col gap-2 sm:flex-row sm:gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="por_tiempo" id="exp-por-tiempo" />
                  <Label htmlFor="exp-por-tiempo" className="font-normal cursor-pointer">
                    Por tiempo
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="por_usos" id="exp-por-usos" />
                  <Label htmlFor="exp-por-usos" className="font-normal cursor-pointer">
                    Por usos
                  </Label>
                </div>
              </RadioGroup>
              {fieldErrors.expirationType ? (
                <p className="text-xs text-destructive">{fieldErrors.expirationType}</p>
              ) : null}
            </div>

            {form.expirationType === "por_tiempo" ? (
              <div className="space-y-2">
                <Label>Fecha y hora de expiración</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !form.expiresAt && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      {form.expiresAt && isValidDate(form.expiresAt)
                        ? formatPromotionalExpiresAtDisplay(form.expiresAt)
                        : "Elegir fecha y hora"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-popover border-border" align="start">
                    <Calendar
                      mode="single"
                      selected={
                        form.expiresAt && isValidDate(form.expiresAt) ? form.expiresAt : undefined
                      }
                      onSelect={(date) => {
                        if (!date) return;
                        setForm((f) => ({
                          ...f,
                          expiresAt: mergePromotionalExpiresCalendarDay(
                            date,
                            f.expiresAt && isValidDate(f.expiresAt) ? f.expiresAt : null,
                          ),
                        }));
                      }}
                      locale={es}
                      disabled={isPromotionalExpiresCalendarDayDisabled}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {form.expiresAt && isValidDate(form.expiresAt) ? (
                  <PromotionalExpiresTimeFields
                    expiresAt={form.expiresAt}
                    onChange={(expiresAt) => setForm((f) => ({ ...f, expiresAt }))}
                  />
                ) : null}
                {fieldErrors.expiresAt ? (
                  <p className="text-xs text-destructive">{fieldErrors.expiresAt}</p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="promo-max-uses">Límite máximo de usos</Label>
                <Input
                  id="promo-max-uses"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="Ej: 100"
                  value={form.maxUses}
                  onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
                />
                {fieldErrors.maxUses ? (
                  <p className="text-xs text-destructive">{fieldErrors.maxUses}</p>
                ) : null}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div className="space-y-2">
                <Label>Tipo de beneficio</Label>
                <Select
                  value={form.benefitType}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, benefitType: v as PromotionalCodeBenefitType }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="descuento">Descuento</SelectItem>
                    <SelectItem value="meses_gratuitos">Meses gratuitos</SelectItem>
                  </SelectContent>
                </Select>
                {fieldErrors.benefitType ? (
                  <p className="text-xs text-destructive">{fieldErrors.benefitType}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="promo-benefit-value">{benefitValueLabel}</Label>
                <Input
                  id="promo-benefit-value"
                  type="number"
                  min={1}
                  max={form.benefitType === "descuento" ? 100 : undefined}
                  step={form.benefitType === "meses_gratuitos" ? 1 : 0.01}
                  placeholder={form.benefitType === "descuento" ? "15" : "3"}
                  value={form.benefitValue}
                  onChange={(e) => setForm((f) => ({ ...f, benefitValue: e.target.value }))}
                />
                {fieldErrors.benefitValue ? (
                  <p className="text-xs text-destructive">{fieldErrors.benefitValue}</p>
                ) : null}
              </div>
            </div>

            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={closeModal} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isEditMode ? "Guardar cambios" : "Crear código"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget != null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar código promocional?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente el código{" "}
              <strong className="font-mono">{deleteTarget?.code}</strong>. Esta acción no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Eliminar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
