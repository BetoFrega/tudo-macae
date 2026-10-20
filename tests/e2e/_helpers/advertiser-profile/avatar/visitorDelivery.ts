import { createHash } from "node:crypto";
import type { Browser, Page } from "@playwright/test";
import sharp from "sharp";
import { expect, test } from "../../fixtures";
import {
  captureAvatarSurface,
  inspectAvatar,
  isAvatarVariant,
  type AvatarDeliveryEvidence,
  type AvatarJourneyPhaseDiagnostic,
  type AvatarVisualCapture,
  type OptimizedImageResponses,
} from "./avatarEvidence";

export interface AvatarVisitorContext {
  context: Awaited<ReturnType<Browser["newContext"]>>;
  page: Page;
  requests: Set<string>;
  optimizedImageResponses: OptimizedImageResponses;
  dpr: number;
}

export interface AvatarDeliveryJourney {
  phaseDiagnostic: AvatarJourneyPhaseDiagnostic;
  evidence: AvatarDeliveryEvidence[];
  visualCaptures: AvatarVisualCapture[];
  visitorContexts: AvatarVisitorContext[];
}

export interface AvatarConsumerPaths {
  catalogPath: string;
  activityAreaPath: string;
  publicBusinessPath: string;
  publicAdPath: string;
}

