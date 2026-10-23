# Dependency override maintenance

The [0006 policy](../adr/0006-npm-overrides-for-transitive-advisories.md) owns the
architectural choice. This guide owns the operational removal conditions transferred
on 2026-10-04; `package.json` owns installed override values. Recheck the dated
advisory rationale before relying on it as current upstream state.

## Override entries and exit conditions

Verifique os overrides declarados e os ranges originais de todas as cópias no
lockfile. O range pedido pelo pai permanece no manifesto do lockfile, mesmo
quando o override muda a versão resolvida:

```sh
node <<'NODE'
const { overrides } = require('./package.json');
const { packages } = require('./package-lock.json');
const parents = {
  'typed-rest-client': ['qs'], nx: ['axios', 'brace-expansion', 'smol-toml'],
  satori: ['fflate'], '@tailwindcss/typography': ['postcss-selector-parser'],
  'micromark-extension-math': ['katex'],
};
console.log({ overrides });
for (const [name, children] of Object.entries(parents)) {
  const copies = Object.entries(packages).filter(([location]) =>
    location.split('node_modules/').at(-1) === name);
  if (!copies.length) console.log({ name, state: 'absent from lockfile' });
  for (const [location, pkg] of copies) console.log({ location, version: pkg.version,
    requested: Object.fromEntries(children.map(child => [child,
      pkg.dependencies?.[child] ?? pkg.optionalDependencies?.[child] ?? null])),
  });
}
NODE
```

Em 2026-10-04, esse comando confirmou que `nx` está ausente; esse override está
inativo no lockfile atual. Os demais pais ainda pedem
ranges anteriores às correções. A tabela conserva o racional de adoção, incluindo
as versões antigas; a presença do override não prova que ele continue necessário.
Para conferir os pais históricos ausentes, use o registro npm:

```sh
npm view nx@23.2.1 version dependencies.axios dependencies.brace-expansion dependencies.smol-toml
```

Esses manifestos históricos foram conferidos em 2026-10-04.

| Override                          | Alerta              | Racional de adoção                                             | Remover quando                                                                                       |
| --------------------------------- | ------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `typed-rest-client` → `qs@6.16.0` | GHSA-q8mj-m7cp-5q26, GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g | `typed-rest-client@2.3.1` pina `qs@6.15.1` | `typed-rest-client` aceitar `qs@>=6.16.0` e resolver uma versão sem advisories após remover o override |
| `nx` → `axios@1.20.0` | [Axios 1.20.0](#advisories-de-axios-1200) | `nx@23.2.1` pina `axios@1.18.1` | `nx` aceitar `axios@>=1.20.0` e resolver uma versão sem advisories após remover o override |
| `nx` → `brace-expansion@5.0.12` | GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p | `nx@23.2.1` pina `brace-expansion@5.0.9` | `nx` aceitar `brace-expansion@>=5.0.12` e resolver uma versão sem advisories após remover o override |
| `nx` → `smol-toml@1.7.1` | GHSA-7w5x-hrqm-74c2 | `nx@23.2.1` pina `smol-toml@1.6.1` | `nx` aceitar `smol-toml@>=1.7.1` e resolver uma versão sem advisories após remover o override |
| `satori` → `fflate@0.7.5` | GHSA-px8p-9vwx-vf98 | `satori@0.33.5` pina `fflate@0.7.3` | `satori` aceitar `fflate@>=0.7.5` e resolver uma versão sem advisories após remover o override |
| `@tailwindcss/typography` → `postcss-selector-parser@7.1.7` | GHSA-rj75-hqrm-r3gf | `@tailwindcss/typography@0.5.20` pina `postcss-selector-parser@6.0.10` | `@tailwindcss/typography` aceitar `postcss-selector-parser@>=7.1.6` e resolver uma versão sem advisories após remover o override |
| `micromark-extension-math` → `katex@0.19.0` | GHSA-238p-pmpm-9mq7 | `micromark-extension-math@3.1.0` pede `katex@^0.16.0` | `micromark-extension-math` aceitar `katex@>=0.18.2` e resolver uma versão sem advisories após remover o override |

### Advisories de Axios 1.20.0

GHSA-vh66-26gq-q6x8, GHSA-9fr6-4gfg-395g, GHSA-c29m-xwm3-cm6r,
GHSA-mghh-pgcx-3jjj, GHSA-x97p-jq2g-jp4f, GHSA-3pq3-5fj3-cg6v,
GHSA-542g-h47m-68v8, GHSA-j8rh-479h-cp32, GHSA-4hqw-qxg8-jxx2,
GHSA-m8m8-qj5v-23w3, GHSA-44g4-m2mj-wpvx, GHSA-r4gj-5m52-g5wh.

### Compatibilidade dos consumidores

Os consumidores de `qs` com ranges compatíveis resolvem pelo lockfile, sem
override. `express@4.22.3` e `body-parser@1.20.8` aceitam `qs@~6.16.0`;
confira os ranges com `npm view express@4.22.3 dependencies.qs` e
`npm view body-parser@1.20.8 dependencies.qs`. O override de `satori` preserva
os outros consumidores de `fflate`.

Os dois overrides de major cruzado usam só APIs que sobreviveram ao bump, conferido
em 2026-10-23: `@tailwindcss/typography` chama `astSync`, `selector()` e `remove()`
(`grep -n "parser" node_modules/@tailwindcss/typography/src/utils.js`), e
`micromark-extension-math` chama `katex.renderToString`
(`grep -n katex node_modules/micromark-extension-math/lib/html.js`).
