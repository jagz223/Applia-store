/**
 * Servicio de dominio: códigos promocionales / tickets.
 * Encapsula validación condicional y reglas de negocio de expiración y beneficios.
 */

import type { IStorage } from "../storage-genfeb";
import {
  applySubscriptionDiscountPercent,
  createPromotionalCodeSchema,
  redeemPromotionalCodeRequestSchema,
  updatePromotionalCodeSchema,
  type CreatePromotionalCodeInput,
  type PromotionalCodeBenefitType,
  type PromotionalCodeValidationResult,
  type RedeemPromotionalCodeRequest,
  type RedeemPromotionalCodeResult,
  type UpdatePromotionalCodeInput,
} from "@shared/promotional-code-schema";
import type { PromotionalCode } from "@shared/schema-genfeb";
import {
  PROMO_CODE_MSG_ALREADY_REDEEMED_BY_USER,
  PROMO_CODE_MSG_NO_LONGER_AVAILABLE,
  userHasRedeemedPromotionalCode,
} from "@shared/promotional-code-utils";

export class PromotionalCodeService {
  constructor(private readonly storage: IStorage) {}

  async listPromotionalCodes(): Promise<PromotionalCode[]> {
    return this.storage.getPromotionalCodes();
  }

  async getPromotionalCodeById(id: number): Promise<PromotionalCode | undefined> {
    return this.storage.getPromotionalCodeById(id);
  }

  /**
   * Crea y persiste un código promocional (panel admin).
   * Aplica validación condicional estricta según el tipo de expiración.
   */
  async createPromotionalCode(rawInput: unknown): Promise<PromotionalCode> {
    const input: CreatePromotionalCodeInput = createPromotionalCodeSchema.parse(rawInput);
    const normalizedCode = input.code.trim().toUpperCase();

    const existing = await this.storage.getPromotionalCodeByCode(normalizedCode);
    if (existing) {
      throw new PromotionalCodeConflictError("Ya existe un código promocional con este identificador");
    }

    return this.storage.createPromotionalCode({
      code: normalizedCode,
      expirationType: input.expirationType,
      expiresAt: input.expirationType === "por_tiempo" ? input.expiresAt : null,
      maxUses: input.expirationType === "por_usos" ? input.maxUses : null,
      benefitType: input.benefitType,
      benefitValue: String(input.benefitValue),
    });
  }

  /**
   * Actualiza un código promocional existente (panel admin).
   */
  async updatePromotionalCode(id: number, rawInput: unknown): Promise<PromotionalCode> {
    const input: UpdatePromotionalCodeInput = updatePromotionalCodeSchema.parse(rawInput);
    const existing = await this.storage.getPromotionalCodeById(id);
    if (!existing) {
      throw new PromotionalCodeNotFoundError("Código promocional no encontrado");
    }

    const normalizedCode = input.code.trim().toUpperCase();
    if (String(existing.code).toUpperCase() !== normalizedCode) {
      const conflict = await this.storage.getPromotionalCodeByCode(normalizedCode);
      if (conflict && conflict.id !== id) {
        throw new PromotionalCodeConflictError("Ya existe un código promocional con este identificador");
      }
    }

    const updated = await this.storage.updatePromotionalCode(id, {
      code: normalizedCode,
      expirationType: input.expirationType,
      expiresAt: input.expirationType === "por_tiempo" ? input.expiresAt : null,
      maxUses: input.expirationType === "por_usos" ? input.maxUses : null,
      benefitType: input.benefitType,
      benefitValue: String(input.benefitValue),
    });

    if (!updated) {
      throw new PromotionalCodeNotFoundError("Código promocional no encontrado");
    }

    return updated;
  }

  /**
   * Elimina un código promocional.
   */
  async deletePromotionalCode(id: number): Promise<void> {
    const existing = await this.storage.getPromotionalCodeById(id);
    if (!existing) {
      throw new PromotionalCodeNotFoundError("Código promocional no encontrado");
    }
    await this.storage.deletePromotionalCode(id);
  }

