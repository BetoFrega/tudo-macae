import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { click } from "../_helpers/click";
import { expect, test } from "../_helpers/fixtures";

const bannerName = "Guia de locais de votação";
const linkName = "Eleições 2026 · Locais de votação em Macaé · Ver mapa e endereços";

test("guia eleitoral aparece antes do cabeçalho nas rotas públicas e de login", async ({ page, categoryFixture, header }) => {
  for (const route of ["/", "/negocios", `/categoria/${categoryFixture.category.id}/${categoryFixture.category.slug}`]) {
    await page.goto(route);
    const banner = pageObject(page).getByRole("region", { name: bannerName, exact: true });
    await expect(banner).toBeVisible();
    await expect(banner.getByRole("link", { name: linkName, exact: true }))
      .toHaveAttribute("href", "https://comochegar.eleicoes2026.tudomacae.com.br/");
    const bannerBox = await banner.boundingBox();
    const headerBox = await pageObject(page).getByRole("banner").boundingBox();
    expect(bannerBox!.y + bannerBox!.height).toBeLessThanOrEqual(headerBox!.y);
  }
  await page.goto("/");
  await page.screenshot({ path: "test-results/election-banner-desktop.png" });
  await header.clickLogin();
  await expect(pageObject(page).getByRole("dialog", { name: "Entre na sua conta", exact: true })).toBeVisible();
  await click(pageObject(page).getByRole("button", { name: "Fechar", exact: true }));
  await expect(pageObject(page).getByRole("region", { name: bannerName, exact: true })).toBeVisible();
});

// These checks need real layout and keyboard focus; jsdom cannot prove them.
test("guia eleitoral mantém leitura, foco e reflow em 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const banner = pageObject(page).getByRole("region", { name: bannerName, exact: true });
  const link = banner.getByRole("link", { name: linkName, exact: true });
  await expect(link).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  expect(await link.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
  expect(await link.evaluate(element => parseFloat(getComputedStyle(element).outlineWidth))).toBeGreaterThanOrEqual(2);
  const contrast = await link.evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d")!;
    const background = getComputedStyle(element.parentElement!).backgroundColor;
    const outline = getComputedStyle(element).outlineColor;
    function luminance(color: string) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = background;
      context.fillRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const pixel = context.getImageData(0, 0, 1, 1).data;
      const channels = [pixel[0], pixel[1], pixel[2]].map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    }
    const backgroundLuminance = luminance(background);
    const outlineLuminance = luminance(outline);
    return (Math.max(backgroundLuminance, outlineLuminance) + 0.05)
      / (Math.min(backgroundLuminance, outlineLuminance) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(3);
  const box = await link.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(24);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(await banner.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/election-banner-mobile320.png" });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(link).toBeVisible();
  expect(await banner.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await link.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});
