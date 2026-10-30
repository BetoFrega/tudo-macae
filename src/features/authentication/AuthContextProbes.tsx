import { render, screen } from "@testing-library/react";
import { Component, type ReactNode, useState } from "react";
import { AuthProvider, useAuth } from "./AuthContext";

/**
 * Reads the roles back out of the context the way any consumer would, so the
 * assertions are about what a component would see rather than about state.
 */
function RoleProbe() {
  const { user, isAdmin, isEditor, logout, logoutError } = useAuth();
  return (
    <>
      <span>{`admin:${isAdmin} editor:${isEditor}`}</span>
      <span>{`quem:${user ? `${user.uid}/${user.email}` : "ninguém"}`}</span>
      <button type="button" onClick={logout}>Sair</button>
      {logoutError && <p role="alert">{logoutError}</p>}
    </>
  );
}

export const roles = (admin: boolean, editor: boolean) =>
  screen.findByText(`admin:${admin} editor:${editor}`);

export const renderProvider = () =>
  render(<AuthProvider><RoleProbe /></AuthProvider>);

export function SignInProbe({
  action = "login",
  method = "email-password",
}: {
  action?: "login" | "register";
  method?: "email-password";
}) {
  const { login: signIn, user, isEditor } = useAuth();
  const [result, setResult] = useState<string>();
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const response = await signIn({
            method,
            action,
            data: { email: "a@example.com", password: "x" },
          });
          setResult(response.success ? "sucesso" : response.error);
        }}
      >
        {action === "register" ? "Cadastrar" : "Entrar"}
      </button>
      <span>{`quem:${user ? `${user.uid}/${user.email}` : "ninguém"}`}</span>
      <span>{`editor:${isEditor}`}</span>
      {result && <span>{`resultado:${result}`}</span>}
    </>
  );
}

export class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div>Boundary fallback</div> : this.props.children; }
}
export function SessionProbe() {
  const { user, loading, isAdmin, isEditor } = useAuth();
  return <div>{loading ? "pending" : `ready:${user?.uid ?? "anonymous"}:${isAdmin}:${isEditor}`}</div>;
}

export function ExplicitRefreshProbe() {
  const { refreshSession, user } = useAuth();
  const [result, setResult] = useState("");
  return (
    <>
      <SessionProbe />
      <span>{`email:${user?.email} verified:${user?.emailVerified}`}</span>
      <button
        type="button"
        onClick={async () => {
          try {
            await refreshSession?.();
            setResult("success");
          }
          catch { setResult("explicit failure"); }
        }}
      >
        Refresh
      </button>
      <span>{result}</span>
    </>
  );
}
