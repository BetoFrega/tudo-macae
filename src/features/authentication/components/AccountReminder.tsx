"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "../AuthContext";
import { ACCOUNT_REMINDER_CHANGED_EVENT } from "../accountReminderEvents";
import { readAccountReminderFromBrowser, type AccountReminderValue } from "../readAccountStatus";
import { Button } from "@/components/ui/button";

export function AccountReminder() {
  const { user, verificationError } = useAuth();
  const uid = user?.uid;
  const accountKey = uid ? `${uid}:${user.emailVerified}` : undefined;
  const pathname = usePathname();
  const publication = useSearchParams().get("publication") ?? undefined;
  const [snapshot, setSnapshot] = useState<{
    accountKey: string;
    reminder: AccountReminderValue;
  }>();
  const latestRequest = useRef(0);
  const [, startTransition] = useTransition();
  useEffect(() => {
    let active = true;
    const refresh = () => {
      const request = ++latestRequest.current;
      startTransition(async () => {
        try {
          const result = uid ? await readAccountReminderFromBrowser(publication) : null;
          if (active && accountKey && request === latestRequest.current) {
            setSnapshot({ accountKey, reminder: result });
          }
        }
        catch { /* A failed read does not prove that an existing reminder was resolved. */ }
      });
    };
    refresh();
    window.addEventListener(ACCOUNT_REMINDER_CHANGED_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(ACCOUNT_REMINDER_CHANGED_EVENT, refresh);
    };
  }, [uid, accountKey, pathname, publication]);
  const reminder = snapshot && snapshot.accountKey === accountKey ? snapshot.reminder : null;
  if (!user || !reminder) return null;
  return (
    <aside aria-label="Pendência da conta" className="border-b bg-muted">
      <div className="
        container mx-auto flex flex-col gap-2 px-4 py-3
        sm:flex-row sm:items-center sm:justify-between sm:gap-6
      "
      >
        <div className="space-y-1">
          <p className="text-sm font-medium">{reminder.text}</p>
          {!user.emailVerified && verificationError && (
            <p
              role="alert"
              className="text-sm text-destructive"
            >
              {verificationError}
            </p>
          )}
        </div>
        <Button
          asChild
          size="sm"
          variant="outline"
          className="
            min-h-11 shrink-0 self-start
            sm:self-auto
          "
        >
          <Link href={reminder.href}>{reminder.label}</Link>
        </Button>
      </div>
    </aside>
  );
}
