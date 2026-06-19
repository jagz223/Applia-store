import { MAN_GO_CATEGORY_SLUG, normalizeProviderCategorySlug } from "@shared/default-categories";
import { PROFESSIONAL_CATEGORY_SLUG } from "@shared/provider-preparation";
import { serviceBelongsToBrand } from "@shared/service-belongs-to-brand";

export type AdminProviderCategoryOption = { id: number; slug: string; displayName: string };

export type AdminProviderDetailService = {
  id: number;
  title: string;
  description: string;
  price: string;
  imageUrl: string;
  isActive: boolean;
  categoryId: number;
  categorySlug?: string | null;
  categoryDisplayName?: string | null;
  subcategoryId: number | null;
  subcategoryName?: string | null;
  listingBio: string | null;
  listingProfession: string | null;
  listingYearsExperience: number | null;
  listingSkills: string[];
  listingPreparationLevel: string | null;
  listingCertifications: string | null;
};

export type AdminProviderDetailPayload = {
  provider: {
    id: number;
    userId: string;
    profession: string;
    bio: string;
    yearsExperience: number;
    hourlyRate: string | null;
    skills: string[];
    isVerified: boolean;
    categoryId: number | null;
    secondCategoryId: number | null;
    thirdCategoryId: number | null;
    subcategoryId: number | null;
    goBrands: string[];
    preparationLevel: string;
    certifications: string;
    subscriptionCategorySlug: string | null;
    visibilitySubscriptionEndsAt: string | null;
    subscriptionDaysRemaining: number | null;
    goDriverOfferTitle: string | null;
    goDriverOfferDescription: string | null;
  };
  user: {
    id: string;
    name: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    role: string;
    rating: number;
    ratingCount: number;
    wallet: number | null;
  } | null;
  services: AdminProviderDetailService[];
  vehicle: Record<string, unknown> | null;
  bookingsCount: number;
  categories: AdminProviderCategoryOption[];
  verificationDocuments?: {
    avatar: string | null;
    userIdentification: string | null;
    professionalCredentialUrl: string | null;
    providerCategorySlug: string | null;
  };
};

