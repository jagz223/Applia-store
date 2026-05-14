import { Checkbox } from "@/components/ui/checkbox";
import {
  GO_THREE_SERVICES_REMINDER_LEAD,
  GO_THREE_SERVICES_REMINDER_TITLE,
  GO_THREE_SERVICE_DELIVERY,
  GO_THREE_SERVICE_MARKETPLACE,
  GO_THREE_SERVICE_MARKETPLACE_NOTE,
  GO_THREE_SERVICE_TAXI,
} from "@shared/go-three-services-reminder-copy";

function ReminderRow({ label, note }: { label: string; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/80 px-3 py-2">
      <span className="min-w-0 text-sm font-medium text-foreground">
        {label}
        {note ? <span className="ml-1 text-xs font-normal text-muted-foreground">{note}</span> : null}
      </span>
      <Checkbox checked disabled className="shrink-0" aria-label={`${label}: siempre activo (recordatorio)`} />
    </div>
  );
}

/** Checkboxes solo informativos: taxi, delivery y marketplace siempre activos en Genfeb Go. */
export function GoThreeServicesReminder() {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
      <p className="font-semibold text-foreground">{GO_THREE_SERVICES_REMINDER_TITLE}</p>
      <p className="text-sm text-muted-foreground leading-relaxed">{GO_THREE_SERVICES_REMINDER_LEAD}</p>
      <div className="space-y-2">
        <ReminderRow label={GO_THREE_SERVICE_TAXI} />
        <ReminderRow label={GO_THREE_SERVICE_DELIVERY} />
        <ReminderRow label={GO_THREE_SERVICE_MARKETPLACE} note={GO_THREE_SERVICE_MARKETPLACE_NOTE} />
      </div>
    </div>
  );
}
