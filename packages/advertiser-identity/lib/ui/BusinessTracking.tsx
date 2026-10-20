"use client";
import { useIdentityIntegrations } from "./context";

import { useEffect, type MouseEventHandler, type ReactNode } from "react";
import {
  businessActivityEvent,
  businessCatalogEnteredEvent,
  businessOpenedEvent,
} from "../../businessAnalytics";

export function BusinessCatalogAnalytics(props: {
  source: string;
  categoryId?: string;
  subcategoryId?: string;
}) {
  const { capture } = useIdentityIntegrations();
  useEffect(() => {
    const entered = businessCatalogEnteredEvent({ source: props.source });
    capture(entered.name, entered.properties);
    if (props.categoryId && props.subcategoryId) {
      const activity = businessActivityEvent({
        source: props.source,
        categoryId: props.categoryId,
        subcategoryId: props.subcategoryId,
      });
      capture(activity.name, activity.properties);
    }
  }, [capture, props.categoryId, props.source, props.subcategoryId]);
  return null;
}

export function BusinessLink(props: {
  "href": string;
  "source": string;
  "businessId": string;
  "categoryId"?: string;
  "subcategoryId"?: string;
  "className"?: string;
  "children": ReactNode;
  "aria-label"?: string;
}) {
  const { Link, capture } = useIdentityIntegrations();
  const onClick: MouseEventHandler<HTMLAnchorElement> = () => {
    const event = businessOpenedEvent({
      source: props.source,
      businessId: props.businessId,
      ...(props.categoryId ? { categoryId: props.categoryId } : {}),
      ...(props.subcategoryId ? { subcategoryId: props.subcategoryId } : {}),
    });
    capture(event.name, event.properties);
  };
  return (
    <Link
      href={props.href}
      onClick={onClick}
      className={props.className}
      aria-label={props["aria-label"]}
    >
      {props.children}
    </Link>
  );
}
