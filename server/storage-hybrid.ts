/**
 * Almacenamiento híbrido: Firestore para entidades principales (usuarios, categorías,
 * proveedores, servicios, reservas) y memoria para el resto cuando Firebase está configurado.
 */

import type { IStorage } from "./storage-applia";
import type { FirestoreStorage } from "./storage-firestore";

const FIRESTORE_METHODS = new Set([
  "getUserById", "getUserByEmail", "getUserByPhone", "createUser", "updateUser", "updateUserPassword",
  "getUserRole", "updateUserRole",
  "getCategories", "updateCategory", "getSubcategories", "getSubcategoryById", "createSubcategory", "updateSubcategory", "getAllProviders", "getProvider", "getProviderByUserId", "createProvider", "createProviderVehicle", "getPrimaryVehicleByProviderId", "getPrimaryVehicleByUserId", "getPrimaryVehicleFullByUserId", "upsertPrimaryProviderVehicle",
  "getAllServices", "getService", "getServicesByProviderId", "createService", "updateService", "deleteService",
  "getBookingsByUser", "getBookingsByProvider", "getBooking", "createBooking", "updateBookingStatus", "updateBookingCost", "updateBookingSchedule", "acknowledgeBookingProChanges", "confirmBookingByClient", "completeBookingAndReleaseEscrow", "cancelBookingAndRefundClientEscrow",
  "getPendingBookingRatings", "submitBookingRating",
  "getProfessionalVerificationByUserId", "upsertProfessionalVerificationImage", "upsertProfessionalVerificationCredential", "upsertProfessionalVerificationPayment",
  "getVerifyingStatusByUserId",
  "upsertVerifyingStatusIdentificationPending",
  "upsertVerifyingStatusTransactionPending",
  "getPendingVerifyingStatuses",
  "setVerifyingStatusIdentification",
  "setVerifyingStatusTransaction",
  "incrementPendingIdResubmitCount",
  "incrementPendingCredentialResubmitCount",
  "upsertVerifyingStatusPrefundPromoAwaitingDossier",
  "clearVerifyingStatusPrefundPromoAwaitingDossier",
  "mergeProfessionalVerificationFreeMonthsPrefundPlaceholder",
  "getNotifications", "createNotification", "markNotificationAsRead", "markAllNotificationsAsReadForUser",
  "createAccountChangeRequest", "getMyAccountChangeRequests", "getPendingAccountChangeRequests", "resolveAccountChangeRequest",
  // Chat: debe persistir en Firestore para auditoría/admin.
  "getConversationsByUser", "createConversation", "getMessagesByConversation", "getLastMessageByConversation", "getUnreadCountByConversation",
  "createMessage", "markMessageAsRead", "markConversationAsRead", "hideConversationForUsers",
  "patchConversation", "findConversationForServiceBooking", "findConversationForMobilityRide", "listConversationsForAdmin", "sweepStaleMobilityRideChats",
]);

/** Delegador Firestore/memoria alineado con {@link IStorage} en tiempo de ejecución. */
export class HybridStorage {
  constructor(
    private firestore: FirestoreStorage,
    private memory: IStorage,
  ) {}

  private delegate(method: string, args: any[]): Promise<any> {
    if (FIRESTORE_METHODS.has(method)) {
      return (this.firestore as any)[method](...args);
    }
    return (this.memory as any)[method](...args);
  }

