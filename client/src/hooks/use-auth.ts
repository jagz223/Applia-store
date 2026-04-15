import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { User } from "@shared/models/auth";
import { redirectToHomeAfterLogout } from "@/lib/auth-utils";

/** Perfil de proveedor (incluido en /api/auth/me cuando el usuario es proveedor). */
export interface AuthUserProvider {
  id: number;
  categoryId?: number | null;
  category?: string | null;
  profession?: string;
  [key: string]: unknown;
}

/** Usuario tal como lo devuelve la API de auth (incluye role y provider si es proveedor). */
export type AuthUser = User & {
  role?: string;
  provider?: AuthUserProvider | null;
  /** Campo Firestore `acceptedProviderTermsOfUse`; solo aplica a profesionales (true = ya aceptó). */
  acceptedProviderTermsOfUse?: boolean;
};

async function fetchUser(): Promise<AuthUser | null> {
  const token = localStorage.getItem("token");
  
  const response = await fetch(api.auth.me.path, {
    method: api.auth.me.method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (response.status === 401) {
    localStorage.removeItem("token");
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function login(credentials: { email: string; password: string }): Promise<{ token: string; user: AuthUser }> {
  const response = await fetch(api.auth.login.path, {
    method: api.auth.login.method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Login failed");
  }

  return response.json();
}

async function logout(): Promise<void> {
  const token = localStorage.getItem("token");
  
  await fetch(api.auth.logout.path, {
    method: api.auth.logout.method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  
  localStorage.removeItem("token");
}

export interface UseAuthReturn {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: { email: string; password: string }) => void;
  logout: () => void;
  isLoggingIn: boolean;
  isLoggingOut: boolean;
  loginError: Error | null;
  setUser: (user: AuthUser) => void;
}

export function useAuth(): UseAuthReturn {
  const queryClient = useQueryClient();
  
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["user"],
    queryFn: fetchUser,
    retry: false,
    /** Incluye `provider` embebido; debe acercarse a /providers/me tras verificación. */
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      localStorage.setItem("token", data.token);
      queryClient.setQueryData(["user"], data.user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(["user"], null);
      redirectToHomeAfterLogout();
    },
  });

  // Función para establecer el usuario manualmente (para uso inmediato tras registro/login)
  const setUser = (user: AuthUser) => {
    queryClient.setQueryData(["user"], user);
  };

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    login: loginMutation.mutate,
    logout: logoutMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
    loginError: loginMutation.error,
    setUser,
  };
}
