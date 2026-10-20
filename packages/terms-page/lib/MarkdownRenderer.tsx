import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isExternalWebLink } from "./externalWebLink";

interface MarkdownRendererProps {
  content: string;
  externalLinksInNewTab?: boolean;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, externalLinksInNewTab = false }) => {
  return (
    <div className={`
      prose max-w-none min-w-0 prose-slate
      dark:prose-invert
    `}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const external = externalLinksInNewTab && isExternalWebLink(href ?? "");
            return <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>{children}</a>;
          },
          table: ({ children }) => (
            <div className="overflow-x-auto" role="region" aria-label="Tabela" tabIndex={0}>
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
