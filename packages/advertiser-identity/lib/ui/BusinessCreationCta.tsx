"use client";
import { useIdentityIntegrations, useCreationCta } from "./context";

import { ArrowUpRight } from "lucide-react";
import { useEffect, useId, useRef, type ComponentProps } from "react";

import { businessCreationDestination, type BusinessCreationSurface } from "../../businessCreation";

export type BusinessCreationButtonProps = ComponentProps<"button"> & {
  sourceSurface?: BusinessCreationSurface;
};

export function BusinessCreationButton({ sourceSurface = "catalog", children = "Cadastre seu negócio ou serviço", onClick, className, ...props }: BusinessCreationButtonProps) {
  const { capture } = useIdentityIntegrations();
  const { signedIn: user, loading, navigate, requestSignIn } = useCreationCta();
  const containerRef = useRef<HTMLButtonElement>(null);
  const viewedRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const captureView = () => {
      if (viewedRef.current) return;
      viewedRef.current = true;
      capture("business_creation_cta_viewed", { source_surface: sourceSurface, cta_variant: "create_business" });
    };

    if (typeof IntersectionObserver === "undefined") {
      captureView();
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) {
        captureView();
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(container);
    return () => observer.disconnect();
  }, [capture, sourceSurface]);

  const handleClick = () => {
    capture("business_creation_cta_clicked", {
      source_surface: sourceSurface, cta_variant: "create_business",
      authentication_state: user ? "authenticated" : "visitor",
    });

    if (user) {
      navigate(businessCreationDestination(sourceSurface));
      return;
    }
    requestSignIn(() => navigate(businessCreationDestination(sourceSurface)));
  };

  return (
    <button
      {...props}
      ref={containerRef}
      type="button"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) handleClick();
      }}
      disabled={loading || props.disabled}
      className={className
        ? `
          inline-flex items-center justify-between gap-3
          ${className}
        `
        : `
          inline-flex min-h-11 max-w-full items-center justify-between gap-3
          rounded-md bg-highlight px-4 py-3 text-left font-semibold
          text-highlight-foreground
          hover:bg-highlight-hover
          focus-visible:outline-2 focus-visible:outline-offset-4
          focus-visible:outline-highlight-ink
          disabled:cursor-wait disabled:opacity-60
        `}
    >
      <span className="min-w-0">{children}</span>
      <ArrowUpRight aria-hidden="true" className="size-5 shrink-0" />
    </button>
  );
}

export function BusinessCreationCta({ promoted = false }: { promoted?: boolean }) {
  const titleId = useId();
  return (
    <aside
      aria-labelledby={titleId}
      className="
        rounded-xl bg-muted/60 p-5 text-foreground
        sm:p-6
      "
    >
      <h2
        id={titleId}
        className="text-xl font-semibold tracking-tight"
      >
        {promoted ? "Cadastre seu negócio ou serviço" : "Comece o cadastro do seu negócio"}
      </h2>
      <p className="mt-2 text-sm/6">
        Adicione uma área de atuação e um contato para aparecer no catálogo de Macaé.
      </p>
      <BusinessCreationButton
        className="
          mt-5 inline-flex min-h-11 items-center justify-between gap-5
          rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground
          transition-colors
          hover:bg-primary/90
          focus-visible:outline-2 focus-visible:outline-offset-4
          focus-visible:outline-primary
          disabled:cursor-wait disabled:opacity-60
        "
      >
        {promoted ? "Cadastre seu negócio ou serviço" : "Criar negócio"}
      </BusinessCreationButton>
    </aside>
  );
}
