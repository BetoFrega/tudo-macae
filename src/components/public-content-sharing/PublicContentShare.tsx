"use client";

import { Copy, Share2 } from "lucide-react";
import posthog from "posthog-js";
import { useState, useSyncExternalStore } from "react";
import { CANONICAL_APP_ORIGIN } from "../../../bin/appOrigin";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { cn } from "@/lib/utils";

type ShareableContent = {
  kind: "article" | "ad";
  id: string;
  title: string;
  canonicalPath: string;
};

type ShareMethod = "whatsapp" | "native_share" | "copy_link";

function attributedUrl(content: ShareableContent, source: ShareMethod) {
  const url = new URL(content.canonicalPath, CANONICAL_APP_ORIGIN);
  url.search = "";
  url.hash = "";
  url.searchParams.set("utm_source", source);
  url.searchParams.set("utm_medium", "share");
  return url.href;
}

function shareText(content: ShareableContent) {
  if (content.kind === "article") {
    return `${content.title} — leia no Tudo Macaé`;
  }
  return `Olha este anúncio no Tudo Macaé: ${content.title}`;
}

function shareMessage(content: ShareableContent, url: string) {
  return `${shareText(content)}\n${url}`;
}

function whatsappHref(content: ShareableContent) {
  const url = attributedUrl(content, "whatsapp");
  const whatsapp = new URL("/", "https://wa.me");
  whatsapp.searchParams.set("text", shareMessage(content, url));
  return whatsapp.href;
}

function subscribeToBrowserCapabilities() {
  return () => {};
}

function nativeShareSupported() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

function recordShareInitiated(content: ShareableContent, method: ShareMethod) {
  try {
    posthog.capture("content_share_initiated", {
      content_kind: content.kind,
      content_id: content.id,
      share_method: method,
    });
  }
  catch {
    // Telemetry is observational; sharing must remain available when it fails.
  }
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  }
  catch {
    const field = document.createElement("textarea");
    field.value = value;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    try {
      return document.execCommand?.("copy") ?? false;
    }
    catch {
      return false;
    }
    finally {
      field.remove();
    }
  }
}

export function PublicContentShare({
  content,
  className,
}: {
  content: ShareableContent;
  className?: string;
}) {
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed" | null>(null);
  const [nativeShareFailed, setNativeShareFailed] = useState(false);
  const nativeShareAvailable = useSyncExternalStore(
    subscribeToBrowserCapabilities,
    nativeShareSupported,
    () => false,
  ) && !nativeShareFailed;

  const openNativeShare = async () => {
    recordShareInitiated(content, "native_share");
    try {
      await navigator.share({
        title: content.title,
        text: shareText(content),
        url: attributedUrl(content, "native_share"),
      });
    }
    catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setNativeShareFailed(true);
    }
  };

  const copyLink = async () => {
    recordShareInitiated(content, "copy_link");
    setCopyStatus(await copyText(attributedUrl(content, "copy_link"))
      ? "copied"
      : "failed");
  };

  return (
    <section
      aria-label="Compartilhar conteúdo"
      className={cn("space-y-2", className)}
    >
      <div className="
        flex flex-col items-stretch gap-2
        sm:flex-row sm:flex-wrap sm:items-center
      "
      >
        <Button
          asChild
          size="lg"
          className="h-auto min-h-11 min-w-0 py-2 whitespace-normal"
        >
          <a
            href={whatsappHref(content)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => recordShareInitiated(content, "whatsapp")}
          >
            <WhatsAppIcon aria-hidden="true" className="size-5" />
            <span className="min-w-0 wrap-anywhere whitespace-normal">
              Compartilhar no WhatsApp
            </span>
          </a>
        </Button>
        {nativeShareAvailable
          ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="min-h-11"
                onClick={openNativeShare}
              >
                <Share2 aria-hidden="true" />
                Compartilhar
              </Button>
            )
          : (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="min-h-11"
                onClick={copyLink}
              >
                <Copy aria-hidden="true" />
                Copiar link
              </Button>
            )}
      </div>
      {copyStatus === "copied" && (
        <p role="status" className="text-sm text-muted-foreground">Link copiado.</p>
      )}
      {copyStatus === "failed" && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível copiar o link. Copie o endereço na barra do navegador.
        </p>
      )}
      {nativeShareFailed && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível abrir as opções de compartilhamento. Copie o link ou use
          o WhatsApp.
        </p>
      )}
    </section>
  );
}
