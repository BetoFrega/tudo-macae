"use client";
import { useIdentityIntegrations } from "./context";

import { formatPhoneNumber } from "../../phonePresentation";
import { Phone } from "lucide-react";
import { businessContactEvent } from "../../businessAnalytics";
import { WhatsAppIcon } from "@tudomacae/react-primitives/whatsapp-icon";

interface Contact {
  number: string;
  isWhatsapp: boolean;
}

interface AdvertiserContactListProps {
  contacts?: Contact[];
  sourcePath: string;
  fitWithinParent?: boolean;
  analytics?: {
    source: string;
    businessId: string;
    categoryId?: string;
    subcategoryId?: string;
  };
}

function whatsappHref(number: string, sourcePath: string, origin: string) {
  const sourceUrl = new URL(sourcePath, origin).href;
  const whatsappUrl = new URL(`/55${number}`, "https://wa.me");
  whatsappUrl.searchParams.set(
    "text",
    `Olá! Encontrei seu telefone no Tudo Macaé: ${sourceUrl}`,
  );
  return whatsappUrl.href;
}

export function AdvertiserContactList({
  contacts,
  sourcePath,
  fitWithinParent = false,
  analytics,
}: AdvertiserContactListProps) {
  const integrations = useIdentityIntegrations();
  if (!contacts || contacts.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        Este negócio ainda não informou um telefone para contato.
      </p>
    );
  }

  return (
    <div className={`
      mt-4 flex flex-wrap gap-4
      ${fitWithinParent
      ? `
        [&>div]:min-w-0
        [&>div>a]:flex-wrap [&>div>a]:wrap-anywhere
      `
      : ""}
    `}
    >
      {contacts.map((contact, index) => (
        <div
          key={index}
          className="flex items-center gap-2 text-sm text-foreground"
        >
          <a
            href={contact.isWhatsapp
              ? whatsappHref(contact.number, sourcePath, integrations.origin)
              : `tel:${contact.number}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              if (!analytics) return;
              const event = businessContactEvent({
                source: analytics.source,
                businessId: analytics.businessId,
                kind: contact.isWhatsapp ? "whatsapp" : "phone",
                ...(analytics.categoryId ? { categoryId: analytics.categoryId } : {}),
                ...(analytics.subcategoryId ? { subcategoryId: analytics.subcategoryId } : {}),
              });
              integrations.capture(event.name, event.properties);
            }}
            className={`
              flex items-center gap-1.5 font-medium text-success
              hover:underline
            `}
          >
            {contact.isWhatsapp
              ? (
                  <WhatsAppIcon
                    role="img"
                    aria-label="WhatsApp"
                    className="size-6"
                  />
                )
              : (
                  <Phone height={24} />
                )}
            {formatPhoneNumber(contact.number)}
          </a>
        </div>
      ))}
    </div>
  );
}
