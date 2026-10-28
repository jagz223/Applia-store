import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  STORE_ADMIN_LIST_PAGE_SIZE_OPTIONS,
  type StoreAdminListPageSize,
} from "@/lib/store-runtime-flags";

export const STORE_ADMIN_LIST_PAGE_SIZE = 10;

export function StoreAdminListPagination({
  page,
  totalPages,
  isFetching,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = STORE_ADMIN_LIST_PAGE_SIZE_OPTIONS,
}: {
  page: number;
  totalPages: number;
  isFetching?: boolean;
  onPageChange: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (pageSize: StoreAdminListPageSize) => void;
  pageSizeOptions?: readonly number[];
}) {
  const [pageDraft, setPageDraft] = useState(String(page));
  const showPageSize = typeof pageSize === "number" && typeof onPageSizeChange === "function";

  useEffect(() => {
    setPageDraft(String(page));
  }, [page]);

  if (totalPages <= 1 && !showPageSize) return null;

  function commitPageDraft() {
    const parsed = Number.parseInt(pageDraft.replace(/\D/g, ""), 10);
    if (!Number.isFinite(parsed)) {
      setPageDraft(String(page));
      return;
    }
    const next = Math.min(totalPages, Math.max(1, parsed));
    setPageDraft(String(next));
    if (next !== page) onPageChange(next);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-full"
        disabled={page <= 1 || isFetching || totalPages <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        Anterior
      </Button>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {totalPages > 1 ? (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Pág.</span>
            <input
              type="text"
              inputMode="numeric"
              aria-label="Ir a página"
              value={pageDraft}
              disabled={isFetching}
              onChange={(event) => setPageDraft(event.target.value)}
              onBlur={commitPageDraft}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitPageDraft();
                }
              }}
              className="h-8 w-12 rounded-md border border-input bg-background px-1.5 text-center text-xs text-foreground"
            />
            <span>/ {totalPages}</span>
          </label>
        ) : null}
        {showPageSize ? (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Por página</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                const next = Number.parseInt(value, 10);
                if ((pageSizeOptions as readonly number[]).includes(next)) {
                  onPageSizeChange(next as StoreAdminListPageSize);
                }
              }}
              disabled={isFetching}
            >
              <SelectTrigger className="h-8 w-[4.5rem] rounded-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-full"
        disabled={page >= totalPages || isFetching || totalPages <= 1}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
      >
        Siguiente
      </Button>
    </div>
  );
}
