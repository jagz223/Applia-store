import { Button } from "@/components/ui/button";

export const STORE_ADMIN_LIST_PAGE_SIZE = 10;

export function StoreAdminListPagination({
  page,
  totalPages,
  isFetching,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  isFetching?: boolean;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-2 pt-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-full"
        disabled={page <= 1 || isFetching}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        Anterior
      </Button>
      <span className="text-xs text-muted-foreground">
        Pág. {page} / {totalPages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-full"
        disabled={page >= totalPages || isFetching}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
      >
        Siguiente
      </Button>
    </div>
  );
}
