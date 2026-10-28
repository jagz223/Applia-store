import type { AddStoreCartItem } from "@shared/store-cart-schema";
import { storeCartProductLineKey } from "@shared/store-cart-schema";
import {
  parseStoreProductCatalogKind,
  productHasEffectiveBoxSize,
  snapQuantityToBoxMeters,
  type StoreProductCatalogKind,
} from "@shared/store-schema";

export type GuestStoreCartLine = {
  kind: "product" | "promotion";
  lineKey: string;
  productId?: number;
  promotionId?: number;
  sizeId?: string | null;
  quantity: number;
  name: string;
  price: number;
  imageUrl?: string | null;
  removedIngredientMaterialIds?: number[];
  additionalIngredientMaterialIds?: number[];
  boxSize?: number;
};

export type GuestStoreCart = {
  storeId: number;
  items: GuestStoreCartLine[];
  updatedAt: string;
};

function storageKey(storeId: number, cartKind: StoreProductCatalogKind = "retail"): string {
  const kind = parseStoreProductCatalogKind(cartKind);
  if (kind === "import") return `guestStoreCart:${storeId}:import`;
  return `guestStoreCart:${storeId}:retail`;
}

function legacyStorageKey(storeId: number): string {
  return `guestStoreCart:${storeId}`;
}

export function readGuestStoreCart(
  storeId: number,
  cartKind: StoreProductCatalogKind = "retail",
): GuestStoreCart {
  if (typeof window === "undefined" || storeId <= 0) {
    return { storeId, items: [], updatedAt: new Date().toISOString() };
  }
  const kind = parseStoreProductCatalogKind(cartKind);
  try {
    let raw = localStorage.getItem(storageKey(storeId, kind));
    if (!raw && kind === "retail") {
      raw = localStorage.getItem(legacyStorageKey(storeId));
    }
    if (!raw) return { storeId, items: [], updatedAt: new Date().toISOString() };
    const parsed = JSON.parse(raw) as GuestStoreCart;
    if (!parsed || parsed.storeId !== storeId || !Array.isArray(parsed.items)) {
      return { storeId, items: [], updatedAt: new Date().toISOString() };
    }
    return parsed;
  } catch {
    return { storeId, items: [], updatedAt: new Date().toISOString() };
  }
}

export function writeGuestStoreCart(
  cart: GuestStoreCart,
  cartKind: StoreProductCatalogKind = "retail",
): void {
  if (typeof window === "undefined" || cart.storeId <= 0) return;
  const kind = parseStoreProductCatalogKind(cartKind);
  localStorage.setItem(
    storageKey(cart.storeId, kind),
    JSON.stringify({ ...cart, updatedAt: new Date().toISOString() }),
  );
  if (kind === "retail") {
    localStorage.removeItem(legacyStorageKey(cart.storeId));
  }
}

export function clearGuestStoreCart(
  storeId: number,
  cartKind: StoreProductCatalogKind = "retail",
): void {
  if (typeof window === "undefined" || storeId <= 0) return;
  const kind = parseStoreProductCatalogKind(cartKind);
  localStorage.removeItem(storageKey(storeId, kind));
  if (kind === "retail") localStorage.removeItem(legacyStorageKey(storeId));
}

export function addGuestStoreCartItem(
  storeId: number,
  item: AddStoreCartItem & {
    name: string;
    price: number;
    imageUrl?: string | null;
    boxSize?: number;
  },
  cartKind: StoreProductCatalogKind = "retail",
): GuestStoreCart {
  const kind = parseStoreProductCatalogKind(cartKind);
  if (kind === "import" && item.kind === "promotion") {
    return readGuestStoreCart(storeId, kind);
  }
  const cart = readGuestStoreCart(storeId, kind);
  const lineKey =
    item.kind === "promotion"
      ? `m:${item.promotionId}`
      : storeCartProductLineKey({
          productId: item.productId!,
          sizeId: item.sizeId,
          removedIngredientMaterialIds: item.removedIngredientMaterialIds,
          additionalIngredientMaterialIds: item.additionalIngredientMaterialIds,
        });
  const boxSize =
    item.kind === "product" && productHasEffectiveBoxSize({ boxSize: item.boxSize })
      ? Number(item.boxSize)
      : 0;
  const addQty = item.quantity || 1;
  const existing = cart.items.find((row) => row.lineKey === lineKey);
  if (existing) {
    const merged = existing.quantity + addQty;
    existing.quantity = Math.min(
      9999,
      boxSize > 0 ? snapQuantityToBoxMeters(merged, boxSize) : merged,
    );
    if (boxSize > 0) existing.boxSize = boxSize;
  } else {
    cart.items.push({
      kind: item.kind,
      lineKey,
      productId: item.productId,
      promotionId: item.promotionId,
      sizeId: item.sizeId ?? null,
      quantity: Math.min(
        9999,
        boxSize > 0 ? snapQuantityToBoxMeters(addQty, boxSize) : addQty,
      ),
      name: item.name,
      price: item.price,
      imageUrl: item.imageUrl ?? null,
      removedIngredientMaterialIds: item.removedIngredientMaterialIds ?? [],
      additionalIngredientMaterialIds: item.additionalIngredientMaterialIds ?? [],
      ...(boxSize > 0 ? { boxSize } : {}),
    });
  }
  writeGuestStoreCart(cart, kind);
  return cart;
}

export function guestCartItemCount(
  storeId: number,
  cartKind: StoreProductCatalogKind = "retail",
): number {
  return readGuestStoreCart(storeId, cartKind).items.reduce((sum, row) => sum + row.quantity, 0);
}

export async function mergeGuestStoreCartToServer(
  storeId: number,
  cartKind: StoreProductCatalogKind = "retail",
): Promise<void> {
  const kind = parseStoreProductCatalogKind(cartKind);
  const guest = readGuestStoreCart(storeId, kind);
  if (guest.items.length === 0) return;
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Debes iniciar sesión para sincronizar el carrito.");

  for (const item of guest.items) {
    const body =
      item.kind === "promotion"
        ? {
            kind: "promotion" as const,
            promotionId: item.promotionId!,
            quantity: item.quantity,
            cartKind: kind,
          }
        : {
            kind: "product" as const,
            productId: item.productId!,
            quantity: item.quantity,
            sizeId: item.sizeId,
            removedIngredientMaterialIds: item.removedIngredientMaterialIds ?? [],
            additionalIngredientMaterialIds: item.additionalIngredientMaterialIds ?? [],
            cartKind: kind,
          };
    const res = await fetch(`/api/stores/${storeId}/cart/items`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message || "No se pudo sincronizar el carrito");
    }
  }
  clearGuestStoreCart(storeId, kind);
}
