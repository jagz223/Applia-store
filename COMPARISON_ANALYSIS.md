# Análisis Comparativo: Applia vs BookingDo SaaS

## 1. Resumen Ejecutivo

| Aspecto | Applia (Proyecto Actual) | BookingDo SaaS (Referencia) |
|---------|---------------------------|----------------------------|
| **Tecnología Backend** | Node.js + Express + Drizzle ORM | Laravel (PHP) + MySQL |
| **Tecnología Frontend** | React + TypeScript + Vite + Tailwind | Blade Templates + jQuery + Bootstrap |
| **Modelo de Negocio** | Plataforma única | SaaS Multi-negocio |
| **Base de Datos** | PostgreSQL + Firebase | MySQL |

---

## 2. Comparación de Funcionalidades

### 2.1 Autenticación y Usuarios

| Función | Applia | BookingDo |
|---------|--------|-----------|
| Inicio de sesión email/password | ✅ Firebase Auth | ✅ Laravel Auth |
| Login con Google | ✅ | ✅ |
| Login con Facebook | ✅ | ✅ |
| Roles de usuario (admin/profesional/cliente) | ✅ | ✅ (admin/vendor/staff) |
| Verificación de email | ✅ | ✅ |
| Perfil de usuario editable | ✅ | ✅ |
| **Gestión de empleados/staff** | ❌ | ✅ |
| **Sistema de permisos granulares** | ❌ | ✅ |

### 2.2 Sistema de Reservas

| Función | Applia | BookingDo |
|---------|--------|-----------|
| Crear reserva | ✅ | ✅ |
| Selección de servicio | ✅ | ✅ |
| Selección de profesional | ✅ | ✅ |
| Selección de fecha/hora | ✅ | ✅ |
| Estado de reservas | ✅ (5 estados) | ✅ (estados personalizados) |
| Historial de reservas | ✅ | ✅ |
| Cancelar reserva | ✅ | ✅ |
| **Asignación de staff a servicios** | ❌ | ✅ |
| **Estados de reserva personalizables** | ❌ | ✅ |
| **Reserva con múltiples servicios** | ❌ | ✅ |
| **Servicios adicionales (add-ons)** | ❌ | ✅ |
| **Cupones/descuentos** | ❌ | ✅ |
| **Zonas horarias** | ❌ | ✅ |

### 2.3 Gestión de Servicios

| Función | Applia | BookingDo |
|---------|--------|-----------|
| Crear servicios | ✅ | ✅ |
| Categorías | ✅ | ✅ |
| Imágenes del servicio | ✅ | ✅ |
| Precio del servicio | ✅ | ✅ |
| Descripción | ✅ | ✅ |
| **Impuestos (taxes)** | ❌ | ✅ |
| **Descuentos por porcentaje** | ❌ | ✅ |
| **Precio original vs precio con descuento** | ❌ | ✅ |
| **Duración del servicio (intervalo)** | ❌ | ✅ |
| **Staff asignado por servicio** | ❌ | ✅ |
| **Preguntas/respuestas del servicio** | ❌ | ✅ |

### 2.4 Pagos

| Función | Applia | BookingDo |
|---------|--------|-----------|
| Stripe | ✅ | ✅ |
| PayPal | ✅ | ✅ |
| Transferencia bancaria | ✅ | ✅ |
| **Pagos escrow** | ✅ | ✅ (más robusto) |
| **Múltiples pasarelas de pago** | ❌ | ✅ (MercadoPago, Khalti, Mollie, etc.) |
| **Facturación PDF** | ⚠️ Básica | ✅ Completa |
| **Monedas múltiples** | ❌ | ✅ |
| **Historial de transacciones** | ✅ | ✅ |

### 2.5 Panel de Administración

| Función | Applia | BookingDo |
|---------|--------|-----------|
| Dashboard con estadísticas | ✅ (básico) | ✅ (avanzado) |
| Gestión de usuarios | ✅ | ✅ |
| Gestión de reservas | ✅ | ✅ |
| Gestión de servicios | ✅ | ✅ |
| **Reportes financieros** | ✅ (básico) | ✅ (avanzado) |
| **Reportes de ventas** | ❌ | ✅ |
| **Estadísticas detalladas** | ❌ | ✅ |
| **Gestión de categorías** | ✅ | ✅ |
| **Gestión de banners** | ❌ | ✅ |
| **Configuración del sitio web** | ⚠️ | ✅ (completa) |
| **Gestión de temas/themes** | ❌ | ✅ |
| **Blog** | ❌ | ✅ |
| **FAQ** | ❌ | ✅ |
| **Landing pages** | ❌ | ✅ |

