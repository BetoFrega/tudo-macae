import type { Metadata } from "next";
import MarkdownRenderer from "@tudomacae/terms-page/renderer";
import TermsPageFrame from "@tudomacae/terms-page/page-frame";
import content from "@tudomacae/terms-page/terms-and-conditions.md?raw";

export const metadata: Metadata = {
  title: "Termos e Condições - Tudo Macaé",
  description: "Termos e condições de uso do Tudo Macaé.",
  alternates: { canonical: "/termos-e-condicoes" },
  other: { search_result_type: "page" },
};

export default function TermsPage() {
  return (
    <TermsPageFrame>
      <MarkdownRenderer content={content} />
    </TermsPageFrame>
  );
}
