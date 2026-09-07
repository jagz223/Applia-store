import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { AlertCircle, ArrowLeft, FileSpreadsheet, Loader2, Plus, Trash2, Upload } from "lucide-react";
import {
  PRODUCT_IMPORT_CSV_DELIMITER_LABELS,
  PRODUCT_IMPORT_CSV_DELIMITERS,
  PRODUCT_IMPORT_OPTIONAL_FIELD_LABELS,
  PRODUCT_IMPORT_OPTIONAL_FIELDS,
  type ProductImportCsvDelimiter,
  type ProductImportOptionalField,
} from "@shared/store-product-import";
import { useAuth } from "@/hooks/use-auth";
import { useStoreBySlug } from "@/hooks/use-my-store";
import { storeProductsQueryKey } from "@/hooks/use-store-products";
import { useQueryClient } from "@tanstack/react-query";
import { hasAdminRole } from "@/lib/auth-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { storeAdminFieldClass, storeAdminSectionCardClass } from "@/components/store/store-admin-ui";
import { cn } from "@/lib/utils";

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

type ImportResult = {
  created: number;
  updated: number;
  skippedErrors: number;
  message?: string;
  errors?: { rowNumber: number; message: string }[];
};

type OptionalRow = {
  id: string;
  column: string;
  field: ProductImportOptionalField | "";
};

