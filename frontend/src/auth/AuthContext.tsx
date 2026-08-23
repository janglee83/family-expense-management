import { createContext, useEffect, useState, type ReactNode } from "react";
import {
  fetchCurrentUser,
  loginUser,
  logoutUser,
  refreshSession,
  registerUser,
  type AuthUser,
} from "./authApi";

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

// AuthContext must live alongside AuthProvider so useAuth.ts can import it directly.
// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function establishSession() {
      let currentUser = await fetchCurrentUser();
      if (!currentUser) {
        const refreshed = await refreshSession();
        if (refreshed) {
          currentUser = await fetchCurrentUser();
        }
      }
      if (!cancelled) {
        setUser(currentUser);
        setIsLoading(false);
      }
    }

    void establishSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function login(email: string, password: string) {
    setUser(await loginUser(email, password));
  }

  async function register(email: string, password: string, displayName: string) {
    setUser(await registerUser(email, password, displayName));
  }

  async function logout() {
    await logoutUser();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
