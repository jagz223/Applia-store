// GenFeb - Internationalization (i18n)
// Soporte para Español (Ecuador) e Inglés

export type Language = "es" | "en" | "pt";

export interface Translations {
  // Navigation
  nav: {
    home: string;
    explore: string;
    services: string;
    bookings: string;
    categories: string;
    vault: string;
    dashboard: string;
    payments: string;
    chat: string;
    settings: string;
    login: string;
    register: string;
    logout: string;
  };
  // Common
  common: {
    search: string;
    filter: string;
    save: string;
    cancel: string;
    confirm: string;
    delete: string;
    edit: string;
    view: string;
    loading: string;
    error: string;
    success: string;
    noResults: string;
  };
  // Home
  home: {
    hero: {
      title: string;
      subtitle: string;
      cta: string;
      ctaSecondary: string;
    };
    features: {
      title: string;
      subtitle: string;
    };
    stats: {
      users: string;
      professionals: string;
      services: string;
      rating: string;
    };
  };
  // Booking
  booking: {
    title: string;
    subtitle: string;
    steps: {
      service: string;
      provider: string;
      confirm: string;
    };
    selectService: string;
    selectProvider: string;
    selectDate: string;
    notes: string;
    contact: string;
    confirm: string;
    success: string;
    code: string;
  };
  // Dashboard
  dashboard: {
    title: string;
    overview: string;
    transactions: string;
    invoices: string;
    kpis: {
      income: string;
      completed: string;
      activeClients: string;
      pending: string;
    };
  };
  // Vault
  vault: {
    title: string;
    subtitle: string;
    encrypted: string;
    documents: string;
    folders: string;
    shared: string;
    upload: string;
    status: {
      verified: string;
      pending: string;
      encrypted: string;
    };
  };
  // Payments
  payments: {
    title: string;
    subtitle: string;
    balance: string;
    available: string;
    securePayments: string;
    pending: string;
    withdraw: string;
    addCard: string;
    securePaymentsHelp: string;
    methods: string;
    transactions: string;
  };
  // Chat
  chat: {
    title: string;
    search: string;
    online: string;
    offline: string;
    typeMessage: string;
    send: string;
    schedule: string;
    shareContract: string;
    location: string;
  };
  // Auth
  auth: {
    login: string;
    register: string;
    email: string;
    password: string;
    forgotPassword: string;
    noAccount: string;
    hasAccount: string;
  };
}