### 2.6 Funciones Adicionales

| Función | Applia | BookingDo |
|---------|--------|-----------|
| Chat/mensajería | ✅ | ❌ |
| Bóveda de documentos | ✅ | ❌ |
| Notificaciones push | ✅ | ✅ |
| **POS (Punto de venta)** | ❌ | ✅ |
| **E-commerce (productos)** | ❌ | ✅ |
| **Carrito de compras** | ❌ | ✅ |
| **Google Calendar** | ❌ | ✅ |
| **WhatsApp notifications** | ❌ | ✅ |
| **Telegram notifications** | ❌ | ✅ |
| **Zoom meetings** | ❌ | ✅ |
| **Widget embebido** | ❌ | ✅ |
| **PWA (Progressive Web App)** | ✅ | ✅ |

---

## 3. Características Recomendadas para Applia

Basado en el análisis, las siguientes características de BookingDo podrían agregarse a Applia:

### Alta Prioridad

1. **Estados de reserva personalizables**
   - Crear tabla de estados personalizados en la base de datos
   - API para CRUD de estados
   - UI en el panel de admin

2. **Gestión de impuestos (Taxes)**
   - Agregar modelo de impuestos
   - Calcular impuestos en reservas
   - Mostrar desglose de impuestos en factura

3. **Sistema de cupones/descuentos**
   - Crear modelo de cupones
   - Validar código de cupón
   - Aplicar descuento al total

4. **Reportes avanzados**
   - Reportes de ingresos por período
   - Reportes de reservas por estado
   - Gráficos y estadísticas visuales

### Media Prioridad

5. **Servicios adicionales (Add-ons)**
   - Agregar servicios extra a una reserva
   - Calcular precio total

6. **Facturación mejorada**
   - Generar facturas PDF profesionales
   - Incluir todos los detalles (impuestos, descuentos, etc.)

7. **Gestión de empleados/staff**
   - Asignar empleados a servicios
   - Ver disponibilidad de empleados

### Baja Prioridad

8. **Blog y FAQ**
   - Sistema de gestión de contenidos
   - Preguntas frecuentes

9. **Widget embebido**
   - Generar código para嵌入en otros sitios

10. **Múltiples pasarelas de pago**
    - Agregar MercadoPago para Ecuador
    - Agregar otras pasarelas populares

---

## 4. Estructura de Datos Sugerida

### Estados de Reserva Personalizables

```typescript
// shared/schema-applia.ts

export const bookingStatuses = pgTable("booking_statuses", {
  id: serial("id").primaryKey(),
  vendorId: varchar("vendor_id"), // Para multi-negocio (nullable para sistema único)
  name: varchar("name", { length: 50 }).notNull(),
  type: integer("type").notNull(), // 1=nuevo, 2=procesando, 3=completado, 4=cancelado
  color: varchar("color", { length: 7 }).default("#000000"),
  isDefault: boolean("is_default").default(false),
  isAvailable: boolean("is_available").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### Impuestos

```typescript
export const taxes = pgTable("taxes", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  rate: decimal("rate", { precision: 5, scale: 2 }).notNull(), // Porcentaje
  type: varchar("type", { length: 20 }).default("percentage"), // percentage o fixed
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### Cupones

```typescript
export const coupons = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  description: text("description"),
  discountType: varchar("discount_type", { length: 20 }).notNull(), // percentage o fixed
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull(),
  minAmount: decimal("min_amount", { precision: 10, scale: 2 }),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").default(0),
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});
```

---

## 5. Próximos Pasos Recomendados

1. **Implementar estados de reserva personalizables** - Alta prioridad
2. **Agregar sistema de impuestos** - Alta prioridad  
3. **Desarrollar sistema de cupones** - Alta prioridad
4. **Mejorar reportes financieros** - Media prioridad
5. **Agregar servicios adicionales (add-ons)** - Media prioridad

---

*Documento generado el 25 de febrero de 2026*
*Proyecto Applia*
