/**
 * Capa de servicios de dominio (Clean Architecture).
 * Los servicios encapsulan la lógica de negocio; las rutas solo validan entrada y delegan.
 */

import { genFebStorage } from "../storage-genfeb";
import { UserService } from "./user.service";
import { RoleService } from "./role.service";
import { CatalogService } from "./catalog.service";
import { BookingService } from "./booking.service";
import { PromotionalCodeService } from "./promotional-code.service";
import { AdminUserRegistrationService } from "./admin-user-registration.service";
import { vehiclesDbService } from "./vehiclesdb.service";
import { apiNinjasVehicleYearsService } from "./api-ninjas-vehicle-years.service";

export const userService = new UserService(genFebStorage);
export const adminUserRegistrationService = new AdminUserRegistrationService(
  genFebStorage,
  genFebStorage
);
export const roleService = new RoleService(genFebStorage);
export const catalogService = new CatalogService(genFebStorage);
export const bookingService = new BookingService(genFebStorage);
export const promotionalCodeService = new PromotionalCodeService(genFebStorage);
export { vehiclesDbService };
export { apiNinjasVehicleYearsService };

export {
  UserService,
  RoleService,
  CatalogService,
  BookingService,
  PromotionalCodeService,
  AdminUserRegistrationService,
};
