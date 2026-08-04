import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RequestCentralAffiliationForm } from "@/components/provider/RequestCentralAffiliationForm";

type RequestCentralAffiliationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RequestCentralAffiliationDialog({ open, onOpenChange }: RequestCentralAffiliationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        layer="elevated"
        className="max-w-md border-border bg-card text-card-foreground shadow-2xl"
      >
        <DialogHeader>
          <DialogTitle>Solicitar afiliación a una central</DialogTitle>
          <DialogDescription>
            Tu cuenta Applia sigue siendo tuya. La central deberá aprobar la solicitud para vincularte como conductor
            despachado.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <RequestCentralAffiliationForm onSuccess={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
