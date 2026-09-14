import { useCurrentUser, useLogin, useLogout, useRegister } from "./authQueries";

export function useAuth() {
  const currentUserQuery = useCurrentUser();
  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const logoutMutation = useLogout();

  return {
    user: currentUserQuery.data ?? null,
    isLoading: currentUserQuery.isLoading,
    login: async (email: string, password: string) => {
      await loginMutation.mutateAsync({ email, password });
    },
    register: async (email: string, password: string, displayName: string) => {
      await registerMutation.mutateAsync({ email, password, displayName });
    },
    logout: async () => {
      await logoutMutation.mutateAsync();
    },
  };
}
