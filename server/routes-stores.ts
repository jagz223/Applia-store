/**
 * API REST — módulo Tiendas (Prompt 1).
 *
 * Pruebas manuales (reemplaza TOKEN y ajusta host):
 *
 * # Crear tienda
 * curl -s -X POST http://localhost:5000/api/stores \
 *   -H "Authorization: Bearer TOKEN" \
 *   -H "Content-Type: application/json" \
 *   -d '{"name":"Mi Tienda Demo"}'
 *
 * # Mi tienda
 * curl -s http://localhost:5000/api/stores/mine -H "Authorization: Bearer TOKEN"
 *
 * # Tienda pública por slug
 * curl -s http://localhost:5000/api/stores/mi-tienda-demo
 *
 * # Listar ingredientes/materiales (página 1, filtro opcional)
 * curl -s "http://localhost:5000/api/ingredients-materials?q=harina&page=1"
 *
 * # Crear ingrediente/material global
 * curl -s -X POST http://localhost:5000/api/ingredients-materials \
 *   -H "Authorization: Bearer TOKEN" \
 *   -H "Content-Type: application/json" \
 *   -d '{"name":"Harina de trigo"}'
 *
 * # Cotización mensualidad tienda (público)
 * curl -s http://localhost:5000/api/stores/subscription-quote
 */
import type { Express } from "express";
import { z } from "zod";
import { authenticateJWT, optionalAuthenticateJWT } from "./routes-auth";
import { genFebStorage } from "./storage-genfeb";
import { getStoreSubscriptionQuote } from "./store-subscription";
import {
  storeHasPendingSubscriptionPayment,
  submitStoreSubscriptionPayment,
  repairStoreSubscriptionVisibilityIfNeeded,
} from "./store-subscription-payments";
import {
  assertStoreCategoryIds,
  productIdsForCategory,
  removeCategoryFromAllProducts,
  syncCategoryProductMembership,
} from "./store-category-sync";
import {
  insertStoreSchema,
  insertIngredientMaterialSchema,
  insertStoreProductSchema,
  updateStoreProductSchema,
  updateStoreSchema,
  insertStoreCategorySchema,
  updateStoreCategorySchema,
  INGREDIENTS_MATERIALS_PAGE_SIZE,
  type Store,
  type StoreProduct,
  type StoreCategory,
} from "@shared/store-schema";
import { storeSubscriptionPaymentBodySchema } from "@shared/store-subscription-payment";
import { isStoreVisibilityActive } from "@shared/store-visibility";
import { filterStoresByCatalogQuery, getStoreRubroLabel } from "@shared/store-rubros";
import { parsePositiveIntParam, requireStoreOwner } from "./store-product-auth";

function serializeDate(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const t = Date.parse(String(value));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function serializeStoreProduct(product: StoreProduct) {
  return {
    id: product.id,
    storeId: product.storeId,
    name: product.name,
    description: product.description,
    price: product.price,
    categoryIds: product.categoryIds,
    ingredientMaterialIds: product.ingredientMaterialIds,
    imageUrls: product.imageUrls ?? [],
    showOnShowcase: product.showOnShowcase !== false,
    createdAt: serializeDate(product.createdAt),
    updatedAt: serializeDate(product.updatedAt),
  };
}

function serializeStoreCategory(category: StoreCategory, products: StoreProduct[]) {
  const ids = productIdsForCategory(products, category.id);
  return {
    id: category.id,
    storeId: category.storeId,
    name: category.name,
    description: category.description,
    productIds: ids,
    productCount: ids.length,
    createdAt: serializeDate(category.createdAt),
    updatedAt: serializeDate(category.updatedAt),
  };
}

async function assertStoreProductIds(storeId: number, productIds: number[]): Promise<void> {
  if (productIds.length === 0) return;
  const products = await genFebStorage.listStoreProducts(storeId);
  const valid = new Set(products.map((p) => p.id));
  for (const id of productIds) {
    if (!valid.has(id)) throw new Error("STORE_PRODUCT_INVALID");
  }
}

function serializeStoreShowcaseProduct(product: StoreProduct) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    imageUrls: product.imageUrls ?? [],
  };
}

function serializeStoreCatalogItem(store: Store) {
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    description: store.description ?? null,
    rubro: store.rubro ?? null,
    rubroLabel: getStoreRubroLabel(store.rubro),
    coverImageUrl: store.coverImageUrl ?? null,
  };
}