const translations: Record<Language, Translations> = {
  es: {
    nav: {
      home: "Inicio",
      explore: "Explorar",
      services: "Servicios",
      bookings: "Reservas",
      categories: "Categorías",
      vault: "Documentos",
      dashboard: "Panel",
      payments: "Pagos",
      chat: "Mensajes",
      settings: "Configuración",
      login: "Iniciar Sesión",
      register: "Registrarse",
      logout: "Cerrar Sesión",
    },
    common: {
      search: "Buscar",
      filter: "Filtrar",
      save: "Guardar",
      cancel: "Cancelar",
      confirm: "Confirmar",
      delete: "Eliminar",
      edit: "Editar",
      view: "Ver",
      loading: "Cargando...",
      error: "Error",
      success: "Éxito",
      noResults: "No se encontraron resultados",
    },
    home: {
      hero: {
        title: "La plataforma de servicios más avanzada",
        subtitle: "Conecta con asociados verificados para servicios técnicos, legales, financieros y mantenimiento. Todo en un solo lugar con la garantía de GenFeb.",
        cta: "Explorar Servicios",
        ctaSecondary: "Reservar Ahora",
      },
      features: {
        title: "Todo lo que necesitas en una plataforma",
        subtitle: "Descubre las herramientas que hacen de GenFeb la mejor opción para gestionar tus servicios",
      },
      stats: {
        users: "Usuarios Activos",
        professionals: "Asociados",
        services: "Servicios Realizados",
        rating: "Calificación Promedio",
      },
    },
    booking: {
      title: "Reserva tu Servicio",
      subtitle: "Reserva en 3 clics con confirmación inmediata",
      steps: {
        service: "Selecciona Servicio",
        provider: "Selecciona Asociado",
        confirm: "Confirma Reserva",
      },
      selectService: "Selecciona un Servicio",
      selectProvider: "Selecciona un Asociado",
      selectDate: "Selecciona Fecha y Hora",
      notes: "Notas adicionales",
      contact: "Datos de contacto",
      confirm: "Confirmar Reserva",
      success: "¡Reserva Confirmada!",
      code: "Código de Reserva",
    },
    dashboard: {
      title: "Mi actividad",
      overview: "Resumen",
      transactions: "Transacciones",
      invoices: "Facturación",
      kpis: {
        income: "Ingresos Totales",
        completed: "Servicios Completados",
        activeClients: "Clientes Activos",
        pending: "Pendientes",
      },
    },
    vault: {
      title: "Mis documentos",
      subtitle: "Comprobantes y archivos de tu cuenta en la plataforma",
      encrypted: "Cifrado AES-256",
      documents: "Documentos",
      folders: "Carpetas",
      shared: "Compartidos",
      upload: "Subir Archivo",
      status: {
        verified: "Verificado",
        pending: "Pendiente",
        encrypted: "Cifrado",
      },
    },
    payments: {
      title: "Centro de Pagos",
      subtitle: "Gestiona tus pagos con seguridad",
      balance: "Saldo",
      available: "Disponible",
      securePayments: "Pago seguro",
      pending: "Pendiente",
      withdraw: "Retirar",
      addCard: "Agregar Tarjeta",
      securePaymentsHelp: "¿Cómo funcionan los pagos seguros?",
      methods: "Métodos de Pago",
      transactions: "Transacciones",
    },
    chat: {
      title: "Mensajes en Vivo",
      search: "Buscar conversaciones...",
      online: "En línea",
      offline: "Desconectado",
      typeMessage: "Escribe un mensaje...",
      send: "Enviar",
      schedule: "Agendar",
      shareContract: "Compartir contrato",
      location: "Ubicación",
    },
    auth: {
      login: "Iniciar Sesión",
      register: "Registrarse",
      email: "Correo electrónico",
      password: "Contraseña",
      forgotPassword: "¿Olvidaste tu contraseña?",
      noAccount: "¿No tienes cuenta?",
      hasAccount: "¿Ya tienes cuenta?",
    },
  },
  en: {
    nav: {
      home: "Home",
      explore: "Explore",
      services: "Services",
      bookings: "Bookings",
      categories: "Categories",
      vault: "Documents",
      dashboard: "Dashboard",
      payments: "Payments",
      chat: "Messages",
      settings: "Settings",
      login: "Login",
      register: "Register",
      logout: "Logout",
    },
    common: {
      search: "Search",
      filter: "Filter",
      save: "Save",
      cancel: "Cancel",
      confirm: "Confirm",
      delete: "Delete",
      edit: "Edit",
      view: "View",
      loading: "Loading...",
      error: "Error",
      success: "Success",
      noResults: "No results found",
    },
    home: {
      hero: {
        title: "The most advanced services platform",
        subtitle: "Connect with verified professionals for technical, legal, financial, and maintenance services. All in one place with GenFeb guarantee.",
        cta: "Explore Services",
        ctaSecondary: "Book Now",
      },
      features: {
        title: "Everything you need in one platform",
        subtitle: "Discover the tools that make GenFeb the best choice for managing your services",
      },
      stats: {
        users: "Active Users",
        professionals: "Professionals",
        services: "Services Completed",
        rating: "Average Rating",
      },
    },
    booking: {
      title: "Book Your Service",
      subtitle: "Book in 3 clicks with immediate confirmation",
      steps: {
        service: "Select Service",
        provider: "Select Professional",
        confirm: "Confirm Booking",
      },
      selectService: "Select a Service",
      selectProvider: "Select a Professional",
      selectDate: "Select Date and Time",
      notes: "Additional notes",
      contact: "Contact information",
      confirm: "Confirm Booking",
      success: "Booking Confirmed!",
      code: "Booking Code",
    },
    dashboard: {
      title: "My activity",
      overview: "Overview",
      transactions: "Transactions",
      invoices: "Invoicing",
      kpis: {
        income: "Total Income",
        completed: "Completed Services",
        activeClients: "Active Clients",
        pending: "Pending",
      },
    },
    vault: {
      title: "My documents",
      subtitle: "Receipts and files from your platform account",
      encrypted: "AES-256 Encrypted",
      documents: "Documents",
      folders: "Folders",
      shared: "Shared",
      upload: "Upload File",
      status: {
        verified: "Verified",
        pending: "Pending",
        encrypted: "Encrypted",
      },
    },
    payments: {
      title: "Payment Center",
      subtitle: "Manage your payments securely",
      balance: "Balance",
      available: "Available",
      securePayments: "Secure payment",
      pending: "Pending",
      withdraw: "Withdraw",
      addCard: "Add Card",
      securePaymentsHelp: "How do secure payments work?",
      methods: "Payment Methods",
      transactions: "Transactions",
    },
    chat: {
      title: "Live Messages",
      search: "Search conversations...",
      online: "Online",
      offline: "Offline",
      typeMessage: "Type a message...",
      send: "Send",
      schedule: "Schedule",
      shareContract: "Share contract",
      location: "Location",
    },
    auth: {
      login: "Login",
      register: "Register",
      email: "Email",
      password: "Password",
      forgotPassword: "Forgot password?",
      noAccount: "Don't have an account?",
      hasAccount: "Already have an account?",
    },
  },
  pt: {
    nav: {
      home: "Início",
      explore: "Explorar",
      services: "Serviços",
      bookings: "Reservas",
      categories: "Categorias",
      vault: "Documentos",
      dashboard: "Painel",
      payments: "Pagamentos",
      chat: "Mensagens",
      settings: "Configurações",
      login: "Entrar",
      register: "Registrar",
      logout: "Sair",
    },
    common: {
      search: "Buscar",
      filter: "Filtrar",
      save: "Salvar",
      cancel: "Cancelar",
      confirm: "Confirmar",
      delete: "Excluir",
      edit: "Editar",
      view: "Ver",
      loading: "Carregando...",
      error: "Erro",
      success: "Sucesso",
      noResults: "Nenhum resultado encontrado",
    },
    home: {
      hero: {
        title: "A plataforma de serviços mais avançada",
        subtitle: "Conecte-se com profissionais verificados para serviços técnicos, legais, financeiros e manutenção. Tudo em um só lugar com a garantia GenFeb.",
        cta: "Explorar Serviços",
        ctaSecondary: "Reservar Agora",
      },
      features: {
        title: "Tudo o que você precisa em uma plataforma",
        subtitle: "Descubra as ferramentas que fazem da GenFeb a melhor opção para gerenciar seus serviços",
      },
      stats: {
        users: "Usuários Ativos",
        professionals: "Profissionais",
        services: "Serviços Realizados",
        rating: "Avaliação Média",
      },
    },
    booking: {
      title: "Reserve seu Serviço",
      subtitle: "Reserve em 3 cliques com confirmação imediata",
      steps: {
        service: "Selecionar Serviço",
        provider: "Selecionar Profissional",
        confirm: "Confirmar Reserva",
      },
      selectService: "Selecione um Serviço",
      selectProvider: "Selecione um Profissional",
      selectDate: "Selecione Data e Hora",
      notes: "Notas adicionais",
      contact: "Informações de contato",
      confirm: "Confirmar Reserva",
      success: "Reserva Confirmada!",
      code: "Código de Reserva",
    },
    dashboard: {
      title: "Minha atividade",
      overview: "Visão Geral",
      transactions: "Transações",
      invoices: "Faturamento",
      kpis: {
        income: "Receita Total",
        completed: "Serviços Concluídos",
        activeClients: "Clientes Ativos",
        pending: "Pendentes",
      },
    },
    vault: {
      title: "Meus documentos",
      subtitle: "Comprovantes e arquivos da sua conta na plataforma",
      encrypted: "Criptografado AES-256",
      documents: "Documentos",
      folders: "Pastas",
      shared: "Compartilhados",
      upload: "Enviar Arquivo",
      status: {
        verified: "Verificado",
        pending: "Pendente",
        encrypted: "Criptografado",
      },
    },
    payments: {
      title: "Centro de Pagamentos",
      subtitle: "Gerencie seus pagamentos com segurança",
      balance: "Saldo",
      available: "Disponível",
      securePayments: "Pagamento seguro",
      pending: "Pendente",
      withdraw: "Sacar",
      addCard: "Adicionar Cartão",
      securePaymentsHelp: "Como funcionam os pagamentos seguros?",
      methods: "Métodos de Pagamento",
      transactions: "Transações",
    },
    chat: {
      title: "Mensagens ao Vivo",
      search: "Buscar conversas...",
      online: "Online",
      offline: "Offline",
      typeMessage: "Digite uma mensagem...",
      send: "Enviar",
      schedule: "Agendar",
      shareContract: "Compartilhar contrato",
      location: "Localização",
    },
    auth: {
      login: "Entrar",
      register: "Registrar",
      email: "E-mail",
      password: "Senha",
      forgotPassword: "Esqueceu a senha?",
      noAccount: "Não tem uma conta?",
      hasAccount: "Já tem uma conta?",
    },
  },
};

export function getTranslations(lang: Language): Translations {
  return translations[lang] || translations.es;
}

export function getCurrentLanguage(): Language {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("genfeb-language");
    if (saved && ["es", "en", "pt"].includes(saved)) {
      return saved as Language;
    }
    const browserLang = navigator.language.split("-")[0];
    if (["es", "en", "pt"].includes(browserLang)) {
      return browserLang as Language;
    }
  }
  return "es";
}

export function setLanguage(lang: Language): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("genfeb-language", lang);
    window.location.reload();
  }
}

export default translations;
