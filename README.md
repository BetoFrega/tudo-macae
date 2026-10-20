# Tudo Macaé

## 🌍 Business Context
Tudo Macaé is a hyper-local digital marketplace designed specifically for the community of Macaé, RJ. Our mission is to simplify local commerce by providing a free, accessible, and user-friendly platform where residents can buy, sell, and trade goods and services.

Unlike generic platforms, we focus on the specific needs of the Macaé region, fostering a trusted local economy.

### Key Features
- **Free Ad Posting**: Users can publish ads at no cost.
- **Local Focus**: Tailored categories for the Macaé market.
- **Simple & Fast**: Streamlined process to list items in seconds.

## 🛠 Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 + Shadcn UI
- **Backend/DB**: API Worker (Cloudflare D1, Better Auth)
- **Validation**: Zod + React Hook Form
- **Linting**: Biome

## 🌐 Production Delivery

For the deployment procedure, follow [Deploy to production](docs/agents/production-delivery.md).
For assisted execution, ask the agent to use the `deploy` skill, stating whether
you want to prepare a release or deploy it to production.

The app is live at **https://www.tudomacae.com.br** (the apex `tudomacae.com.br`
redirects to it — `www` is the canonical host). **Cloudflare faces the internet**
with authoritative DNS, proxy, TLS termination and bot detection. The edge Worker
forwards www to the web Worker and answers MCP with 404; Cloudflare and Next.js own the
independent caches.

Read [`docs/agents/production-topology.md`](docs/agents/production-topology.md) before
reasoning about caching, headers, crawling or redirects, and re-measure with:

```bash
npm run probe:edge
```

## 🚀 Getting Started

### Prerequisites
- Node.js 24 (pinned in `mise.toml`)

*Alternatively, open the repository in VS Code Dev Containers or GitHub Codespaces for an automated environment with Node.js and Playwright pre-configured.*

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the App
To start the development environment:

```bash
npm run dev
```

This command starts an in-memory API Worker fixture (accounts, Classifieds, Blog
and Media) and the app with hot reload at
[http://localhost:5002](http://localhost:5002).

The fixture is seeded on boot with a demo mass — categories, accounts and
advertiser profiles — so the app looks used from the first page. `npm run dev`
prints the sign-in credentials along with the URLs, and
[`src/packages/demo-seed/README.md`](src/packages/demo-seed/README.md) is where
they are written down. Nothing of this exists outside the local fixture.

That is the port of a normal clone. A **linked git worktree derives a port of
its own**, so two sessions can run at once; `npm run dev` prints that worktree's
URL before the app starts. See `docs/agents/test-harness-operation.md`.

Every other script — tests, lint, build check, mutation tiers — is listed by:

```bash
npm run help
```

---
*Built with ❤️ for Macaé.*