export async function inspectAvatarConsumersAtDpr(
  { browser, page, dpr, profileName, paths, journey }: {
    browser: Browser;
    page: Page;
    dpr: number;
    profileName: string;
    paths: AvatarConsumerPaths;
    journey: AvatarDeliveryJourney;
  },
): Promise<void> {
  const { catalogPath, activityAreaPath, publicBusinessPath, publicAdPath } = paths;
  const { phaseDiagnostic, evidence, visualCaptures, visitorContexts } = journey;
  phaseDiagnostic.phase = `create-visitor-context-dpr${dpr}`;
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin, deviceScaleFactor: dpr });
  const visitor = await context.newPage();
  const requests = new Set<string>();
  const optimizedImageResponses: OptimizedImageResponses = new Map();
  visitor.on("request", (request) => {
    if (isAvatarVariant(new URL(request.url()))) requests.add(request.url());
  });
  visitor.on("response", (response) => {
    if (!isAvatarVariant(new URL(response.url()))) return;
    optimizedImageResponses.set(response.url(), response.body().then(async (body) => {
      const decoded = await sharp(body).raw().toBuffer({ resolveWithObject: true });
      return {
        status: response.status(),
        contentType: response.headers()["content-type"] ?? null,
        bytes: body.byteLength,
        sha256: createHash("sha256").update(body).digest("hex"),
        decodedWidth: decoded.info.width,
        decodedHeight: decoded.info.height,
      };
    }).catch(() => null));
  });
  visitorContexts.push({ context, page: visitor, requests, optimizedImageResponses, dpr });

  const consumers = [
    { name: "catalog-business-card", path: catalogPath, route: "/negocios?categoria=:categoryId&subcategoria=:subcategoryId" },
    { name: "subcategory-activity-area", path: activityAreaPath, route: "/categoria/:categoryId/:categorySlug/:subcategoryId/:subcategorySlug" },
    { name: "public-business-page", path: publicBusinessPath, route: "/negocio/:profileId/:slug" },
    { name: "ad-business-aside", path: publicAdPath, route: "/anuncio/:adId/:slug" },
  ] as const;
  const byConsumer = new Map<string, AvatarDeliveryEvidence>();
  for (const consumer of consumers) {
    await test.step(`${consumer.name} DPR ${dpr}`, async () => {
      phaseDiagnostic.phase = `navigate-${consumer.name}-dpr${dpr}`;
      await visitor.goto(consumer.path);
      phaseDiagnostic.phase = `inspect-${consumer.name}-dpr${dpr}`;
      const result = await inspectAvatar(visitor, profileName, dpr, consumer.name, optimizedImageResponses);
      byConsumer.set(consumer.name, result);
      evidence.push(result);
      phaseDiagnostic.phase = `assert-delivery-${consumer.name}-dpr${dpr}`;
      expect(requests.has(result.currentSrc), `${consumer.name} deve usar uma fonte de imagem observada na rede`).toBe(true);
      expect(result.optimizerStatus, `${consumer.name} deve receber a resposta do optimizer`).toBe(200);
      expect(result.optimizerContentType).toMatch(/^image\//);
      expect(result.optimizerBytes).toBeGreaterThan(0);
      expect(result.optimizerSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(result.optimizerDecodedWidth).toBeGreaterThan(0);
      expect(result.optimizerDecodedHeight).toBeGreaterThan(0);
      if (!process.env.CI) {
        phaseDiagnostic.phase = `capture-${consumer.name}-dpr${dpr}`;
        visualCaptures.push(await captureAvatarSurface(
          visitor,
          consumer.name,
          consumer.route,
          "optimized-image-loaded",
          dpr,
        ));
      }
    });
  }

  phaseDiagnostic.phase = `assert-cache-reuse-dpr${dpr}`;
  const catalogSource = byConsumer.get("catalog-business-card")?.currentSrc;
  const adSource = byConsumer.get("ad-business-aside")?.currentSrc;
  expect(adSource, "o cartão e o painel devem reutilizar a mesma variante responsiva quando o tamanho coincide").toBe(catalogSource);
  expect(byConsumer.get("catalog-business-card")?.transferSize, "o primeiro acesso em contexto novo deve buscar a imagem fria").toBeGreaterThan(0);
}

export async function inspectLegacyAdvertiserHeaders(
  { profileId, profileName, journey }: {
    profileId: string;
    profileName: string;
    journey: AvatarDeliveryJourney;
  },
): Promise<void> {
  const { evidence, visualCaptures, visitorContexts } = journey;
  for (const visitor of visitorContexts) {
    await visitor.page.goto(`/anunciante/${profileId}`);
    const result = await inspectAvatar(visitor.page, profileName, visitor.dpr, "legacy-advertiser-profile-header", visitor.optimizedImageResponses);
    evidence.push(result);
    expect(visitor.requests.has(result.currentSrc), "o perfil legacy deve usar fonte de imagem observada na rede").toBe(true);
    expect(result.optimizerStatus).toBe(200);
    expect(result.optimizerContentType).toMatch(/^image\//);
    expect(result.optimizerBytes).toBeGreaterThan(0);
    expect(result.optimizerSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.optimizerDecodedWidth).toBeGreaterThan(0);
    expect(result.optimizerDecodedHeight).toBeGreaterThan(0);
    if (!process.env.CI) {
      visualCaptures.push(await captureAvatarSurface(
        visitor.page,
        "legacy-advertiser-profile-header",
        "/anunciante/:profileId",
        "optimized-image-loaded",
        visitor.dpr,
      ));
    }
  }
}

function catalogCardVariant(evidence: AvatarDeliveryEvidence[], dpr: number): AvatarDeliveryEvidence {
  const variant = evidence.find(item => item.consumer === "catalog-business-card" && item.dpr === dpr);
  expect(variant).toBeDefined();
  if (!variant) throw new Error(`Missing catalog-business-card evidence at DPR ${dpr}`);
  return variant;
}

function variantDeliverySummary({ consumer, dpr, optimizerWidth, optimizerStatus, optimizerContentType, optimizerBytes, optimizerSha256, optimizerDecodedWidth, optimizerDecodedHeight, naturalWidth, complete, transferSize }: AvatarDeliveryEvidence) {
  return {
    consumer,
    dpr,
    sourceKind: optimizerWidth === null ? "direct-source" : "next-optimizer",
    optimizerWidth,
    optimizerStatus,
    optimizerContentType,
    optimizerBytes,
    optimizerSha256,
    optimizerDecodedWidth,
    optimizerDecodedHeight,
    naturalWidth,
    complete,
    transferSize,
  };
}

export async function assertAndAttachVariantDelivery(
  { evidence, visualCaptures }: Pick<AvatarDeliveryJourney, "evidence" | "visualCaptures">,
): Promise<void> {
  const oneX = catalogCardVariant(evidence, 1);
  const twoX = catalogCardVariant(evidence, 2);
  expect(oneX.currentSrc).not.toBe(twoX.currentSrc);
  expect(oneX.optimizerWidth).toBeGreaterThan(0);
  expect(twoX.optimizerWidth).toBeGreaterThan(0);
  expect(oneX.optimizerWidth).not.toBe(twoX.optimizerWidth);
  expect(oneX.optimizerSha256).toBeTruthy();
  expect(twoX.optimizerSha256).toBeTruthy();
  expect(oneX.optimizerSha256).not.toBe(twoX.optimizerSha256);
  expect(oneX.optimizerDecodedWidth).toBeGreaterThan(0);
  expect(twoX.optimizerDecodedWidth).toBeGreaterThan(0);
  expect(oneX.optimizerDecodedWidth).not.toBe(twoX.optimizerDecodedWidth);
  await test.info().attach("avatar-variant-delivery.json", {
    body: JSON.stringify(evidence.map(variantDeliverySummary), null, 2),
    contentType: "application/json",
  });
  if (!process.env.CI) {
    await test.info().attach("avatar-visual-captures.json", {
      body: JSON.stringify(visualCaptures, null, 2),
      contentType: "application/json",
    });
  }
}
