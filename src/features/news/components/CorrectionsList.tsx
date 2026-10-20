import { formatSaoPauloDateTime } from "@tudomacae/civil-time";
import type { Article } from "@/packages/editorial/articleCatalog";

/**
 * Every Retificação an article carries, in the order they were registered.
 * Renders nothing for an article that was never corrected — the section only
 * exists once there is something to say.
 */
export function CorrectionsList({
  corrections,
}: {
  corrections: Article["corrections"];
}) {
  if (corrections.length === 0) return null;

  return (
    <section className="border-t pt-4" data-testid="news-article-corrections">
      <h2 className="text-sm font-semibold">Retificações</h2>
      <ul className="mt-1 space-y-2 text-sm text-muted-foreground">
        {corrections.map((correction, index) => (
          <li key={index} data-testid="news-article-correction">
            <span className="font-medium">
              {formatSaoPauloDateTime(correction.correctedAt)}
            </span>
            {": "}
            {correction.summary}
          </li>
        ))}
      </ul>
    </section>
  );
}
