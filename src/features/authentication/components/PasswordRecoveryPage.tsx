"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ForgotPasswordForm } from "@tudomacae/authentication/ui";
export function PasswordRecoveryPage() {
  const [email, setEmail] = useState("");
  const router = useRouter();
  return (
    <ForgotPasswordForm
      email={email}
      onEmailChange={setEmail}
      onSwitchToLogin={() => router.push("/minha-conta")}
    />
  );
}
