import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface User {
  id: string;
  email: string;
  name: string;
  lastName: string;
  role: string;
  phone?: string;
  avatar?: string;
  createdAt?: Date;
}

async function fetchUser(): Promise<User | null> {
  const token = localStorage.getItem("token");
  
  const response = await fetch("/api/auth/me", {
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

async function login(credentials: { email: string; password: string }): Promise<{ token: string; user: User }> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
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
  
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  
  localStorage.removeItem("token");
}

export function useAuth() {
  const queryClient = useQueryClient();
  
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5,
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
    },
  });

  // Función para establecer el usuario manualmente (para uso inmediato tras registro/login)
  const setUser = (user: User) => {
    queryClient.setQueryData(["user"], user);
  };

  return {
    user,
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
