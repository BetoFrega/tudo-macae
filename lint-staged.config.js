/**
 * @type {import('lint-staged').Configuration}
 */
const config = {
  "**/*.{js,jsx,ts,tsx,json,jsonc,md,yml,yaml,css}": ["eslint --fix"],
};

export default config;
