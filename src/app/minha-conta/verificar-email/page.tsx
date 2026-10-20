import { Suspense } from "react";
import { EmailVerificationScreen } from "@/features/authentication/components/EmailVerificationScreen";

export default function VerifyEmailPage() {
  return <main className="container mx-auto px-4 py-10"><Suspense fallback={<p role="status">Carregando verificação...</p>}><EmailVerificationScreen /></Suspense></main>;
}
