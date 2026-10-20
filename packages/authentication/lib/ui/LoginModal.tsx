"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tudomacae/react-primitives/dialog";
import { useAuth } from "./authState";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";
import { useAuthenticationIntegration } from "./integration";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  purpose?: string;
  returnFocusTo?: HTMLElement | null;
}

type ModalMode = "login" | "register" | "forgot-password";

const modalTitles: Record<ModalMode, string> = {
  "login": "Entre na sua conta",
  "register": "Crie sua conta",
  "forgot-password": "Recuperar senha",
};

// When the element that opened the modal has left the document (a login that
// removes the button or swaps the content), focus goes to the page heading or,
// failing that, the main landmark. Without it focus falls to the body.
function pageFocusDestination(): HTMLElement | null {
  const destination = document.querySelector<HTMLElement>("main h1")
    ?? document.querySelector<HTMLElement>("main");
  if (destination && !destination.hasAttribute("tabindex")) destination.tabIndex = -1;
  return destination;
}

// The opener can leave the document after the dialog closes (a
// `router.refresh()` or a navigation that waits for uploads). Watching lasts
// while the opener keeps focus; if it disappears and focus falls to the body,
// focus moves to the page destination. If focus leaves the opener first, the
// user already chose where it goes.
function watchOpenerRemoval(opener: HTMLElement) {
  const stop = () => {
    observer.disconnect();
    opener.removeEventListener("blur", onBlur);
  };
  const refocusIfLost = () => {
    stop();
    if (document.activeElement && document.activeElement !== document.body) return;
    pageFocusDestination()?.focus();
  };
  // Some browsers fire blur when the focused element is removed; only a blur
  // with the opener still in the document means the user moved focus.
  const onBlur = () => {
    if (opener.isConnected) stop();
    else queueMicrotask(refocusIfLost);
  };
  const observer = new MutationObserver(() => {
    if (!opener.isConnected) refocusIfLost();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  opener.addEventListener("blur", onBlur);
}

export function LoginModal({ isOpen, onClose, onSuccess, purpose, returnFocusTo }: LoginModalProps) {
  const [mode, setMode] = useState<ModalMode>("login");
  const [email, setEmail] = useState("");

  const { login } = useAuth();
  const { installTestLogin, describeLogin } = useAuthenticationIntegration();
  useEffect(() => installTestLogin?.(async (email, password) => {
    await login({ method: "email-password", action: "login", data: { email, password } });
  }), [login, installTestLogin]);

  const handleSuccess = () => {
    setEmail("");
    setMode("login");
    onSuccess();
  };

  const title = modalTitles[mode];
  const description = describeLogin(mode, purpose);

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent
        className="sm:max-w-[425px]"
        onCloseAutoFocus={(event) => {
          // Safari does not focus buttons on click, so the recorded opener can
          // be the body; that is no opener to return to.
          const opener = returnFocusTo?.isConnected && returnFocusTo !== document.body
            ? returnFocusTo
            : null;
          const target = opener ?? pageFocusDestination();
          if (!target) return;
          event.preventDefault();
          target.focus();
          if (opener) watchOpenerRemoval(opener);
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {mode === "login" && (
          <LoginForm
            email={email}
            onEmailChange={setEmail}
            onSuccess={handleSuccess}
            onForgotPassword={() => setMode("forgot-password")}
            onSwitchToRegister={() => setMode("register")}
          />
        )}

        {mode === "register" && (
          <RegisterForm
            email={email}
            onEmailChange={setEmail}
            onSuccess={handleSuccess}
            onSwitchToLogin={() => setMode("login")}
          />
        )}

        {mode === "forgot-password" && (
          <ForgotPasswordForm
            email={email}
            onEmailChange={setEmail}
            onSwitchToLogin={() => setMode("login")}
            autoFocus
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
