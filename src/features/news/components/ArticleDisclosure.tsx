import styles from "./ArticleReading.module.css";

export function ArticleDisclosure({ media, assisted }: {
  media: ReadonlyArray<{ generated?: boolean }>;
  assisted?: boolean;
}) {
  const hasGeneratedMedia = media.some(item => item.generated === true);
  if (!assisted && !hasGeneratedMedia) return null;

  return (
    <section aria-label="Transparência editorial" className={styles.disclosure}>
      {assisted && <p>Produzida com assistência de IA e revisão humana.</p>}
      {hasGeneratedMedia && <p>Esta Matéria utiliza imagens geradas por IA.</p>}
    </section>
  );
}
