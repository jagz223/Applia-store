import { useState } from "react";
import {
  readStoreAdminListPageSize,
  writeStoreAdminListPageSize,
  type StoreAdminListPageSize,
} from "@/lib/store-runtime-flags";

export function useStoreAdminListPageSize() {
  const [pageSize, setPageSizeState] = useState<StoreAdminListPageSize>(() => readStoreAdminListPageSize());

  function setPageSize(next: StoreAdminListPageSize) {
    writeStoreAdminListPageSize(next);
    setPageSizeState(next);
  }

  return [pageSize, setPageSize] as const;
}