function newOptionalRow(): OptionalRow {
  return {
    id: `opt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    column: "",
    field: "",
  };
}

export default function StoreProductImportPage() {
  const [, params] = useRoute("/tienda/:slug/admin/productos/importar");
  const slug = params?.slug ?? "";
  const { user, isAuthenticated } = useAuth();
  const isAdmin = hasAdminRole(user);
  const { data, isLoading } = useStoreBySlug(slug, isAuthenticated && Boolean(slug));
  const canManage = Boolean(data?.canManageStore ?? (data?.isOwner || isAdmin));
  const storeId = data?.store?.id ?? 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [colCodigo, setColCodigo] = useState("Código");
  const [colNombre, setColNombre] = useState("Nombre");
  const [colPrecio, setColPrecio] = useState("Precio");
  const [optionals, setOptionals] = useState<OptionalRow[]>([]);
  const [csvDelimiter, setCsvDelimiter] = useState<ProductImportCsvDelimiter>(",");
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const productsHref = useMemo(
    () => `/tienda/${encodeURIComponent(slug)}/admin/productos`,
    [slug],
  );

  const isCsv = Boolean(file?.name.toLowerCase().endsWith(".csv"));

  const usedOptionalFields = useMemo(
    () => new Set(optionals.map((r) => r.field).filter(Boolean) as ProductImportOptionalField[]),
    [optionals],
  );

  const onImport = async () => {
    setFormError(null);
    setResult(null);
    if (!colCodigo.trim() || !colNombre.trim() || !colPrecio.trim()) {
      const msg = "Código, nombre y precio son obligatorios.";
      setFormError(msg);
      toast({ title: "Campos incompletos", description: msg, variant: "destructive" });
      return;
    }

    const cleanedOptionals: { column: string; field: ProductImportOptionalField }[] = [];
    const seenFields = new Set<ProductImportOptionalField>();
    for (const row of optionals) {
      const column = row.column.trim();
      const field = row.field;
      if (!column && !field) continue;
      if (!column || !field) {
        const msg = "En cada campo opcional indica la columna y elige a qué dato corresponde.";
        setFormError(msg);
        toast({ title: "Campos opcionales incompletos", description: msg, variant: "destructive" });
        return;
      }
      if (seenFields.has(field)) {
        const msg = `El campo «${PRODUCT_IMPORT_OPTIONAL_FIELD_LABELS[field]}» está mapeado más de una vez.`;
        setFormError(msg);
        toast({ title: "Mapeo duplicado", description: msg, variant: "destructive" });
        return;
      }
      seenFields.add(field);
      cleanedOptionals.push({ column, field });
    }

    if (cleanedOptionals.some((o) => o.field === "subcategory") && !cleanedOptionals.some((o) => o.field === "category")) {
      const msg = "Si importas subcategoría, también debes mapear la columna de categoría.";
      setFormError(msg);
      toast({ title: "Falta categoría", description: msg, variant: "destructive" });
      return;
    }

    if (!file) {
      const msg = "Selecciona un archivo CSV o Excel.";
      setFormError(msg);
      toast({ title: "Sin archivo", description: msg, variant: "destructive" });
      return;
    }
    if (!storeId) return;

    setBusy(true);
    try {
      const fileBase64 = await fileToBase64(file);
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/stores/${storeId}/products/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          colCodigo: colCodigo.trim(),
          colNombre: colNombre.trim(),
          colPrecio: colPrecio.trim(),
          optionals: cleanedOptionals,
          csvDelimiter,
          fileName: file.name,
          fileBase64,
        }),
      });
      const dataJson = (await res.json().catch(() => ({}))) as ImportResult & { message?: string };
      if (!res.ok) {
        throw new Error(dataJson.message || "No se pudo importar el archivo.");
      }
      setResult(dataJson);
      await queryClient.invalidateQueries({ queryKey: storeProductsQueryKey(storeId) });
      toast({
        title: "Importación completada",
        description: dataJson.message ?? `${dataJson.created} creados, ${dataJson.updated} actualizados`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      setFormError(msg);
      toast({ title: "Error al importar", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="container max-w-lg py-16 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Acceso restringido</CardTitle>
            <CardDescription>Inicia sesión para importar productos.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href={`/login?next=/tienda/${encodeURIComponent(slug)}/admin/productos/importar`}>
                Iniciar sesión
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || !data?.store) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="container max-w-lg py-16 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Sin permiso</CardTitle>
            <CardDescription>No puedes importar productos en esta tienda.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href={productsHref}>Volver a productos</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 rounded-full">
          <Link href={productsHref}>
            <ArrowLeft className="h-4 w-4" />
            Productos
          </Link>
        </Button>
      </div>

      <Card className={cn(storeAdminSectionCardClass)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <FileSpreadsheet className="h-5 w-5" />
            Importar productos
          </CardTitle>
          <CardDescription>
            Indica el nombre de cada columna del archivo y, en los opcionales, a qué dato del producto
            corresponde. Si el <strong>código</strong> ya existe, se actualiza; si no, se crea.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Campos obligatorios</h3>
              <p className="text-xs text-muted-foreground">
                Escribe el nombre exacto de la columna en tu CSV/Excel.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="col-codigo">Código</Label>
                <Input
                  id="col-codigo"
                  value={colCodigo}
                  onChange={(e) => setColCodigo(e.target.value)}
                  className={storeAdminFieldClass}
                  placeholder="Código"
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="col-nombre">Nombre</Label>
                <Input
                  id="col-nombre"
                  value={colNombre}
                  onChange={(e) => setColNombre(e.target.value)}
                  className={storeAdminFieldClass}
                  placeholder="Nombre"
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="col-precio">Precio</Label>
                <Input
                  id="col-precio"
                  value={colPrecio}
                  onChange={(e) => setColPrecio(e.target.value)}
                  className={storeAdminFieldClass}
                  placeholder="Precio"
                  disabled={busy}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Campos opcionales</h3>
                <p className="text-xs text-muted-foreground">
                  Columna del archivo + dato del producto. Stock activa el control de stock. Ingredientes
                  separados por coma dentro de la celda.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full gap-1"
                disabled={busy || optionals.length >= PRODUCT_IMPORT_OPTIONAL_FIELDS.length}
                onClick={() => setOptionals((prev) => [...prev, newOptionalRow()])}
              >
                <Plus className="h-4 w-4" />
                Agregar campo
              </Button>
            </div>

            {optionals.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/80 px-3 py-4 text-center text-xs text-muted-foreground">
                Sin campos opcionales. Puedes agregar descripción, stock, imagen, categoría, etc.
              </p>
            ) : (
              <ul className="space-y-2">
                {optionals.map((row) => {
                  const availableFields = PRODUCT_IMPORT_OPTIONAL_FIELDS.filter(
                    (f) => f === row.field || !usedOptionalFields.has(f),
                  );
                  return (
                    <li
                      key={row.id}
                      className="grid gap-2 rounded-xl border border-border/70 bg-muted/10 p-3 sm:grid-cols-[1fr_minmax(10rem,14rem)_auto] sm:items-end"
                    >
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Columna del archivo</Label>
                        <Input
                          value={row.column}
                          onChange={(e) =>
                            setOptionals((prev) =>
                              prev.map((r) =>
                                r.id === row.id ? { ...r, column: e.target.value } : r,
                              ),
                            )
                          }
                          className={storeAdminFieldClass}
                          placeholder="Ej. Stock, Imagen, Categoría…"
                          disabled={busy}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Corresponde a</Label>
                        <Select
                          value={row.field || undefined}
                          disabled={busy}
                          onValueChange={(value) =>
                            setOptionals((prev) =>
                              prev.map((r) =>
                                r.id === row.id
                                  ? { ...r, field: value as ProductImportOptionalField }
                                  : r,
                              ),
                            )
                          }
                        >
                          <SelectTrigger className={cn(storeAdminFieldClass, "h-10")}>
                            <SelectValue placeholder="Elegir campo…" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableFields.map((field) => (
                              <SelectItem key={field} value={field}>
                                {PRODUCT_IMPORT_OPTIONAL_FIELD_LABELS[field]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 text-destructive hover:text-destructive"
                        aria-label="Quitar campo"
                        disabled={busy}
                        onClick={() => setOptionals((prev) => prev.filter((r) => r.id !== row.id))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <Label>Separador del CSV</Label>
            <Select
              value={csvDelimiter}
              disabled={busy}
              onValueChange={(v) => setCsvDelimiter(v as ProductImportCsvDelimiter)}
            >
              <SelectTrigger className={cn(storeAdminFieldClass, "h-10 max-w-xs")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_IMPORT_CSV_DELIMITERS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {PRODUCT_IMPORT_CSV_DELIMITER_LABELS[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Solo aplica a archivos <strong>.csv</strong>. Excel (.xlsx/.xls) ignora este valor y lee
              por celdas.
              {csvDelimiter === "," ? (
                <>
                  {" "}
                  Con separador coma, usa comillas en valores que contengan coma (ej.{" "}
                  <code className="rounded bg-muted px-1">"12,50"</code> o{" "}
                  <code className="rounded bg-muted px-1">"tomate, lechuga"</code>).
                </>
              ) : null}
              {file && !isCsv ? (
                <>
                  {" "}
                  El archivo actual es Excel: el separador no se usará.
                </>
              ) : null}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="import-file">Archivo CSV o Excel</Label>
            <label
              htmlFor="import-file"
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center transition-colors hover:border-primary/40",
                busy && "pointer-events-none opacity-60",
              )}
            >
              <Upload className="h-7 w-7 text-muted-foreground" aria-hidden />
              <span className="text-sm text-muted-foreground">
                {file ? file.name : "Haz clic para elegir .csv, .xlsx o .xls"}
              </span>
            </label>
            <input
              id="import-file"
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setFormError(null);
                setResult(null);
                e.target.value = "";
              }}
            />
          </div>

          {formError ? (
            <div
              role="alert"
              className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p className="leading-relaxed">{formError}</p>
            </div>
          ) : null}

          {result ? (
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm">
              <p className="font-medium">{result.message}</p>
              {result.errors && result.errors.length > 0 ? (
                <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-muted-foreground">
                  {result.errors.map((err, i) => (
                    <li key={`${err.rowNumber}-${i}`}>
                      Fila {err.rowNumber}: {err.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void onImport()} className="rounded-full">
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando…
                </>
              ) : (
                "Importar"
              )}
            </Button>
            <Button asChild type="button" variant="outline" className="rounded-full" disabled={busy}>
              <Link href={productsHref}>Cancelar</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
