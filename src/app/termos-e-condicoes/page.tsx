import { siteSearchResultTypeMeta } from "@tudomacae/site-search/search";
import type { Metadata } from "next";
import content from "../../../packages/terms-page/terms-and-conditions.md?raw";
import { cacheLife } from "next/cache";
import MarkdownRenderer from "@/components/ui/MarkdownRenderer";
import TermsPageFrame from "@tudomacae/terms-page/page-frame";

export const metadata: Metadata = {
  other: siteSearchResultTypeMeta("page"),
  title: "Termos e Condições - Tudo Macaé",
  description: "Termos e condições de uso do Tudo Macaé.",
};

const TermsPage = async () => {
  "use cache";
  cacheLife("max");

  return (
    <main>
      <TermsPageFrame>
        <MarkdownRenderer content={content} />
      </TermsPageFrame>
    </main>
  );
};

export default TermsPage;
