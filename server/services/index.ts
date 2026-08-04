/**
 * Capa de servicios de dominio (Clean Architecture).
 * Los servicios encapsulan la lógica de negocio; las rutas solo validan entrada y delegan.
 */

import { appliaStorage } from "../storage-applia";
import { UserService } from "./user.service";
import { RoleService } from "./role.service";
import { CatalogService } from "./catalog.service";
import { BookingService } from "./booking.service";
import { PromotionalCodeService } from "./promotional-code.service";
import { AdminUserRegistrationService } from "./admin-user-registration.service";
import { vehiclesDbService } from "./vehiclesdb.service";
import { nhtsaVehicleYearsService } from "./nhtsa-vehicle-years.service";

export const userService = new UserService(appliaStorage);
export const adminUserRegistrationService = new AdminUserRegistrationService(
  appliaStorage,
  appliaStorage
);
export const roleService = new RoleService(appliaStorage);
export const catalogService = new CatalogService(appliaStorage);
export const bookingService = new BookingService(appliaStorage);
export const promotionalCodeService = new PromotionalCodeService(appliaStorage);
export { vehiclesDbService };
export { nhtsaVehicleYearsService };

export {
  UserService,
  RoleService,
  CatalogService,
  BookingService,
  PromotionalCodeService,
  AdminUserRegistrationService,
};
