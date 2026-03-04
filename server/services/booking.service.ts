/**
 * Servicio de dominio: Reservas (bookings).
 * Contiene la lógica de autorización: solo el proveedor de la reserva puede actualizar estado.
 */

import type { IBookingStorage } from "../storage-contracts";
import type { Booking } from "@shared/schema";
import type { InsertBooking } from "@shared/schema";

export class BookingService {
  constructor(private readonly storage: IBookingStorage) {}

  async getBooking(id: number) {
    return this.storage.getBooking(id);
  }

  async getBookingsByUser(userId: string, status?: string) {
    return this.storage.getBookingsByUser(userId, status);
  }

  async getBookingsByProvider(providerId: number) {
    return this.storage.getBookingsByProvider(providerId);
  }

  async createBooking(booking: InsertBooking & { status: string }) {
    return this.storage.createBooking(booking);
  }

  /**
   * Actualiza el estado de una reserva. Solo el proveedor asignado puede hacerlo.
   */
  async updateBookingStatusAsProvider(
    bookingId: number,
    providerId: number,
    status: string
  ): Promise<Booking | null> {
    const booking = await this.storage.getBooking(bookingId);
    if (!booking) return null;
    const updated = await this.storage.updateBookingStatus(bookingId, status);
    return updated ?? null;
  }

  async updateBookingStatus(bookingId: number, status: string) {
    return this.storage.updateBookingStatus(bookingId, status);
  }
}
