# GENFEB - Plataforma de Servicios

Plataforma de reservas de servicios profesionales desarrollada por **GenFeb**

## Descripción

GENFEB es una plataforma SaaS de reservas de citas y servicios multi-negocio, diseñada para conectar clientes con profesionales verificados. La plataforma incluye:

- **Explorar Servicios**: Navega por categorías de servicios profesionales
- **Reservas**: Reserva citas con calendario integrado
- **Gestión de Reservas**: Dashboard para clientes y proveedores
- **Perfiles de Proveedores**: Profesionales verificados con ratings

## Tecnología

- **Frontend**: React + TypeScript + Vite
- **Backend**: Express.js + TypeScript
- **Base de Datos**: PostgreSQL con Drizzle ORM
- **UI**: shadcn/ui + Tailwind CSS

## Requisitos

- Node.js 18+
- PostgreSQL 14+

## Instalación

```bash
# Instalar dependencias
npm install

# Configurar base de datos
# Crear archivo .env con las variables de entorno

# Ejecutar migraciones
npm run db:push

# Iniciar desarrollo
npm run dev
```

## Variables de Entorno

Crear archivo `.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/genfeb
SESSION_SECRET=your-secret-key
NODE_ENV=development
```

## Estructura del Proyecto

```
mango-genfeb/
├── client/                 # Frontend React
│   ├── src/
│   │   ├── components/    # Componentes UI
│   │   ├── pages/         # Páginas de la app
│   │   ├── hooks/         # Custom React hooks
│   │   └── lib/           # Utilidades
│   └── public/            # Assets estáticos
├── server/                # Backend Express
│   ├── routes.ts          # Rutas API
│   ├── storage.ts         # Capa de datos
│   └── db.ts              # Conexión a BD
└── shared/                # Código compartido
    ├── schema.ts          # Esquema de BD
    └── routes.ts          # Definiciones API
```

## Funcionalidades

### Para Clientes
- Explorar servicios por categoría
- Ver perfiles de proveedores
- Reservar servicios con calendario
- Ver historial de reservas
- Gestionar reservas (cancelar)

### Para Proveedores
- Crear perfil profesional
- Publicar servicios
- Gestionar reservas entrantes
- Aceptar/rechazar/completar trabajos
- Configurar disponibilidad

## Marca

Desarrollado por **GenFeb**
- Representante Legal: Econ. Daniel Ignacio Gómez Alvarado, Mgs.
- Objeto Social: Desarrollo de software, consultoría, servicios integrales

## Licencia

MIT
