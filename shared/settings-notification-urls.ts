export const SETTINGS_VEHICLE_SECTION_QUERY_KEY = "vehicleSection" as const;

/** Tras aprobar cambio de vehículo: abre Configuración y resalta la sección del vehículo. */
export const SETTINGS_URL_AFTER_VEHICLE_CHANGE_RESOLVED =
  `/settings?${SETTINGS_VEHICLE_SECTION_QUERY_KEY}=1` as const;
