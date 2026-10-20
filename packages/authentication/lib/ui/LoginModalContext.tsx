"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { LoginModal } from "./LoginModal";

interface LoginModalContextType {
  openLoginModal: (
    onSuccess?: () => void,
    onDismiss?: () => void,
    purpose?: string,
    returnFocusTo?: HTMLElement | null,
  ) => void;
  closeLoginModal: () => void;
  registerDefaultOnSuccess: (callback: () => void) => () => void;
}

export const LoginModalContext = createContext<LoginModalContextType>({
  openLoginModal: () => {},
  closeLoginModal: () => {},
  registerDefaultOnSuccess: () => () => undefined,
});

export const useLoginModal = () => useContext(LoginModalContext);

export function LoginModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [purpose, setPurpose] = useState<string | undefined>();
  const [onSuccessCallback, setOnSuccessCallback] = useState<
    (() => void) | undefined
  >();
  const [onDismissCallback, setOnDismissCallback] = useState<
    (() => void) | undefined
  >();
  const defaultOnSuccessCallback = useRef<(() => void) | undefined>(undefined);
  const [focusOrigin, setFocusOrigin] = useState<HTMLElement | null>(null);

  const registerDefaultOnSuccess = useCallback((callback: () => void) => {
    defaultOnSuccessCallback.current = callback;
    return () => {
      if (defaultOnSuccessCallback.current === callback) {
        defaultOnSuccessCallback.current = undefined;
      }
    };
  }, []);

  const openLoginModal = useCallback((
    onSuccess?: () => void,
    onDismiss?: () => void,
    nextPurpose?: string,
    returnFocusTo?: HTMLElement | null,
  ) => {
    setFocusOrigin(returnFocusTo ?? (document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null));
    setOnSuccessCallback(() => onSuccess);
    setOnDismissCallback(() => onDismiss);
    setPurpose(nextPurpose);
    setIsOpen(true);
  }, []);

  // Closes the modal and discards both callbacks, without invoking either.
  const resetModal = useCallback(() => {
    setIsOpen(false);
    setOnSuccessCallback(undefined);
    setOnDismissCallback(undefined);
    setPurpose(undefined);
  }, []);

  const closeLoginModal = useCallback(() => {
    if (onDismissCallback) {
      onDismissCallback();
    }
    resetModal();
  }, [onDismissCallback, resetModal]);

  const handleSuccess = useCallback(() => {
    (onSuccessCallback ?? defaultOnSuccessCallback.current)?.();
    resetModal();
  }, [onSuccessCallback, resetModal]);

  return (
    <LoginModalContext.Provider value={{ openLoginModal, closeLoginModal, registerDefaultOnSuccess }}>
      {children}
      <LoginModal
        isOpen={isOpen}
        {...(purpose ? { purpose } : {})}
        returnFocusTo={focusOrigin}
        onClose={closeLoginModal}
        onSuccess={handleSuccess}
      />
    </LoginModalContext.Provider>
  );
}
