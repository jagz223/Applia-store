import { motion } from "framer-motion";
import {
  MY_SERVICES_SUBSCRIPTION_EXPIRED_BODY,
  MY_SERVICES_SUBSCRIPTION_EXPIRED_HEADLINE,
} from "@shared/provider-listing-owner-messages";
import { ListingSubscriptionRenewButton } from "@/components/listing/ListingSubscriptionRenewButton";

/** Aviso superior en Mis servicios cuando el catálogo está suspendido por suscripción. */
export function MyServicesSubscriptionBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-950 dark:text-amber-50"
      role="status"
    >
      <p className="font-medium">{MY_SERVICES_SUBSCRIPTION_EXPIRED_HEADLINE}</p>
      <p className="mt-1.5 text-amber-950/85 dark:text-amber-50/90">{MY_SERVICES_SUBSCRIPTION_EXPIRED_BODY}</p>
      <ListingSubscriptionRenewButton className="mt-3" />
    </motion.div>
  );
}
