import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getCurrentUser } from "./api/db.functions";
import { signOutFn } from "./api/auth.functions";

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
}

export interface Session {
  access_token: string;
  user: User;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  login: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const login = (token: string, user: User) => {
    localStorage.setItem("pb_session_token", token);
    setSession({ access_token: token, user });
  };

  const logout = async () => {
    const token = localStorage.getItem("pb_session_token");
    if (token) {
      try {
        await signOutFn({ data: { token } });
      } catch (err) {
        console.error("Signout error:", err);
      }
    }
    localStorage.removeItem("pb_session_token");
    setSession(null);
  };

  useEffect(() => {
    const token = localStorage.getItem("pb_session_token");
    if (!token) {
      setLoading(false);
      return;
    }

    getCurrentUser()
      .then((user) => {
        if (user) {
          setSession({ access_token: token, user });
        } else {
          localStorage.removeItem("pb_session_token");
        }
      })
      .catch((err) => {
        console.error("Load user error:", err);
        localStorage.removeItem("pb_session_token");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <Ctx.Provider value={{ user: session?.user ?? null, session, loading, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
