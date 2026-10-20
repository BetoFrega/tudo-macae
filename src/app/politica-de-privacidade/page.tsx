import { siteSearchResultTypeMeta } from "@tudomacae/site-search/search";
import type { Metadata } from "next";
import content from "@/content/privacy-policy.md?raw";
import { cacheLife } from "next/cache";
import MarkdownRenderer from "@/components/ui/MarkdownRenderer";

export const metadata: Metadata = {
  other: siteSearchResultTypeMeta("page"),
  title: "Política de Privacidade - Tudo Macaé",
  description: "Política de privacidade do Tudo Macaé.",
};

const PrivacyPolicyPage = async () => {
  "use cache";
  cacheLife("max");

  return (
    <main className="container mx-auto max-w-2xl px-4 py-8">
      <MarkdownRenderer content={content} />
    </main>
  );
};

export default PrivacyPolicyPage;