  /**
   * Valida un código en el flujo de pago del cliente.
   * Un canje por cuenta; mensajes genéricos si el código ya no aplica.
   */
  async validatePromotionalCode(code: string, userId?: string): Promise<PromotionalCodeValidationResult> {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      return { valid: false, message: "El código es obligatorio" };
    }

    const promo = await this.storage.getPromotionalCodeByCode(normalizedCode);
    if (!promo) {
      return { valid: false, message: "No encontramos ese código. Revisa que esté escrito correctamente." };
    }

    if (promo.isActive === false) {
      return { valid: false, message: PROMO_CODE_MSG_NO_LONGER_AVAILABLE };
    }

    if (userHasRedeemedPromotionalCode(promo.usedByUserCounts as Record<string, number>, userId)) {
      return { valid: false, message: PROMO_CODE_MSG_ALREADY_REDEEMED_BY_USER };
    }

    if (this.isPromoNoLongerAvailable(promo)) {
      return { valid: false, message: PROMO_CODE_MSG_NO_LONGER_AVAILABLE };
    }

    const benefitValue = parseFloat(String(promo.benefitValue));
    if (!Number.isFinite(benefitValue) || benefitValue <= 0) {
      return { valid: false, message: "Código promocional mal configurado (beneficio inválido)" };
    }

    return {
      valid: true,
      benefitType: promo.benefitType as PromotionalCodeBenefitType,
      benefitValue,
    };
  }

  /**
   * Canjea un código en el flujo de pago de mensualidad: valida, incrementa uso y devuelve el beneficio.
   */
  async redeemPromotionalCodeForSubscription(
    rawInput: unknown,
    userId: string,
  ): Promise<RedeemPromotionalCodeResult> {
    const input: RedeemPromotionalCodeRequest = redeemPromotionalCodeRequestSchema.parse(rawInput);
    const validation = await this.validatePromotionalCode(input.code, userId);
    if (!validation.valid) {
      throw new PromotionalCodeRedeemError(validation.message);
    }

    const promo = await this.storage.getPromotionalCodeByCode(input.code.trim().toUpperCase());
    if (!promo?.id) {
      throw new PromotionalCodeRedeemError("No encontramos ese código. Revisa que esté escrito correctamente.");
    }

    await this.storage.incrementPromotionalCodeUsedCount(Number(promo.id), userId);

    const months = Math.max(1, Math.min(12, Math.trunc(input.subscriptionMonths)));
    const originalTotalUsd = Math.round(input.monthlyUsd * months * 100) / 100;

    if (validation.benefitType === "meses_gratuitos") {
      const monthsGranted = Math.max(1, Math.trunc(validation.benefitValue));
      return {
        applied: "meses_gratuitos",
        monthsGranted,
        message: `Se aplicaron ${monthsGranted} mes${monthsGranted === 1 ? "" : "es"} gratuitos a tu suscripción.`,
      };
    }

    const discountedTotalUsd = applySubscriptionDiscountPercent(originalTotalUsd, validation.benefitValue);
    const discountUsd = Math.round((originalTotalUsd - discountedTotalUsd) * 100) / 100;

    return {
      applied: "descuento",
      benefitValue: validation.benefitValue,
      originalTotalUsd,
      discountedTotalUsd,
      discountUsd,
    };
  }

  private isPromoNoLongerAvailable(promo: PromotionalCode): boolean {
    const now = new Date();

    if (promo.expirationType === "por_tiempo") {
      if (!promo.expiresAt) return true;
      if (now > new Date(promo.expiresAt)) return true;
    }

    if (promo.expirationType === "por_usos") {
      const maxUses = promo.maxUses ?? 0;
      const usedCount = promo.usedCount ?? 0;
      if (maxUses < 1) return true;
      if (usedCount >= maxUses) return true;
    }

    return false;
  }
}

export class PromotionalCodeRedeemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromotionalCodeRedeemError";
  }
}

export class PromotionalCodeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromotionalCodeConflictError";
  }
}

export class PromotionalCodeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromotionalCodeNotFoundError";
  }
}
