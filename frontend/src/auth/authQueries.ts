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
      queryClient.setQueryData(authKeys.currentUser, null);
    },
  });
}