function serializeStore(
  store: Store,
  extra?: { hasPendingSubscriptionPayment?: boolean; isOwner?: boolean },
) {
  return {
    id: store.id,
    ownerUserId: store.ownerUserId,
    name: store.name,
    slug: store.slug,
    description: store.description ?? null,
    rubro: store.rubro ?? null,
    rubroLabel: getStoreRubroLabel(store.rubro),
    coverImageUrl: store.coverImageUrl ?? null,
    visibilitySubscriptionEndsAt: serializeDate(store.visibilitySubscriptionEndsAt),
    visibilityActive: isStoreVisibilityActive(store),
    hasPendingSubscriptionPayment: extra?.hasPendingSubscriptionPayment ?? false,
    isOwner: extra?.isOwner,
    createdAt: serializeDate(store.createdAt),
    updatedAt: serializeDate(store.updatedAt),
  };
}

const ingredientsListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
});

const storesCatalogQuerySchema = z.object({
  q: z.string().optional(),
  rubro: z.string().optional(),
});

export function registerStoreRoutes(app: Express): void {
  app.get("/api/stores/subscription-quote", async (_req, res) => {
    try {
      const quote = await getStoreSubscriptionQuote();
      return res.json(quote);
    } catch (e) {
      console.error("[stores] subscription-quote", e);
      return res.status(500).json({ message: "No se pudo obtener la cotización de la tienda." });
    }
  });

  app.post("/api/stores", authenticateJWT, async (req: any, res) => {
    try {
      const parsed = insertStoreSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const store = await genFebStorage.createStore({
        ownerUserId: userId,
        name: parsed.data.name,
      });
      return res.status(201).json({ store: serializeStore(store) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_ALREADY_EXISTS") {
        return res.status(409).json({ message: "Ya tienes una tienda registrada." });
      }
      console.error("[stores] create", e);
      return res.status(500).json({ message: "No se pudo crear la tienda." });
    }
  });

  app.get("/api/stores/mine", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const store = await genFebStorage.getStoreByOwnerUserId(userId);
      if (!store) return res.status(404).json({ message: "Aún no tienes una tienda." });
      const repaired = await repairStoreSubscriptionVisibilityIfNeeded(store);
      const hasPending = await storeHasPendingSubscriptionPayment(repaired.id);
      return res.json({
        store: serializeStore(repaired, { hasPendingSubscriptionPayment: hasPending, isOwner: true }),
      });
    } catch (e) {
      console.error("[stores] mine", e);
      return res.status(500).json({ message: "No se pudo cargar tu tienda." });
    }
  });

  app.patch("/api/stores/mine", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const store = await genFebStorage.getStoreByOwnerUserId(userId);
      if (!store) return res.status(404).json({ message: "Aún no tienes una tienda." });
      const parsed = updateStoreSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      const updated = await genFebStorage.updateStore(store.id, parsed.data);
      const hasPending = await storeHasPendingSubscriptionPayment(updated.id);
      return res.json({
        store: serializeStore(updated, { hasPendingSubscriptionPayment: hasPending, isOwner: true }),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      console.error("[stores] update mine", e);
      return res.status(500).json({ message: "No se pudo actualizar la tienda." });
    }
  });

  app.get("/api/stores", async (req, res) => {
    try {
      const parsed = storesCatalogQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: "Parámetros inválidos.", errors: parsed.error.errors });
      }
      const stores = await genFebStorage.listActiveStores({ limit: 200 });
      const filtered = filterStoresByCatalogQuery(stores, {
        q: parsed.data.q,
        rubro: parsed.data.rubro,
      });
      return res.json({ stores: filtered.map(serializeStoreCatalogItem) });
    } catch (e) {
      console.error("[stores] catalog list", e);
      return res.status(500).json({ message: "No se pudo cargar el catálogo de tiendas." });
    }
  });

  app.patch("/api/stores/:storeId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      await requireStoreOwner(userId, storeId);
      const parsed = updateStoreSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      const store = await genFebStorage.updateStore(storeId, parsed.data);
      return res.json({ store: serializeStore(store, { isOwner: true }) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No eres dueño de esta tienda." });
      console.error("[stores] update", e);
      return res.status(500).json({ message: "No se pudo actualizar la tienda." });
    }
  });

  app.post("/api/stores/:storeId/subscription-payment", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const storeId = Number(req.params.storeId);
      if (!Number.isFinite(storeId) || storeId <= 0) {
        return res.status(400).json({ message: "ID de tienda inválido." });
      }
      const parsed = storeSubscriptionPaymentBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      const result = await submitStoreSubscriptionPayment({
        userId,
        storeId,
        body: parsed.data,
      });
      return res.status(201).json({
        reportId: result.reportId,
        message: "Comprobante registrado. El equipo lo revisará pronto.",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No eres dueño de esta tienda." });
      if (msg === "STORE_PAYMENT_ALREADY_PENDING") {
        return res.status(409).json({ message: "Ya hay un comprobante en revisión. Espera la validación del equipo." });
      }
      console.error("[stores] subscription-payment", e);
      return res.status(500).json({ message: "No se pudo registrar el comprobante." });
    }
  });

  app.get("/api/stores/:storeId/categories", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      await requireStoreOwner(userId, storeId);
      const [categories, products] = await Promise.all([
        genFebStorage.listStoreCategories(storeId),
        genFebStorage.listStoreProducts(storeId),
      ]);
      return res.json({ categories: categories.map((c) => serializeStoreCategory(c, products)) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No eres dueño de esta tienda." });
      console.error("[stores] list categories", e);
      return res.status(500).json({ message: "No se pudieron cargar las categorías." });
    }
  });

  app.post("/api/stores/:storeId/categories", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      await requireStoreOwner(userId, storeId);
      const parsed = insertStoreCategorySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      const productIds = parsed.data.productIds ?? [];
      await assertStoreProductIds(storeId, productIds);
      const category = await genFebStorage.createStoreCategory(storeId, {
        name: parsed.data.name,
        description: parsed.data.description,
      });
      await syncCategoryProductMembership(storeId, category.id, productIds);
      const products = await genFebStorage.listStoreProducts(storeId);
      return res.status(201).json({ category: serializeStoreCategory(category, products) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No eres dueño de esta tienda." });
      if (msg === "STORE_PRODUCT_INVALID") {
        return res.status(400).json({ message: "Uno o más productos no pertenecen a esta tienda." });
      }
      console.error("[stores] create category", e);
      return res.status(500).json({ message: "No se pudo crear la categoría." });
    }
  });

  app.get("/api/stores/:storeId/categories/:categoryId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      const categoryId = parsePositiveIntParam(req.params.categoryId);
      if (!storeId || !categoryId) return res.status(400).json({ message: "ID inválido." });
      await requireStoreOwner(userId, storeId);
      const category = await genFebStorage.getStoreCategory(storeId, categoryId);
      if (!category) return res.status(404).json({ message: "Categoría no encontrada." });
      const products = await genFebStorage.listStoreProducts(storeId);
      return res.json({ category: serializeStoreCategory(category, products) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No eres dueño de esta tienda." });
      console.error("[stores] get category", e);
      return res.status(500).json({ message: "No se pudo cargar la categoría." });
    }
  });

  app.patch("/api/stores/:storeId/categories/:categoryId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      const categoryId = parsePositiveIntParam(req.params.categoryId);
      if (!storeId || !categoryId) return res.status(400).json({ message: "ID inválido." });
      await requireStoreOwner(userId, storeId);
      const parsed = updateStoreCategorySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      if (parsed.data.productIds != null) {
        await assertStoreProductIds(storeId, parsed.data.productIds);
      }
      const category = await genFebStorage.updateStoreCategory(storeId, categoryId, {
        name: parsed.data.name,
        description: parsed.data.description,
      });
      if (parsed.data.productIds != null) {
        await syncCategoryProductMembership(storeId, categoryId, parsed.data.productIds);
      }
      const products = await genFebStorage.listStoreProducts(storeId);
      return res.json({ category: serializeStoreCategory(category, products) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No eres dueño de esta tienda." });
      if (msg === "STORE_CATEGORY_NOT_FOUND") return res.status(404).json({ message: "Categoría no encontrada." });
      if (msg === "STORE_PRODUCT_INVALID") {
        return res.status(400).json({ message: "Uno o más productos no pertenecen a esta tienda." });
      }
      console.error("[stores] update category", e);
      return res.status(500).json({ message: "No se pudo actualizar la categoría." });
    }
  });

  app.delete("/api/stores/:storeId/categories/:categoryId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      const categoryId = parsePositiveIntParam(req.params.categoryId);
      if (!storeId || !categoryId) return res.status(400).json({ message: "ID inválido." });
      await requireStoreOwner(userId, storeId);
      await removeCategoryFromAllProducts(storeId, categoryId);
      await genFebStorage.deleteStoreCategory(storeId, categoryId);
      return res.status(204).send();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No eres dueño de esta tienda." });
      if (msg === "STORE_CATEGORY_NOT_FOUND") return res.status(404).json({ message: "Categoría no encontrada." });
      console.error("[stores] delete category", e);
      return res.status(500).json({ message: "No se pudo eliminar la categoría." });
    }
  });

  app.get("/api/stores/:storeId/products", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      await requireStoreOwner(userId, storeId);
      const products = await genFebStorage.listStoreProducts(storeId);
      return res.json({ products: products.map(serializeStoreProduct) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No eres dueño de esta tienda." });
      console.error("[stores] list products", e);
      return res.status(500).json({ message: "No se pudieron cargar los productos." });
    }
  });

  app.post("/api/stores/:storeId/products", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      if (!storeId) return res.status(400).json({ message: "ID de tienda inválido." });
      await requireStoreOwner(userId, storeId);
      const parsed = insertStoreProductSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      await assertStoreCategoryIds(storeId, parsed.data.categoryIds ?? []);
      const product = await genFebStorage.createStoreProduct(storeId, parsed.data);
      return res.status(201).json({ product: serializeStoreProduct(product) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No eres dueño de esta tienda." });
      if (msg === "STORE_CATEGORY_INVALID") {
        return res.status(400).json({ message: "Una o más categorías no son válidas para esta tienda." });
      }
      console.error("[stores] create product", e);
      return res.status(500).json({ message: "No se pudo crear el producto." });
    }
  });

  app.get("/api/stores/:storeId/products/:productId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      const productId = parsePositiveIntParam(req.params.productId);
      if (!storeId || !productId) return res.status(400).json({ message: "ID inválido." });
      await requireStoreOwner(userId, storeId);
      const product = await genFebStorage.getStoreProduct(storeId, productId);
      if (!product) return res.status(404).json({ message: "Producto no encontrado." });
      return res.json({ product: serializeStoreProduct(product) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No eres dueño de esta tienda." });
      console.error("[stores] get product", e);
      return res.status(500).json({ message: "No se pudo cargar el producto." });
    }
  });

  app.patch("/api/stores/:storeId/products/:productId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      const productId = parsePositiveIntParam(req.params.productId);
      if (!storeId || !productId) return res.status(400).json({ message: "ID inválido." });
      await requireStoreOwner(userId, storeId);
      const parsed = updateStoreProductSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      if (parsed.data.categoryIds != null) {
        await assertStoreCategoryIds(storeId, parsed.data.categoryIds);
      }
      const product = await genFebStorage.updateStoreProduct(storeId, productId, parsed.data);
      return res.json({ product: serializeStoreProduct(product) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No eres dueño de esta tienda." });
      if (msg === "STORE_PRODUCT_NOT_FOUND") return res.status(404).json({ message: "Producto no encontrado." });
      if (msg === "STORE_CATEGORY_INVALID") {
        return res.status(400).json({ message: "Una o más categorías no son válidas para esta tienda." });
      }
      console.error("[stores] update product", e);
      return res.status(500).json({ message: "No se pudo actualizar el producto." });
    }
  });

  app.delete("/api/stores/:storeId/products/:productId", authenticateJWT, async (req: any, res) => {
    try {
      const userId = String(req.user?.id ?? "");
      const storeId = parsePositiveIntParam(req.params.storeId);
      const productId = parsePositiveIntParam(req.params.productId);
      if (!storeId || !productId) return res.status(400).json({ message: "ID inválido." });
      await requireStoreOwner(userId, storeId);
      await genFebStorage.deleteStoreProduct(storeId, productId);
      return res.status(204).send();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "UNAUTHORIZED") return res.status(401).json({ message: "Unauthorized" });
      if (msg === "STORE_NOT_FOUND") return res.status(404).json({ message: "Tienda no encontrada." });
      if (msg === "STORE_FORBIDDEN") return res.status(403).json({ message: "No eres dueño de esta tienda." });
      if (msg === "STORE_PRODUCT_NOT_FOUND") return res.status(404).json({ message: "Producto no encontrado." });
      console.error("[stores] delete product", e);
      return res.status(500).json({ message: "No se pudo eliminar el producto." });
    }
  });

  app.get("/api/stores/:slug/showcase-products", optionalAuthenticateJWT, async (req: any, res) => {
    try {
      const slug = String(req.params.slug ?? "").trim();
      if (!slug) return res.status(400).json({ message: "Slug inválido." });

      const store = await genFebStorage.getStoreBySlug(slug);
      if (!store) return res.status(404).json({ message: "Tienda no encontrada." });

      const viewerId = req.user?.id != null ? String(req.user.id) : null;
      const isOwner = viewerId != null && viewerId === store.ownerUserId;
      const storeForView =
        isOwner ? await repairStoreSubscriptionVisibilityIfNeeded(store) : store;
      const visibilityActive = isStoreVisibilityActive(storeForView);

      if (!visibilityActive && !isOwner) {
        return res.json({ products: [], visibilityActive: false, inactive: true });
      }

      const all = await genFebStorage.listStoreProducts(storeForView.id);
      const products = all
        .filter((p) => p.showOnShowcase !== false)
        .map(serializeStoreShowcaseProduct);

      return res.json({
        products,
        visibilityActive,
        isOwner,
      });
    } catch (e) {
      console.error("[stores] showcase-products", e);
      return res.status(500).json({ message: "No se pudieron cargar los productos de la vitrina." });
    }
  });

  app.get("/api/stores/:slug", optionalAuthenticateJWT, async (req: any, res) => {
    try {
      const slug = String(req.params.slug ?? "").trim();
      if (!slug) return res.status(400).json({ message: "Slug inválido." });
      if (slug === "mine") {
        return res.status(404).json({ message: "Usa GET /api/stores/mine con autenticación." });
      }

      const store = await genFebStorage.getStoreBySlug(slug);
      if (!store) return res.status(404).json({ message: "Tienda no encontrada." });

      const viewerId = req.user?.id != null ? String(req.user.id) : null;
      const isOwner = viewerId != null && viewerId === store.ownerUserId;
      const storeForView =
        isOwner ? await repairStoreSubscriptionVisibilityIfNeeded(store) : store;
      const visibilityActive = isStoreVisibilityActive(storeForView);
      const hasPending = isOwner ? await storeHasPendingSubscriptionPayment(storeForView.id) : false;

      if (!visibilityActive && !isOwner) {
        return res.json({
          store: serializeStore(storeForView, { isOwner: false }),
          isOwner: false,
          visibilityActive: false,
          inactive: true,
        });
      }

      return res.json({
        store: serializeStore(storeForView, {
          hasPendingSubscriptionPayment: hasPending,
          isOwner,
        }),
        isOwner,
        visibilityActive,
      });
    } catch (e) {
      console.error("[stores] by slug", e);
      return res.status(500).json({ message: "No se pudo cargar la tienda." });
    }
  });

  app.get("/api/ingredients-materials", async (req, res) => {
    try {
      const parsed = ingredientsListQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: "Parámetros inválidos.", errors: parsed.error.errors });
      }
      const result = await genFebStorage.listIngredientsMaterials({
        q: parsed.data.q,
        page: parsed.data.page,
        limit: INGREDIENTS_MATERIALS_PAGE_SIZE,
      });
      return res.json({
        items: result.items.map((item) => ({
          id: item.id,
          name: item.name,
          normalizedName: item.normalizedName,
          createdAt: serializeDate(item.createdAt),
        })),
        total: result.total,
        page: result.page,
        limit: result.limit,
      });
    } catch (e) {
      console.error("[ingredients-materials] list", e);
      return res.status(500).json({ message: "No se pudo listar ingredientes y materiales." });
    }
  });

  app.post("/api/ingredients-materials", authenticateJWT, async (req: any, res) => {
    try {
      const parsed = insertIngredientMaterialSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "Datos inválidos",
          errors: parsed.error.errors,
        });
      }
      const userId = String(req.user?.id ?? "");
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const item = await genFebStorage.createIngredientMaterial(parsed.data);
      return res.status(201).json({
        item: {
          id: item.id,
          name: item.name,
          normalizedName: item.normalizedName,
          createdAt: serializeDate(item.createdAt),
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "INGREDIENT_MATERIAL_ALREADY_EXISTS") {
        return res.status(409).json({ message: "Ya existe un ingrediente o material con ese nombre." });
      }
      console.error("[ingredients-materials] create", e);
      return res.status(500).json({ message: "No se pudo crear el ingrediente o material." });
    }
  });
}
