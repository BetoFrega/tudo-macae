import type * as entry from "../search";

export async function run(module: typeof entry) {
  const search = module.createSiteSearch({
    siteOrigin: "https://www.tudomacae.com.br",
    provider: {
      search: async () => ({
        status: "ok",
        chunks: [{ key: "https://www.tudomacae.com.br/negocio/b1/padaria", title: "Padaria", text: "Pães" }],
      }),
    },
    now: () => 1,
    record: () => {},
  });
  await search.search("padaria");
}