export async function fetchAdminProviderDetail(providerId: number): Promise<AdminProviderDetailPayload> {
  const token = localStorage.getItem("token");
  const res = await fetch(`/api/admin/providers/${providerId}/detail`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let msg = "Error al cargar";
    try {
      const j = (await res.json()) as { message?: string };
      if (j.message) msg = j.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<AdminProviderDetailPayload>;
}

export async function patchAdminProviderDetail(providerId: number, body: unknown): Promise<unknown> {
  const token = localStorage.getItem("token");
  const res = await fetch(`/api/admin/providers/${providerId}/detail`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = "No se pudo guardar";
    try {
      const j = (await res.json()) as { message?: string };
      if (j.message) msg = j.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

export function snapshotKey(draft: AdminProviderDetailPayload, subscriptionEndsLocal: string): string {
  return JSON.stringify({ draft, subscriptionEndsLocal });
}

/** Man Go / Pro Go: el asociado puede tener varias fichas de servicio en la misma marca. */
export function isMultiServiceCatalogBrandSlug(slug: string | null | undefined): boolean {
  const s = normalizeProviderCategorySlug(slug);
  return s === MAN_GO_CATEGORY_SLUG || s === PROFESSIONAL_CATEGORY_SLUG;
}

/** Fichas de servicio cuya categoría coincide con la del slot (principal / secundaria / terciaria). */
export function providerServicesForCategorySlot(
  services: readonly AdminProviderDetailService[],
  categoryId: number | null | undefined,
  categories: readonly AdminProviderCategoryOption[],
): AdminProviderDetailService[] {
  const brandId = Number(categoryId);
  if (!Number.isFinite(brandId) || brandId <= 0) return [];
  return services.filter((s) => serviceBelongsToBrand(s, brandId, categories));
}

export function normalizeListingSkills(skills: string[] | undefined | null): string[] {
  return (skills ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, 20);
}

function normalizeGoBrands(brands: string[] | undefined | null): ("transport" | "delivery")[] {
  return (brands ?? [])
    .filter((b): b is "transport" | "delivery" => b === "transport" || b === "delivery")
    .sort();
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function pickChangedFields<T extends Record<string, unknown>>(
  current: T,
  original: T,
  keys: readonly (keyof T)[],
): Partial<T> | undefined {
  const patch: Partial<T> = {};
  for (const key of keys) {
    if (!valuesEqual(current[key], original[key])) {
      patch[key] = current[key];
    }
  }
  return Object.keys(patch).length > 0 ? patch : undefined;
}

function buildServicePatch(
  current: AdminProviderDetailService,
  original: AdminProviderDetailService | undefined,
): Record<string, unknown> | null {
  if (!original) return null;
  const normalizedCurrent = {
    title: current.title,
    description: current.description,
    price: current.price,
    imageUrl: current.imageUrl,
    isActive: current.isActive,
    categoryId: current.categoryId,
    subcategoryId: current.subcategoryId,
    listingBio: current.listingBio,
    listingProfession: current.listingProfession,
    listingYearsExperience: current.listingYearsExperience,
    listingSkills: normalizeListingSkills(current.listingSkills),
    listingPreparationLevel: current.listingPreparationLevel,
    listingCertifications: current.listingCertifications,
  };
  const normalizedOriginal = {
    title: original.title,
    description: original.description,
    price: original.price,
    imageUrl: original.imageUrl,
    isActive: original.isActive,
    categoryId: original.categoryId,
    subcategoryId: original.subcategoryId,
    listingBio: original.listingBio,
    listingProfession: original.listingProfession,
    listingYearsExperience: original.listingYearsExperience,
    listingSkills: normalizeListingSkills(original.listingSkills),
    listingPreparationLevel: original.listingPreparationLevel,
    listingCertifications: original.listingCertifications,
  };
  const patch = pickChangedFields(
    normalizedCurrent as Record<string, unknown>,
    normalizedOriginal as Record<string, unknown>,
    Object.keys(normalizedCurrent) as (keyof typeof normalizedCurrent)[],
  );
  if (!patch) return null;
  return { id: current.id, ...patch };
}

/** Envía solo los campos que cambiaron respecto al baseline (evita rechazos Zod por datos legados incompletos). */
export function buildProviderDetailPatchBody(
  draft: AdminProviderDetailPayload,
  subscriptionEndsLocal: string,
  baseline: AdminProviderDetailPayload,
  baselineSubscriptionEndsLocal: string,
  extras?: { newPassword?: string },
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (draft.user && baseline.user) {
    const userPatch = pickChangedFields(
      {
        name: draft.user.name,
        lastName: draft.user.lastName,
        email: draft.user.email,
        phone: draft.user.phone,
        role: draft.user.role,
      },
      {
        name: baseline.user.name,
        lastName: baseline.user.lastName,
        email: baseline.user.email,
        phone: baseline.user.phone,
        role: baseline.user.role,
      },
      ["name", "lastName", "email", "phone", "role"],
    );
    if (userPatch) {
      body.user = userPatch;
    }
  }

  const password = extras?.newPassword?.trim();
  if (password) {
    body.user = { ...(body.user as Record<string, unknown> | undefined), newPassword: password };
  }

  const p = draft.provider;
  const bp = baseline.provider;
  const providerPatch = pickChangedFields(
    {
      profession: p.profession,
      bio: p.bio,
      yearsExperience: p.yearsExperience,
      hourlyRate: p.hourlyRate,
      skills: p.skills,
      isVerified: p.isVerified,
      categoryId: p.categoryId,
      secondCategoryId: p.secondCategoryId,
      thirdCategoryId: p.thirdCategoryId,
      subcategoryId: p.subcategoryId,
      goBrands: normalizeGoBrands(p.goBrands),
      preparationLevel: p.preparationLevel || null,
      certifications: p.certifications || null,
      subscriptionCategorySlug: p.subscriptionCategorySlug,
      goDriverOfferTitle: p.goDriverOfferTitle,
      goDriverOfferDescription: p.goDriverOfferDescription,
    },
    {
      profession: bp.profession,
      bio: bp.bio,
      yearsExperience: bp.yearsExperience,
      hourlyRate: bp.hourlyRate,
      skills: bp.skills,
      isVerified: bp.isVerified,
      categoryId: bp.categoryId,
      secondCategoryId: bp.secondCategoryId,
      thirdCategoryId: bp.thirdCategoryId,
      subcategoryId: bp.subcategoryId,
      goBrands: normalizeGoBrands(bp.goBrands),
      preparationLevel: bp.preparationLevel || null,
      certifications: bp.certifications || null,
      subscriptionCategorySlug: bp.subscriptionCategorySlug,
      goDriverOfferTitle: bp.goDriverOfferTitle,
      goDriverOfferDescription: bp.goDriverOfferDescription,
    },
    [
      "profession",
      "bio",
      "yearsExperience",
      "hourlyRate",
      "skills",
      "isVerified",
      "categoryId",
      "secondCategoryId",
      "thirdCategoryId",
      "subcategoryId",
      "goBrands",
      "preparationLevel",
      "certifications",
      "subscriptionCategorySlug",
      "goDriverOfferTitle",
      "goDriverOfferDescription",
    ],
  );

  const nextVisibilityEnds = fromDatetimeLocalValue(subscriptionEndsLocal);
  const prevVisibilityEnds = fromDatetimeLocalValue(baselineSubscriptionEndsLocal);
  const finalizeProviderPatch = (patch: Record<string, unknown>): Record<string, unknown> => {
    if (Array.isArray(patch.goBrands) && patch.goBrands.length === 0) {
      return { ...patch, goBrands: null };
    }
    return patch;
  };

  if (!valuesEqual(nextVisibilityEnds, prevVisibilityEnds)) {
    body.provider = finalizeProviderPatch({
      ...(providerPatch ?? {}),
      visibilitySubscriptionEndsAt: nextVisibilityEnds,
    });
  } else if (providerPatch) {
    body.provider = finalizeProviderPatch(providerPatch as Record<string, unknown>);
  }

  const baselineServicesById = new Map(baseline.services.map((s) => [s.id, s]));
  const servicePatches = draft.services
    .map((svc) => buildServicePatch(svc, baselineServicesById.get(svc.id)))
    .filter((patch): patch is Record<string, unknown> => patch != null);
  if (servicePatches.length > 0) {
    body.services = servicePatches;
  }

  if (draft.vehicle && baseline.vehicle) {
    const vehiclePatch = pickChangedFields(
      draft.vehicle as Record<string, unknown>,
      baseline.vehicle as Record<string, unknown>,
      Object.keys({ ...baseline.vehicle, ...draft.vehicle }),
    );
    if (vehiclePatch) body.vehicle = vehiclePatch;
  } else if (!valuesEqual(draft.vehicle, baseline.vehicle)) {
    body.vehicle = draft.vehicle;
  }

  return body;
}
