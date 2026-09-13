import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchCurrentUser,
  loginUser,
  logoutUser,
  refreshSession,
  registerUser,
  type AuthUser,
} from "./authApi";

export const authKeys = {
  currentUser: ["auth", "me"] as const,
};

async function establishSession(): Promise<AuthUser | null> {
  try {
    let currentUser = await fetchCurrentUser();
    if (!currentUser) {
      const refreshed = await refreshSession();
      if (refreshed) {
        currentUser = await fetchCurrentUser();
      }
    }
    return currentUser;
  } catch {
    return null;
  }
}

export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.currentUser,
    queryFn: establishSession,
    // Avoid refetch storms across multiple useAuth() consumers (ProtectedRoute,
    // PageFrame, etc. each mount their own observer for this key); the cache is
    // only ever updated via the mutations' setQueryData calls below.
    staleTime: Infinity,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => loginUser(email, password),
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.currentUser, user);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      email,
      password,
      displayName,
    }: {
      email: string;
      password: string;
      displayName: string;
    }) => registerUser(email, password, displayName),
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.currentUser, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logoutUser,
    onSuccess: () => {
      // Purge every other cached query so a subsequent login by a different
      // account on the same tab never shows stale data. The auth query itself
      // is deliberately excluded from removal (only its data is reset) to
      // avoid destroying the active useCurrentUser() observer's query object,
      // which would otherwise force it to rebuild via establishSession().
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
      queryClient.setQueryData(authKeys.currentUser, null);
    },
  });
}