  getUserById(id: string) { return this.delegate("getUserById", [id]); }
  getUserByEmail(email: string) { return this.delegate("getUserByEmail", [email]); }
  getUserByPhone(phone: string) { return this.delegate("getUserByPhone", [phone]); }
  createUser(user: any) { return this.delegate("createUser", [user]); }
  updateUser(id: string, data: any) { return this.delegate("updateUser", [id, data]); }
  updateUserPassword(id: string, password: string) { return this.delegate("updateUserPassword", [id, password]); }
  getUserRole(userId: string) { return this.delegate("getUserRole", [userId]); }
  updateUserRole(userId: string, data: any) { return this.delegate("updateUserRole", [userId, data]); }
  getCategories() { return this.delegate("getCategories", []); }
  updateCategory(id: number, data: any) { return this.delegate("updateCategory", [id, data]); }
  getSubcategories(categoryId: number) { return this.delegate("getSubcategories", [categoryId]); }
  getSubcategoryById(id: number) { return this.delegate("getSubcategoryById", [id]); }
  createSubcategory(data: any) { return this.delegate("createSubcategory", [data]); }
  updateSubcategory(id: number, data: any) { return this.delegate("updateSubcategory", [id, data]); }
  getAllProviders(profession?: string) { return this.delegate("getAllProviders", [profession]); }
  getProvider(id: number) { return this.delegate("getProvider", [id]); }
  getProviderByUserId(userId: string) { return this.delegate("getProviderByUserId", [userId]); }
  createProvider(provider: any) { return this.delegate("createProvider", [provider]); }
  createProviderVehicle(input: any) { return this.delegate("createProviderVehicle", [input]); }
  getPrimaryVehicleByProviderId(providerId: number) {
    return this.delegate("getPrimaryVehicleByProviderId", [providerId]);
  }
  getPrimaryVehicleByUserId(userId: string) {
    return this.delegate("getPrimaryVehicleByUserId", [userId]);
  }
  getPrimaryVehicleFullByUserId(userId: string) {
    return this.delegate("getPrimaryVehicleFullByUserId", [userId]);
  }
  upsertPrimaryProviderVehicle(input: any) {
    return this.delegate("upsertPrimaryProviderVehicle", [input]);
  }
  getAllServices(
    categoryId?: number,
    search?: string,
    providerCategoryId?: number,
    subcategoryId?: number,
    includeUnverifiedForAdmin?: boolean
  ) {
    return this.delegate("getAllServices", [categoryId, search, providerCategoryId, subcategoryId, includeUnverifiedForAdmin]);
  }
  getService(id: number, options?: { includeWhenListingUnpublished?: boolean }) {
    return this.delegate("getService", [id, options]);
  }
  getServicesByProviderId(providerId: number) {
    return this.delegate("getServicesByProviderId", [providerId]);
  }
  getProfessionalVerificationByUserId(userId: string) { return this.delegate("getProfessionalVerificationByUserId", [userId]); }
  upsertProfessionalVerificationImage(userId: string, imageUrl: string) {
    return this.delegate("upsertProfessionalVerificationImage", [userId, imageUrl]);
  }
  upsertProfessionalVerificationCredential(userId: string, professionalCredentialUrl: string) {
    return this.delegate("upsertProfessionalVerificationCredential", [userId, professionalCredentialUrl]);
  }
  upsertProfessionalVerificationPayment(
    userId: string,
    data: { transferReceiptCode: string; transferDate: string; subscriptionMonths?: number; subscriptionMonthlyUsd?: number }
  ) {
    return this.delegate("upsertProfessionalVerificationPayment", [userId, data]);
  }
  getVerifyingStatusByUserId(userId: string) {
    return this.delegate("getVerifyingStatusByUserId", [userId]);
  }
  upsertVerifyingStatusIdentificationPending(userId: string, requestType?: "onboarding" | "renewal") {
    return this.delegate("upsertVerifyingStatusIdentificationPending", [userId, requestType]);
  }
  upsertVerifyingStatusTransactionPending(
    userId: string,
    transactionDate: string,
    requestType?: "onboarding" | "renewal"
  ) {
    return this.delegate("upsertVerifyingStatusTransactionPending", [userId, transactionDate, requestType]);
  }
  getPendingVerifyingStatuses() {
    return this.delegate("getPendingVerifyingStatuses", []);
  }
  setVerifyingStatusIdentification(userId: string, status: any) {
    return this.delegate("setVerifyingStatusIdentification", [userId, status]);
  }
  setVerifyingStatusTransaction(userId: string, status: any) {
    return this.delegate("setVerifyingStatusTransaction", [userId, status]);
  }
  incrementPendingIdResubmitCount(userId: string) {
    return this.delegate("incrementPendingIdResubmitCount", [userId]);
  }
  incrementPendingCredentialResubmitCount(userId: string) {
    return this.delegate("incrementPendingCredentialResubmitCount", [userId]);
  }
  upsertVerifyingStatusPrefundPromoAwaitingDossier(userId: string, args: { code: string; monthsGranted: number }) {
    return this.delegate("upsertVerifyingStatusPrefundPromoAwaitingDossier", [userId, args]);
  }
  clearVerifyingStatusPrefundPromoAwaitingDossier(userId: string) {
    return this.delegate("clearVerifyingStatusPrefundPromoAwaitingDossier", [userId]);
  }
  mergeProfessionalVerificationFreeMonthsPrefundPlaceholder(
    userId: string,
    data: {
      transferReceiptCode: string;
      transferDate: string;
      subscriptionMonths: number;
      promotionalCode: string | null;
    },
  ) {
    return this.delegate("mergeProfessionalVerificationFreeMonthsPrefundPlaceholder", [userId, data]);
  }
  createService(service: any) { return this.delegate("createService", [service]); }
  updateService(id: number, data: any) { return this.delegate("updateService", [id, data]); }
  deleteService(id: number) { return this.delegate("deleteService", [id]); }
  getBookingsByUser(userId: string, status?: string) { return this.delegate("getBookingsByUser", [userId, status]); }
  getBookingsByProvider(providerId: number) { return this.delegate("getBookingsByProvider", [providerId]); }
  getBooking(id: number) { return this.delegate("getBooking", [id]); }
  createBooking(booking: any) { return this.delegate("createBooking", [booking]); }
  updateBookingStatus(id: number, status: string) { return this.delegate("updateBookingStatus", [id, status]); }
  updateBookingCost(id: number, cost: number) { return this.delegate("updateBookingCost", [id, cost]); }
  updateBookingSchedule(id: number, date: Date) { return this.delegate("updateBookingSchedule", [id, date]); }
  acknowledgeBookingProChanges(bookingId: number, clientUserId: string) {
    return this.delegate("acknowledgeBookingProChanges", [bookingId, clientUserId]);
  }
  confirmBookingByClient(bookingId: number) { return this.delegate("confirmBookingByClient", [bookingId]); }
  completeBookingAndReleaseEscrow(bookingId: number) { return this.delegate("completeBookingAndReleaseEscrow", [bookingId]); }
  cancelBookingAndRefundClientEscrow(bookingId: number) { return this.delegate("cancelBookingAndRefundClientEscrow", [bookingId]); }
  getPendingBookingRatings(userId: string) { return this.delegate("getPendingBookingRatings", [userId]); }
  submitBookingRating(raterUserId: string, bookingId: number, ratedUserId: string, roleRated: "professional" | "client", stars: number) {
    return this.delegate("submitBookingRating", [raterUserId, bookingId, ratedUserId, roleRated, stars]);
  }

