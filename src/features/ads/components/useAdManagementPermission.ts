"use client";

import { useEffect, useState } from "react";
import { canManageAd } from "../actions/canManageAd";
import { useAuth } from "@/features/authentication/AuthContext";

type PermissionStatus = "allowed" | "denied" | "unavailable";
type PermissionContext = { uid: string | undefined; adId: string; isAdmin: boolean; isEditor: boolean };
type PermissionResult = { generation: number; adId: string; isAdmin: boolean; isEditor: boolean; status: PermissionStatus };

function isSameContext(a: PermissionContext, b: PermissionContext) {
  return a.uid === b.uid && a.adId === b.adId && a.isAdmin === b.isAdmin && a.isEditor === b.isEditor;
}

function currentStatus(result: PermissionResult | null, session: PermissionContext & { generation: number }, context: PermissionContext): PermissionStatus | null {
  if (!context.uid || session.uid !== context.uid) return null;
  if (result?.generation !== session.generation) return null;
  const matchesContext = result.adId === context.adId && result.isAdmin === context.isAdmin && result.isEditor === context.isEditor;
  return matchesContext ? result.status : null;
}

export function useAdManagementPermission(adId: string) {
  const { user, loading, isAdmin, isEditor } = useAuth();
  const uid = user?.uid;
  const [session, setSession] = useState({ uid, adId, isAdmin, isEditor, generation: 0 });
  const viewer = { uid, adId, isAdmin, isEditor };
  if (!isSameContext(session, viewer)) {
    setSession({ ...viewer, generation: session.generation + 1 });
  }
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<PermissionResult | null>(null);

  useEffect(() => {
    let current = true;
    if (uid && !loading) {
      const context = { generation: session.generation, adId, isAdmin, isEditor };
      void canManageAd(adId).then(({ status }) => {
        if (current) setResult({ ...context, status });
      }).catch(() => {
        if (current) setResult({ ...context, status: "unavailable" });
      });
    }
    return () => {
      current = false;
    };
  }, [adId, uid, user, loading, session.generation, isAdmin, isEditor, retry]);

  const status = currentStatus(result, session, viewer);
  return { allowed: status === "allowed", unavailable: status === "unavailable", retry: () => setRetry(value => value + 1) };
}
