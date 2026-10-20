"use client";

import { useEffect, useRef, useState } from "react";
import type { HumanChallengeProps } from "@tudomacae/authentication/ui";

type Turnstile = {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
};
declare global {
  interface Window { turnstile?: Turnstile }
}

const scriptUrl = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
// A stalled script would otherwise keep every challenged submit disabled.
const scriptTimeoutMs = 10_000;
// The normal widget is 300px wide; narrower dialogs (320px viewports) get the 150px compact one.
const normalWidgetWidth = 300;
let scriptLoad: Promise<Turnstile> | undefined;

function loadTurnstile() {
  scriptLoad ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      clearTimeout(timer);
      scriptLoad = undefined;
      script.remove();
      reject(new Error("Turnstile unavailable"));
    };
    const timer = setTimeout(fail, scriptTimeoutMs);
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => {
      clearTimeout(timer);
      if (window.turnstile) resolve(window.turnstile);
      else fail();
    };
    script.onerror = fail;
    document.head.append(script);
  });
  return scriptLoad;
}

/** Mounts one Turnstile widget; the form remounts it to obtain a fresh single-use token. */
export function TurnstileChallenge({ siteKey, action, onToken, onUnavailable }: HumanChallengeProps & { siteKey: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  // The widget has a fixed width, so crossing the breakpoint after mount (resize, zoom,
  // rotation) remounts it in the size that fits.
  const [compact, setCompact] = useState<boolean>();
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => setCompact(element.clientWidth < normalWidgetWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (compact === undefined) return;
    let widgetId: string | undefined;
    let turnstile: Turnstile | undefined;
    let cancelled = false;
    const fail = () => {
      onToken(null);
      setUnavailable(true);
      onUnavailable();
    };
    loadTurnstile().then((loaded) => {
      if (cancelled || !container.current) return;
      turnstile = loaded;
      widgetId = loaded.render(container.current, {
        "sitekey": siteKey,
        action,
        "size": compact ? "compact" : "normal",
        "language": "pt-br",
        "callback": (token: string) => {
          setUnavailable(false);
          onToken(token);
        },
        "expired-callback": () => onToken(null),
        "error-callback": fail,
        "unsupported-callback": fail,
      });
    }, fail);
    return () => {
      cancelled = true;
      if (!widgetId) return;
      // remove() fires no callbacks, so the token goes with the widget it came from.
      turnstile?.remove(widgetId);
      onToken(null);
    };
  }, [siteKey, action, onToken, onUnavailable, compact]);
  return (
    <div>
      <div ref={container} className="min-h-[65px]" />
      {unavailable && (
        <p role="status" className="text-sm text-destructive">
          Não foi possível carregar a verificação de segurança. Se o envio for recusado, recarregue a página.
        </p>
      )}
    </div>
  );
}
