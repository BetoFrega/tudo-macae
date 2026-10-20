"use client";

import { Suspense, use, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Briefcase, List, LogOut, Newspaper, Plus, Shield, User } from "lucide-react";
import Link from "next/link";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/features/authentication/AuthContext";
import { useLoginModal } from "../authentication/LoginModalContext";
import { AccountEntry } from "@tudomacae/site-layout/account-entry";
import { businessCreationDestination } from "@tudomacae/advertiser-identity/discovery";

type RegistrationDecisionValue = { decision: Promise<boolean>; visible: boolean };

function RegistrationDecision({ decision, onResolve }: { decision: Promise<boolean>; onResolve: (value: RegistrationDecisionValue) => void }) {
  const visible = use(decision);
  useEffect(() => onResolve({ decision, visible }), [decision, visible, onResolve]);
  return null;
}

function useRegistrationVisibility(initialVisible: boolean, registrationDecision: Promise<boolean> | undefined) {
  const [resolvedVisibility, setResolvedVisibility] = useState<RegistrationDecisionValue | null>(null);
  const registrationVisible = registrationDecision
    ? resolvedVisibility?.decision === registrationDecision && resolvedVisibility.visible
    : initialVisible;
  const registrationPending = Boolean(registrationDecision && resolvedVisibility?.decision !== registrationDecision);
  return { registrationVisible, registrationPending, setResolvedVisibility };
}

export default function UserSidebar({ registrationVisible: initialVisible = false, registrationDecision }: { registrationVisible?: boolean; registrationDecision?: Promise<boolean> }) {
  const { registrationVisible, registrationPending, setResolvedVisibility }
    = useRegistrationVisibility(initialVisible, registrationDecision);
  const { user, isAdmin, isEditor, logout, loading, logoutError } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const firstNavigationLinkRef = useRef<HTMLAnchorElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const navigationFocusedRef = useRef(false);
  const registrationViewedRef = useRef(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { openLoginModal } = useLoginModal();

  useLayoutEffect(() => {
    if (registrationPending && sheetOpen && navigationFocusedRef.current) {
      navigationFocusedRef.current = false;
      closeButtonRef.current?.focus();
    }
    if (!sheetOpen) navigationFocusedRef.current = false;
  }, [registrationPending, sheetOpen]);

  useEffect(() => {
    if (sheetOpen && registrationVisible && !registrationViewedRef.current) {
      registrationViewedRef.current = true;
      posthog.capture("business_creation_cta_viewed", {
        source_surface: "account", cta_variant: "create_business",
      });
    }
  }, [sheetOpen, registrationVisible]);

  if (!user) {
    return <AccountEntry onLogin={() => openLoginModal()} disabled={loading} />;
  }

  return (
    <Sheet onOpenChange={setSheetOpen}>
      {registrationDecision && (
        <Suspense><RegistrationDecision decision={registrationDecision} onResolve={setResolvedVisibility} /></Suspense>
      )}
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          className="
            flex min-h-11 min-w-11 items-center gap-2 px-2
            md:px-4
          "
        >
          <User className="size-4" />
          <span className="
            sr-only
            md:not-sr-only
          "
          >
            Minha conta
          </span>
        </Button>
      </SheetTrigger>
      <SheetContent
        closeLabel="Fechar Minha conta"
        closeButtonRef={closeButtonRef}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (firstNavigationLinkRef.current ?? closeButtonRef.current)?.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle>Minha Conta</SheetTitle>
          <SheetDescription>{user.email}</SheetDescription>
        </SheetHeader>
        {registrationPending
          ? (
              <div role="status" className="px-4 text-sm text-muted-foreground">
                Carregando opções da conta…
              </div>
            )
          : (
              <AccountNavigation
                registrationVisible={registrationVisible}
                showNewsroom={isEditor || isAdmin}
                showAdmin={isAdmin}
                firstNavigationLinkRef={firstNavigationLinkRef}
                navigationFocusedRef={navigationFocusedRef}
              />
            )}
        <SheetFooter>
          {logoutError && <p role="alert">{logoutError}</p>}
          <Button
            variant="destructive"
            disabled={loggingOut}
            aria-busy={loggingOut}
            onClick={async () => {
              setLoggingOut(true);
              try {
                await logout();
              }
              finally {
                setLoggingOut(false);
              }
            }}
            className="w-full justify-center gap-4"
          >
            <LogOut />
            Sair
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

interface AccountNavigationProps {
  registrationVisible: boolean;
  showNewsroom: boolean;
  showAdmin: boolean;
  firstNavigationLinkRef: RefObject<HTMLAnchorElement | null>;
  navigationFocusedRef: RefObject<boolean>;
}

function AccountNavigation({
  registrationVisible,
  showNewsroom,
  showAdmin,
  firstNavigationLinkRef,
  navigationFocusedRef,
}: AccountNavigationProps) {
  return (
    <div
      onFocusCapture={() => { navigationFocusedRef.current = true; }}
      onBlurCapture={(event) => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
          navigationFocusedRef.current = false;
        }
      }}
      className="grid auto-rows-min gap-2 px-4"
    >
      {registrationVisible && (
        <SheetClose asChild>
          <Button
            variant="highlight"
            asChild
            className="h-auto min-h-11 w-full justify-start text-wrap"
          >
            <Link
              href={businessCreationDestination("account")}
              ref={firstNavigationLinkRef}
              onClick={() => posthog.capture("business_creation_cta_clicked", {
                source_surface: "account", cta_variant: "create_business",
                authentication_state: "authenticated",
              })}
            >
              Cadastre seu negócio ou serviço
            </Link>
          </Button>
        </SheetClose>
      )}
      <SheetClose asChild>
        <Button
          variant={registrationVisible ? "ghost" : "highlight"}
          asChild
          className="w-full justify-start gap-2"
        >
          <Link href="/publicar" ref={registrationVisible ? undefined : firstNavigationLinkRef}>
            <Plus />
            Criar Anúncio
          </Link>
        </Button>
      </SheetClose>
      <SheetClose asChild>
        <Button
          variant="ghost"
          asChild
          className="w-full justify-start gap-2"
        >
          <Link href="/minha-conta/anuncios">
            <List />
            Meus Anúncios
          </Link>
        </Button>
      </SheetClose>
      <SheetClose asChild>
        <Button
          variant="ghost"
          asChild
          className="w-full justify-start gap-2"
        >
          <Link href="/minha-conta/perfis">
            <Briefcase />
            Meus Perfis
          </Link>
        </Button>
      </SheetClose>
      {showNewsroom && (
        <SheetClose asChild>
          <Button
            variant="ghost"
            asChild
            className="w-full justify-start gap-2"
          >
            <Link href="/redacao">
              <Newspaper />
              Blog
            </Link>
          </Button>
        </SheetClose>
      )}
      {showAdmin && (
        <SheetClose asChild>
          <Button
            variant="ghost"
            asChild
            className="w-full justify-start gap-2"
          >
            <Link href="/admin">
              <Shield />
              Painel Admin
            </Link>
          </Button>
        </SheetClose>
      )}
    </div>
  );
}