  getPaymentsByUser(userId: string) { return this.memory.getPaymentsByUser(userId); }
  getEscrowPayments(userId: string) { return this.memory.getEscrowPayments(userId); }
  createEscrowPayment(payment: any) { return this.memory.createEscrowPayment(payment); }
  releaseEscrowPayment(paymentId: number, release: boolean, reason?: string) { return this.memory.releaseEscrowPayment(paymentId, release, reason); }
  getUserBalance(userId: string) { return this.memory.getUserBalance(userId); }
  getDocumentsByUser(userId: string, type?: string) { return this.memory.getDocumentsByUser(userId, type); }
  createDocument(doc: any) { return this.memory.createDocument(doc); }
  deleteDocument(id: number, userId: string) { return this.memory.deleteDocument(id, userId); }
  getConversationsByUser(userId: string) { return this.delegate("getConversationsByUser", [userId]); }
  createConversation(conv: any) { return this.delegate("createConversation", [conv]); }
  getMessagesByConversation(conversationId: number, options: { limit: number; before?: number }) { return this.delegate("getMessagesByConversation", [conversationId, options]); }
  getLastMessageByConversation(conversationId: number) { return this.delegate("getLastMessageByConversation", [conversationId]); }
  getUnreadCountByConversation(conversationId: number, userId: string) { return this.delegate("getUnreadCountByConversation", [conversationId, userId]); }
  createMessage(msg: any) { return this.delegate("createMessage", [msg]); }
  markMessageAsRead(messageId: number) { return this.delegate("markMessageAsRead", [messageId]); }
  markConversationAsRead(conversationId: number, userId: string) { return this.delegate("markConversationAsRead", [conversationId, userId]); }
  hideConversationForUsers(conversationId: number, userIds: string[]) { return this.delegate("hideConversationForUsers", [conversationId, userIds]); }
  patchConversation(conversationId: number, patch: Record<string, unknown>) {
    return this.delegate("patchConversation", [conversationId, patch]);
  }
  sweepStaleMobilityRideChats() {
    return this.delegate("sweepStaleMobilityRideChats", []);
  }
  findConversationForServiceBooking(booking: {
    id: number;
    userId?: string;
    providerId?: number;
    serviceId?: number;
  }) {
    return this.delegate("findConversationForServiceBooking", [booking]);
  }
  findConversationForMobilityRide(params: { rideId: string }) {
    return this.delegate("findConversationForMobilityRide", [params]);
  }
  listConversationsForAdmin(opts?: { limit?: number }) {
    return this.delegate("listConversationsForAdmin", [opts]);
  }
  getFinancialReports(userId: string, period?: string) { return this.memory.getFinancialReports(userId, period); }
  getKPIs(userId: string) { return this.memory.getKPIs(userId); }
  getNotifications(userId: string, unreadOnly?: boolean) { return this.delegate("getNotifications", [userId, unreadOnly]); }
  createNotification(notification: { userId: string; type: string; data: Record<string, unknown> }) { return this.delegate("createNotification", [notification]); }
  markNotificationAsRead(notificationId: number) { return this.delegate("markNotificationAsRead", [notificationId]); }
  markAllNotificationsAsReadForUser(userId: string) {
    return this.delegate("markAllNotificationsAsReadForUser", [userId]);
  }
  createAccountChangeRequest(input: any) { return this.delegate("createAccountChangeRequest", [input]); }
  getMyAccountChangeRequests(userId: string) { return this.delegate("getMyAccountChangeRequests", [userId]); }
  getPendingAccountChangeRequests() { return this.delegate("getPendingAccountChangeRequests", []); }
  resolveAccountChangeRequest(args: any) { return this.delegate("resolveAccountChangeRequest", [args]); }
  syncWithMango(userId: string, mangoUserId: string) { return this.memory.syncWithMango(userId, mangoUserId); }
  getMangoSyncStatus(userId: string) { return this.memory.getMangoSyncStatus(userId); }
  getReviews(params: any) { return this.memory.getReviews(params); }
  getReviewStats(targetId: string, targetType: string) { return this.memory.getReviewStats(targetId, targetType); }
  createReview(review: any) { return this.memory.createReview(review); }
  replyToReview(reviewId: number, response: string, responderId: string, responderName: string) { return this.memory.replyToReview(reviewId, response, responderId, responderName); }
  markReviewHelpful(reviewId: number) { return this.memory.markReviewHelpful(reviewId); }
  deleteReview(reviewId: number, userId: string, actingUserRole?: string) { return this.memory.deleteReview(reviewId, userId, actingUserRole); }
  updateReviewStats(targetId: string, targetType: string) { return this.memory.updateReviewStats(targetId, targetType); }
  seedCategories() { return this.memory.seedCategories(); }
  getBookingStatuses() { return this.memory.getBookingStatuses(); }
  createBookingStatus(status: any) { return this.memory.createBookingStatus(status); }
  updateBookingStatusCustom(id: number, data: any) { return this.memory.updateBookingStatusCustom(id, data); }
  deleteBookingStatus(id: number) { return this.memory.deleteBookingStatus(id); }
  getTaxes() { return this.memory.getTaxes(); }
  createTax(tax: any) { return this.memory.createTax(tax); }
  updateTax(id: number, data: any) { return this.memory.updateTax(id, data); }
  deleteTax(id: number) { return this.memory.deleteTax(id); }
  calculateTaxes(amount: number, taxIds: number[]) { return this.memory.calculateTaxes(amount, taxIds); }
  getCoupons(userId: string) { return this.memory.getCoupons(userId); }
  createCoupon(coupon: any) { return this.memory.createCoupon(coupon); }
  updateCoupon(id: number, data: any) { return this.memory.updateCoupon(id, data); }
  deleteCoupon(id: number) { return this.memory.deleteCoupon(id); }
  getPromotionalCodes() { return this.memory.getPromotionalCodes(); }
  getPromotionalCodeById(id: number) { return this.memory.getPromotionalCodeById(id); }
  getPromotionalCodeByCode(code: string) { return this.memory.getPromotionalCodeByCode(code); }
  createPromotionalCode(data: Parameters<typeof this.memory.createPromotionalCode>[0]) {
    return this.memory.createPromotionalCode(data);
  }
  updatePromotionalCode(id: number, data: Parameters<typeof this.memory.updatePromotionalCode>[1]) {
    return this.memory.updatePromotionalCode(id, data);
  }
  deletePromotionalCode(id: number) { return this.memory.deletePromotionalCode(id); }
  incrementPromotionalCodeUsedCount(id: number, userId?: string) {
    return this.memory.incrementPromotionalCodeUsedCount(id, userId);
  }
  listPublicPromoNotificationRecipientUserIds() {
    return this.memory.listPublicPromoNotificationRecipientUserIds();
  }
  patchPromotionalCodePublicNotifyFields(
    id: number,
    patch: Parameters<typeof this.memory.patchPromotionalCodePublicNotifyFields>[1],
  ) {
    return this.memory.patchPromotionalCodePublicNotifyFields(id, patch);
  }
}
