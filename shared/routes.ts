import { z } from 'zod';
import { insertProviderSchema, insertServiceSchema, insertBookingSchema, categories, providers, services, bookings, type ServiceWithProvider } from './schema';
import { User } from './models/auth';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  auth: {
    register: {
      method: 'POST' as const,
      path: '/api/auth/register',
      input: z.object({
        email: z.string().email(),
        password: z.string().min(6),
        name: z.string().optional(),
      }),
      responses: {
        201: z.object({
          user: z.custom<User>(),
          token: z.string(),
        }),
        400: errorSchemas.validation,
      },
    },
    login: {
      method: 'POST' as const,
      path: '/api/auth/login',
      input: z.object({
        email: z.string().email(),
        password: z.string(),
      }),
      responses: {
        200: z.object({
          user: z.custom<User>(),
          token: z.string(),
        }),
        401: z.object({ message: z.string() }),
      },
    },
    me: {
      method: 'GET' as const,
      path: '/api/auth/me',
      responses: {
        200: z.custom<User>().nullable(),
      },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/auth/logout',
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
    /** Profesional: marca `acceptedProviderTermsOfUse` en true (Firestore / usuario). */
    acceptProviderTermsOfUse: {
      method: 'POST' as const,
      path: '/api/auth/accept-provider-terms-of-use',
      responses: {
        200: z.object({
          message: z.string(),
          user: z.custom<User>(),
        }),
      },
    },
    replit: {
      login: {
        method: 'GET' as const,
        path: '/api/login',
      },
      callback: {
        method: 'GET' as const,
        path: '/api/callback',
      },
      logout: {
        method: 'POST' as const,
        path: '/api/logout',
      },
      user: {
        method: 'GET' as const,
        path: '/api/user',
      },
    },
  },
  categories: {
    list: {
      method: 'GET' as const,
      path: '/api/categories',
      responses: {
        200: z.array(z.custom<typeof categories.$inferSelect>()),
      },
    },
    /** Conteos de asociados por marca (home): Fix Go, Pro Go (legal+financial), Man Go, Car/Shop/Pack. */
    homeAssociateCounts: {
      method: 'GET' as const,
      path: '/api/categories/home-associate-counts',
      responses: {
        200: z.object({
          fixGo: z.number(),
          proGo: z.number(),
          manGo: z.number(),
          carGo: z.number(),
          shopGo: z.number(),
          packGo: z.number(),
        }),
      },
    },
  },
  providers: {
    list: {
      method: 'GET' as const,
      path: '/api/providers',
      input: z.object({
        profession: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof providers.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/providers/:id',
      responses: {
        200: z.custom<typeof providers.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/providers',
      input: insertProviderSchema,
      responses: {
        201: z.custom<typeof providers.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    me: {
      method: 'GET' as const,
      path: '/api/me/provider',
      responses: {
        200: z.custom<typeof providers.$inferSelect>().nullable(),
      },
    }
  },
  services: {
    list: {
      method: 'GET' as const,
      path: '/api/services',
      input: z.object({
        categoryId: z.string().optional(),
        search: z.string().optional(),
        providerCategoryId: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<ServiceWithProvider>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/services/:id',
      responses: {
        200: z.custom<typeof services.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/services',
      input: insertServiceSchema,
      responses: {
        201: z.custom<typeof services.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
  bookings: {
    list: {
      method: 'GET' as const,
      path: '/api/bookings',
      responses: {
        200: z.array(z.custom<typeof bookings.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/bookings',
      input: insertBookingSchema,
      responses: {
        201: z.custom<typeof bookings.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    updateStatus: {
      method: 'PATCH' as const,
      path: '/api/bookings/:id/status',
      input: z.object({ status: z.string() }),
      responses: {
        200: z.custom<typeof bookings.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    }
  },
  genfeb: {
    bookings: {
      list: {
        method: 'GET' as const,
        path: '/api/bookings',
        responses: {
          200: z.array(z.custom<typeof bookings.$inferSelect>()),
        },
      },
      create: {
        method: 'POST' as const,
        path: '/api/bookings',
        input: z.object({
          serviceId: z.number(),
          providerId: z.number(),
          date: z.string().datetime(),
          notes: z.string().optional(),
          location: z.string().optional(),
          latitude: z.number().optional(),
          longitude: z.number().optional(),
        }),
        responses: {
          201: z.custom<typeof bookings.$inferSelect>(),
          400: errorSchemas.validation,
        },
      },
      get: {
        method: 'GET' as const,
        path: '/api/bookings/:id',
        responses: {
          200: z.custom<typeof bookings.$inferSelect>(),
          404: errorSchemas.notFound,
        },
      },
      updateStatus: {
        method: 'PATCH' as const,
        path: '/api/bookings/:id/status',
        input: z.object({
          status: z.enum(["pending", "confirmed", "in_progress", "completed", "cancelled"]),
        }),
        responses: {
          200: z.custom<typeof bookings.$inferSelect>(),
          404: errorSchemas.notFound,
        },
      },
    },
    payments: {
      list: {
        method: 'GET' as const,
        path: '/api/payments',
        responses: {
          200: z.array(z.any()),
        },
      },
      escrowList: {
        method: 'GET' as const,
        path: '/api/payments/escrow',
        responses: {
          200: z.array(z.any()),
        },
      },
      createEscrow: {
        method: 'POST' as const,
        path: '/api/payments/escrow',
        input: z.object({
          bookingId: z.number(),
          amount: z.number().positive(),
          currency: z.string().default("USD"),
          paymentMethod: z.enum(["stripe", "paypal", "bank_transfer"]),
        }),
        responses: {
          201: z.any(),
        },
      },
      releaseEscrow: {
        method: 'POST' as const,
        path: '/api/payments/escrow/release',
        input: z.object({
          paymentId: z.number(),
          release: z.boolean(),
          reason: z.string().optional(),
        }),
        responses: {
          200: z.any(),
        },
      },
      getBalance: {
        method: 'GET' as const,
        path: '/api/payments/balance',
        responses: {
          200: z.object({
            available: z.number(),
            escrow: z.number(),
            pending: z.number(),
          }),
        },
      },
    },
    wallet: {
      me: {
        method: 'GET' as const,
        path: '/api/wallet/me',
        responses: {
          200: z.object({
            wallet: z.number(),
            totalEarnings: z.number(),
            /** Saldo retenido por reservas confirmadas (solo relevante para cliente). */
            pendingBalance: z.number(),
            /** Fondos en tránsito por solicitud de retiro; independiente de pendingBalance. */
            withdrawingFunds: z.number().optional().default(0),
            /** Calificación promedio del usuario (1-5). */
            rating: z.number().optional().default(5),
            /** Número de valoraciones recibidas. */
            ratingCount: z.number().optional().default(0),
            /** Piso de cartera (USD) para comisiones en efectivo/transfer. */
            providerWalletFloorUsd: z.number().optional().default(-20),
            /**
             * True si alcanzaste o superas el piso: no aceptar más servicios en efectivo/transfer
             * (solo Saldo GenFeb) hasta recargar o bajar deuda.
             */
            isProviderDebtCapped: z.boolean().optional().default(false),
          }),
        },
      },
      withdraw: {
        method: 'POST' as const,
        path: '/api/wallet/withdraw',
        input: z.object({
          amount: z.number().positive(),
        }),
        responses: {
          200: z.object({ message: z.string(), ok: z.literal(true) }),
          400: z.object({ message: z.string(), code: z.string().optional() }),
        },
      },
      platformBalance: {
        method: 'GET' as const,
        path: '/api/wallet/platform-balance',
        responses: {
          200: z.object({ totalBalance: z.number() }),
        },
      },
      rechargeRequest: {
        method: 'POST' as const,
        path: '/api/wallet/recharge-request',
        input: z.object({
          amount: z.number().positive(),
          transferDate: z.string(),
          transferTime: z.string().optional(),
          transferCode: z.string().optional(),
        }),
        responses: {
          201: z.object({
            id: z.number(),
            userId: z.string(),
            amount: z.number(),
            transferType: z.string(),
            status: z.string(),
            description: z.string().optional(),
            referenceId: z.string().optional(),
            createdAt: z.union([z.string(), z.date()]),
          }),
          400: errorSchemas.validation,
        },
      },
      transfers: {
        list: {
          method: 'GET' as const,
          path: '/api/wallet/transfers',
          input: z.object({
            limit: z.number().optional(),
            transferType: z.enum(['service_payment', 'recharge']).optional(),
          }).optional(),
          responses: {
            200: z.array(z.object({
              id: z.number(),
              userId: z.string(),
              amount: z.number(),
              transferType: z.enum(['service_payment', 'recharge']),
              referenceId: z.string().optional(),
              currency: z.string().optional(),
              createdAt: z.union([z.string(), z.date()]),
            })),
          },
        },
        create: {
          method: 'POST' as const,
          path: '/api/wallet/transfers',
          input: z.object({
            userId: z.string(),
            amount: z.number().positive(),
            transferType: z.enum(['service_payment', 'recharge']),
            referenceId: z.string().optional(),
            currency: z.string().optional(),
          }),
          responses: {
            201: z.object({
              id: z.number(),
              userId: z.string(),
              amount: z.number(),
              transferType: z.enum(['service_payment', 'recharge']),
              referenceId: z.string().optional(),
              currency: z.string().optional(),
              createdAt: z.union([z.string(), z.date()]),
            }),
            400: errorSchemas.validation,
            404: z.object({ message: z.string() }),
          },
        },
      },
    },
  },
  platform: {
    commissionRate: {
      get: {
        method: 'GET' as const,
        path: '/api/platform/commission-rate',
      },
      adminPatch: {
        method: 'PATCH' as const,
        path: '/api/admin/platform-commission-rate',
      },
    },
    mobilityFares: {
      get: {
        method: 'GET' as const,
        path: '/api/platform/mobility-fares',
      },
      adminPatch: {
        method: 'PATCH' as const,
        path: '/api/admin/mobility-fares',
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
