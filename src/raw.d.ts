// Vite and Turbopack inline `?raw` imports as strings (`next.config.ts`).
declare module "*.md?raw" {
  const content: string;
  export default content;
}
