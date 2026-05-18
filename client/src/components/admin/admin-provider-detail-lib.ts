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

export function buildProviderDetailPatchBody(
  draft: AdminProviderDetailPayload,
  subscriptionEndsLocal: string,
): Record<string, unknown> {
  const p = draft.provider;
  const u = draft.user;
  return {
    user: u
      ? {
          name: u.name,
          lastName: u.lastName,
          email: u.email ?? undefined,
          phone: u.phone,
          role: u.role,
        }
      : undefined,
    provider: {
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
      goBrands: p.goBrands.length
        ? p.goBrands.filter((b): b is "transport" | "delivery" | "marketplace" =>
            b === "transport" || b === "delivery" || b === "marketplace",
          )
        : null,
      preparationLevel: p.preparationLevel || null,
      certifications: p.certifications || null,
      subscriptionCategorySlug: p.subscriptionCategorySlug,
      visibilitySubscriptionEndsAt: fromDatetimeLocalValue(subscriptionEndsLocal),
      goDriverOfferTitle: p.goDriverOfferTitle,
      goDriverOfferDescription: p.goDriverOfferDescription,
    },
    services: draft.services.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      price: s.price,
      imageUrl: s.imageUrl,
      isActive: s.isActive,
      categoryId: s.categoryId,
      subcategoryId: s.subcategoryId,
      listingBio: s.listingBio,
      listingProfession: s.listingProfession,
      listingYearsExperience: s.listingYearsExperience,
      listingSkills: normalizeListingSkills(s.listingSkills),
      listingPreparationLevel: s.listingPreparationLevel,
      listingCertifications: s.listingCertifications,
    })),
    vehicle: draft.vehicle,
  };
}
