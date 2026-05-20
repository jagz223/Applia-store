import { useMemo, useState } from "react";
import { Loader2, Pencil, Search, Users } from "lucide-react";
import type { CentralMemberSummary } from "@shared/central-member";
import { useCentralMembers, usePatchCentralMember } from "@/hooks/use-central";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type CentralMembersPanelProps = {
  companyId: string;
  /** En móvil: lista a pantalla completa sin Card contenedor. */
  variant?: "sidebar" | "embedded";
  className?: string;
};

export function CentralMembersPanel({ companyId, variant = "sidebar", className }: CentralMembersPanelProps) {
  const { toast } = useToast();
  const { data: members = [], isLoading, refetch } = useCentralMembers(companyId);
  const patchMember = usePatchCentralMember(companyId);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CentralMemberSummary | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const full = `${m.name} ${m.lastName}`.toLowerCase();
      return (
        full.includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.phone.toLowerCase().includes(q) ||
        (m.licensePlate ?? "").toLowerCase().includes(q)
      );
    });
  }, [members, search]);

  const openEdit = (member: CentralMemberSummary) => {
    setEditing(member);
    setEmail(member.email);
    setPhone(member.phone);
    setNewPassword("");
  };

  const handleSave = async () => {
    if (!editing) return;
    const patch: { email?: string; phone?: string; newPassword?: string } = {};
    if (email.trim() !== editing.email) patch.email = email.trim();
    if (phone.trim() !== editing.phone) patch.phone = phone.trim();
    if (newPassword.trim().length >= 6) patch.newPassword = newPassword.trim();

    if (Object.keys(patch).length === 0) {
      toast({ title: "Sin cambios", description: "No hay datos nuevos para guardar." });
      return;
    }

    try {
      await patchMember.mutateAsync({ userId: editing.userId, ...patch });
      toast({ title: "Usuario actualizado" });
      setEditing(null);
      void refetch();
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo actualizar",
      });
    }
  };

  const header = (
    <div className={cn("space-y-3", variant === "sidebar" ? "pb-3" : "pb-4")}>
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Users className="h-4 w-4 text-primary" />
          Usuarios registrados
        </h2>
        <p className="text-sm text-muted-foreground">{members.length} en esta central</p>
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Buscar por nombre, correo o teléfono…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
    </div>
  );

  const listBody = isLoading ? (
    <div className="flex flex-1 items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ) : filtered.length === 0 ? (
    <p className="text-sm text-muted-foreground">
      {search ? "No hay coincidencias." : "Aún no hay usuarios registrados por esta central."}
    </p>
  ) : (
    <ul className="space-y-1">
      {filtered.map((m, i) => (
        <li key={m.userId}>
          {i > 0 && <Separator className="my-1 opacity-50" />}
          <MemberRow member={m} onEdit={() => openEdit(m)} />
        </li>
      ))}
    </ul>
  );

  const editDialog = (
    <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
          <DialogDescription>
            {editing ? `${editing.name} ${editing.lastName}` : ""} — actualiza correo, teléfono o contraseña.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="edit-email">Correo</Label>
            <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-phone">Teléfono</Label>
            <Input id="edit-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-password">Nueva contraseña (opcional)</Label>
            <Input
              id="edit-password"
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditing(null)}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={patchMember.isPending}>
            {patchMember.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (variant === "embedded") {
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
        {header}
        <div className="min-h-0 flex-1">{listBody}</div>
        {editDialog}
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "flex min-h-[480px] flex-col rounded-xl border border-border/80 bg-card shadow-sm lg:sticky lg:top-20",
          className,
        )}
      >
        <div className="p-4 pb-0">{header}</div>
        <div className="flex min-h-0 flex-1 flex-col px-2 pb-4">
          <ScrollArea className="h-[min(520px,55vh)]">{listBody}</ScrollArea>
        </div>
      </div>
      {editDialog}
    </>
  );
}

function MemberRow({ member, onEdit }: { member: CentralMemberSummary; onEdit: () => void }) {
  return (
    <div className="group flex items-start gap-2 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">
          {member.name} {member.lastName}
        </p>
        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
        <p className="truncate text-xs text-muted-foreground">{member.phone}</p>
        {member.memberType === "driver" && member.licensePlate && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {member.vehicleLabel ? `${member.vehicleLabel} · ` : ""}
            Placa {member.licensePlate}
          </p>
        )}
        <Badge variant="secondary" className="mt-1.5 text-[10px] font-normal">
          {member.memberType === "driver" ? "Conductor" : "Operador"}
        </Badge>
      </div>
      {member.credentialsManagedOutsideCentral ? (
        <span className="text-[10px] text-muted-foreground shrink-0 px-1" title="Cuenta propia del conductor">
          Cuenta propia
        </span>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 opacity-70 group-hover:opacity-100"
          onClick={onEdit}
          aria-label="Editar usuario"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
