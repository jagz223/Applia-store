import {
  GO_THREE_SERVICES_REMINDER_LEAD,
  GO_THREE_SERVICES_REMINDER_TITLE,
  GO_THREE_SERVICE_DELIVERY,
  GO_THREE_SERVICE_TAXI,
} from "@shared/go-three-services-reminder-copy";

/** Qué incluye Car Go al registrarse como conductor (solo informativo). */
export function GoThreeServicesReminder() {
  const items = [GO_THREE_SERVICE_TAXI, GO_THREE_SERVICE_DELIVERY];
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
      <p className="font-semibold text-foreground">{GO_THREE_SERVICES_REMINDER_TITLE}</p>
      <p className="text-sm text-muted-foreground">{GO_THREE_SERVICES_REMINDER_LEAD}</p>
      <ul className="list-disc list-inside text-sm text-foreground/90 space-y-0.5 pl-0.5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
