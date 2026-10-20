"use client";
import { createContext, useContext } from "react";
import type { SessionUser } from "../../session";

export interface AuthContextType {
  user: {
    uid: string;
    email: string | null;
    emailVerified?: boolean;
  } | null;
  isAdmin: boolean;
  isEditor: boolean;
  loading: boolean;
  verificationError?: string;
  logoutError?: string;
  clearVerificationError?: () => void;
  refreshSession?: () => Promise<SessionUser | null>;
  getSessionRefreshOperationId?: () => string | undefined;
  logout: () => Promise<void>;
  login: (input: {
    method: "email-password";
    action: "login" | "register";

    data: {
      email: string;
      password: string;
      challengeToken?: string | undefined;
    };
  }) => Promise<{
    success: boolean;
    error?: string;
  }>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  isEditor: false,
  loading: true,
  logout: async () => {},
  // @ts-expect-error - login is initialized in AuthProvider but context requires a valid function type
  login: null,
});

export const useAuth = () => useContext(AuthContext);
