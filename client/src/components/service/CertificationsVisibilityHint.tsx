/**
 * Aviso reutilizable: dónde verán los clientes las certificaciones si las completan.
 */
export function CertificationsVisibilityHint() {
  return (
    <p className="text-xs text-muted-foreground rounded-md border border-border/60 bg-muted/30 px-3 py-2 leading-relaxed">
      Si completas este apartado, se mostrará como sección en{" "}
      <strong className="text-foreground">Editar servicio</strong> y en la{" "}
      <strong className="text-foreground">vista pública del servicio</strong>. Si lo dejas vacío, no aparecerá; puedes
      añadirlo más tarde cuando lo tengas.
    </p>
  );
}
