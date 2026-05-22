import { useEffect, useState } from "react";
import { CATEGORY_ICON_PNG_ERROR } from "@shared/category-icon-image";
import { verifyCategoryIconImageUrl } from "@/lib/category-icon-image-verify";

export type CategoryImageUrlValidationStatus = "idle" | "checking" | "ok" | "error";

export function useCategoryImageUrlValidation(raw: string) {
  const trimmed = raw.trim();
  const [status, setStatus] = useState<CategoryImageUrlValidationStatus>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!trimmed) {
      setStatus("idle");
      setMessage("");
      return;
    }

    setStatus("checking");
    setMessage("");

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void verifyCategoryIconImageUrl(trimmed).then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setStatus("ok");
          setMessage("");
        } else {
          setStatus("error");
          setMessage(result.message || CATEGORY_ICON_PNG_ERROR);
        }
      });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmed]);

  const isValid = !trimmed || status === "ok";

  return { status, message, isValid, displayUrl: status === "ok" ? trimmed : null };
}
