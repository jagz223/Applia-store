/**
 * Iconos Lucide permitidos en el selector admin de subcategorías.
 * Deben coincidir con exportaciones de `lucide-react` (PascalCase).
 */
export const SUBCATEGORY_LUCIDE_PICKLIST: ReadonlyArray<{ name: string; labelEs: string }> = [
  { name: "Scale", labelEs: "Balanza / legal" },
  { name: "TrendingUp", labelEs: "Finanzas / crecimiento" },
  { name: "GraduationCap", labelEs: "Educación / tutorías" },
  { name: "Droplets", labelEs: "Plomería / agua" },
  { name: "Zap", labelEs: "Electricidad" },
  { name: "Microwave", labelEs: "Electrodomésticos" },
  { name: "KeyRound", labelEs: "Cerrajería" },
  { name: "Cpu", labelEs: "Computación" },
  { name: "Sparkles", labelEs: "Limpieza" },
  { name: "Wind", labelEs: "Clima / aires" },
  { name: "Trees", labelEs: "Jardinería" },
  { name: "Paintbrush", labelEs: "Pintura" },
  { name: "Bike", labelEs: "Moto" },
  { name: "Car", labelEs: "Auto" },
  { name: "Truck", labelEs: "Camioneta / carga" },
  { name: "Construction", labelEs: "Camión / obra" },
  { name: "Wrench", labelEs: "Herramientas" },
  { name: "Hammer", labelEs: "Construcción / manual" },
  { name: "Home", labelEs: "Hogar" },
  { name: "Building2", labelEs: "Edificio / oficina" },
  { name: "Heart", labelEs: "Salud / bienestar" },
  { name: "Stethoscope", labelEs: "Médico" },
  { name: "BookOpen", labelEs: "Libros / lectura" },
  { name: "Briefcase", labelEs: "Profesional / negocio" },
  { name: "Package", labelEs: "Paquete / envío" },
  { name: "ShoppingBag", labelEs: "Compras" },
  { name: "Store", labelEs: "Tienda" },
  { name: "Utensils", labelEs: "Cocina / gastronomía" },
  { name: "Music", labelEs: "Música / eventos" },
  { name: "Camera", labelEs: "Foto / vídeo" },
  { name: "Palette", labelEs: "Arte / diseño" },
  { name: "Dumbbell", labelEs: "Deporte / fitness" },
  { name: "Baby", labelEs: "Infantil / cuidado" },
  { name: "Dog", labelEs: "Mascotas" },
  { name: "Plane", labelEs: "Viajes" },
  { name: "Shield", labelEs: "Seguridad" },
  { name: "Leaf", labelEs: "Ecológico / naturaleza" },
  { name: "Sun", labelEs: "Exterior / solar" },
  { name: "Snowflake", labelEs: "Frío / climatización" },
  { name: "Laptop", labelEs: "Informática" },
  { name: "Smartphone", labelEs: "Móvil / apps" },
  { name: "Printer", labelEs: "Impresión" },
  { name: "HardHat", labelEs: "Obra / seguridad" },
  { name: "PawPrint", labelEs: "Pet / animal" },
  { name: "Flower2", labelEs: "Floristería" },
  { name: "HelpCircle", labelEs: "Genérico" },
];

export function firstAvailableSubcategoryIcon(usedNames: ReadonlySet<string>): string {
  for (const { name } of SUBCATEGORY_LUCIDE_PICKLIST) {
    if (!usedNames.has(name)) return name;
  }
  return SUBCATEGORY_LUCIDE_PICKLIST[0]?.name ?? "HelpCircle";
}
