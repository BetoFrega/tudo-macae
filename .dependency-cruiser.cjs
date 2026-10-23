// @ts-check
// Deep-module enforcement for dependency-cruiser.
//
// Each package under the packages root is a deep module: a lot of behaviour
// behind a small interface. A package's public surface is its entry points —
// the files at the package root. Implementation lives in subfolders and is
// private. Prefer several small entry points over one giant barrel.

// The legacy modules stay protected until their workspace extraction.
const R = "(?:src/packages|packages)";
const PACKAGE_INTERNALS = `^${R}/[^/]+/[^/]+/`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "entrypoint-boundary-from-app",
      comment:
        "Code outside a package may import its entry points, but not its internals.",
      severity: "error",
      from: { pathNot: `^${R}/` },
      to: { path: PACKAGE_INTERNALS },
    },
    {
      name: "entrypoint-boundary-across-packages",
      comment:
        "Packages may reach other packages only through their entry points.",
      severity: "error",
      from: { path: `^((?:src/packages|packages)/[^/]+)/`, pathNot: `^${R}/[^/]+/tests/` },
      to: {
        path: PACKAGE_INTERNALS,
        pathNot: `^$1/`,
      },
    },
    {
      name: "tests-through-entrypoints",
      comment:
        "Tests exercise packages through entry points, never package internals.",
      severity: "error",
      from: { path: `^((?:src/packages|packages)/[^/]+)/tests/` },
      to: {
        path: PACKAGE_INTERNALS,
        pathNot: `^$1/tests/`,
      },
    },
    {
      name: "tests-folder-is-private",
      comment: "Only tests may import files from a package tests folder.",
      severity: "error",
      from: { pathNot: `^${R}/[^/]+/tests/` },
      to: { path: `^${R}/[^/]+/tests/` },
    },
    {
      name: "workspace-package-to-app",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^(?:apps/|src/(?!packages/))" },
    },
    {
      name: "app-to-app",
      severity: "error",
      from: { path: "^(apps/[^/]+)/" },
      to: { path: "^apps/", pathNot: "^$1/" },
    },
    {
      name: "workspace-app-to-legacy-app",
      severity: "error",
      from: { path: "^apps/" },
      to: { path: "^src/(?!packages/)" },
    },
    {
      name: "workspace-dependencies-declared",
      severity: "error",
      from: { path: "^(?:packages|apps)/" },
      to: { dependencyTypes: ["npm-no-pkg", "npm-unknown"] },
    },
    {
      name: "portable-react-without-next",
      severity: "error",
      from: { path: "^packages/(?:react-primitives|site-layout|site-search|authentication|media|advertiser-identity|categories|editorial-access|editorial-sourcing|editorial-planning)/" },
      to: { path: "^(?:next(?:/|$)|node_modules/next/)" },
    },
    {
      name: "foundations-without-react-or-next",
      severity: "error",
      from: { path: "^packages/design-foundations/" },
      to: { path: "^(?:(?:react|react-dom|next)(?:/|$)|node_modules/(?:react|react-dom|next)/)" },
    },
    {
      name: "no-circular",
      comment: "Dependency cycles are forbidden.",
      severity: "error",
      from: {},
      to: { circular: true },
    },

    // Layering controls which packages may depend on which. Add project rules
    // here when the package topology makes those constraints concrete.
  ],
  options: {
    exclude: { path: "(?:^|/)(?:dist|\\.wrangler|\\.turbo|\\.next)/" },
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    },
  },
};
