export function ElectionLocationBanner() {
  return (
    <section
      aria-label="Guia de locais de votação"
      className="border-b border-primary/20 bg-primary text-primary-foreground"
    >
      <a
        href="https://comochegar.eleicoes2026.tudomacae.com.br/"
        className="
          container mx-auto block min-h-11 p-3 text-center text-sm/snug
          underline-offset-4
          hover:underline
          focus-visible:outline-2 focus-visible:-outline-offset-4
          focus-visible:outline-primary-foreground
        "
      >
        <span>Eleições 2026 · Locais de votação em Macaé</span>
        {" · "}
        <span className="font-semibold underline">Ver mapa e endereços</span>
      </a>
    </section>
  );
}
