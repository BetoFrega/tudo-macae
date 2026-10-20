import type { Locator, Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";

export async function verifyPublicContentShareReflow(
  page: Page,
  sharing: Locator,
  heading: Locator,
  testInfo: TestInfo,
  captureName: "matter" | "ad",
  requireDocumentReflow: boolean,
) {
  const whatsapp = sharing.getByRole("link", {
    name: "Compartilhar no WhatsApp",
    exact: true,
  });
  const whatsappLabel = whatsapp.getByText("Compartilhar no WhatsApp", { exact: true });
  const initialControlFontSize = await whatsappLabel.evaluate(
    label => Number.parseFloat(getComputedStyle(label).fontSize),
  );
  const initialRootFontSize = await page.evaluate(
    () => getComputedStyle(document.documentElement).fontSize,
  );

  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect.poll(
    () => whatsappLabel.evaluate(label => Number.parseFloat(getComputedStyle(label).fontSize)),
  ).toBeCloseTo(initialControlFontSize * 2, 1);
  await expect.poll(
    () => sharing.evaluate(section => section.getAnimations({ subtree: true })
      .filter(animation => animation.playState === "running").length),
  ).toBe(0);

  try {
    await expect(heading).toBeVisible();
    await expect(whatsapp).toBeVisible();
    await expect(whatsapp).toHaveAccessibleName("Compartilhar no WhatsApp");
    await expect(whatsappLabel).toBeVisible();
    await expect(whatsappLabel).toHaveText("Compartilhar no WhatsApp");
    const layout = await sharing.evaluate((section) => {
      const link = section.querySelector<HTMLAnchorElement>("a[data-slot='button']")!;
      const label = link.querySelector<HTMLElement>("span")!;
      const bounds = link.getBoundingClientRect();
      const labelBounds = label.getBoundingClientRect();
      const labelTextRange = document.createRange();
      labelTextRange.selectNodeContents(label);
      const labelTextBounds = labelTextRange.getBoundingClientRect();
      const sectionBounds = section.getBoundingClientRect();
      const layoutOf = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          testId: element.getAttribute("data-testid"),
          rect: {
            left: Math.round(rect.left * 100) / 100,
            right: Math.round(rect.right * 100) / 100,
            width: Math.round(rect.width * 100) / 100,
          },
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        };
      };
      const relatedLayout = [layoutOf(link)];
      let ancestor: Element | null = link.parentElement;
      while (ancestor && relatedLayout.length < 6) {
        relatedLayout.push(layoutOf(ancestor));
        if (ancestor === section) break;
        ancestor = ancestor.parentElement;
      }
      const affectedControls = Array.from(section.querySelectorAll("a, button"))
        .filter((control) => {
          const rect = control.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map(layoutOf);
      const externalOverflowCandidates = Array.from(document.querySelectorAll("html, body, body *"))
        .filter((element) => {
          if (section.contains(element)) return false;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          if (rect.width <= 0 || rect.height <= 0 || style.display === "none"
            || style.visibility === "hidden" || style.opacity === "0") return false;
          return rect.left < -1 || rect.right > window.innerWidth + 1
            || element.scrollWidth > element.clientWidth + 1;
        })
        .map((element) => {
          const details = layoutOf(element);
          return {
            ...details,
            className: typeof element.className === "string" ? element.className.slice(0, 160) : "",
            overflow: Math.max(
              0,
              -details.rect.left,
              details.rect.right - window.innerWidth,
              details.scrollWidth - details.clientWidth,
            ),
          };
        })
        .sort((left, right) => right.overflow - left.overflow)
        .slice(0, 12);

      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        linkLeft: bounds.left,
        linkRight: bounds.right,
        sectionLeft: sectionBounds.left,
        sectionRight: sectionBounds.right,
        linkTop: bounds.top,
        linkBottom: bounds.bottom,
        linkHeight: bounds.height,
        linkClientHeight: link.clientHeight,
        linkScrollHeight: link.scrollHeight,
        linkClientWidth: link.clientWidth,
        linkScrollWidth: link.scrollWidth,
        labelTop: labelBounds.top,
        labelBottom: labelBounds.bottom,
        labelLeft: labelBounds.left,
        labelRight: labelBounds.right,
        labelClientHeight: label.clientHeight,
        labelScrollHeight: label.scrollHeight,
        labelClientWidth: label.clientWidth,
        labelScrollWidth: label.scrollWidth,
        shareLabelFontSize: getComputedStyle(label).fontSize,
        labelTextTop: labelTextBounds.top,
        labelTextBottom: labelTextBounds.bottom,
        labelTextLeft: labelTextBounds.left,
        labelTextRight: labelTextBounds.right,
        relatedLayout,
        affectedControls,
        externalOverflowCandidates,
      };
    });

    const diagnostic = `Public content share reflow geometry: ${JSON.stringify(layout)}`;
    if (!requireDocumentReflow) {
      await testInfo.attach("ad-document-overflow-geometry.json", {
        body: JSON.stringify({
          documentWidth: layout.documentWidth,
          viewportWidth: layout.viewportWidth,
          externalOverflowCandidates: layout.externalOverflowCandidates,
        }),
        contentType: "application/json",
      });
    }
    const backLink = page.getByRole("link", {
      name: captureName === "ad" ? "Voltar para classificados" : "Voltar ao início",
      exact: true,
    });
    await expect(backLink).toBeVisible();
    const backLinkLayout = await backLink.evaluate((link) => {
      const bounds = link.getBoundingClientRect();
      const textRange = document.createRange();
      textRange.selectNodeContents(link);
      const textBounds = textRange.getBoundingClientRect();
      const containerBounds = link.parentElement!.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        containerLeft: containerBounds.left,
        containerRight: containerBounds.right,
        clientWidth: link.clientWidth,
        scrollWidth: link.scrollWidth,
        textLeft: textBounds.left,
        textRight: textBounds.right,
      };
    });
    const backLinkDiagnostic = `Back link reflow geometry: ${JSON.stringify(backLinkLayout)}`;
    expect(backLinkLayout.left, backLinkDiagnostic).toBeGreaterThanOrEqual(backLinkLayout.containerLeft - 1);
    expect(backLinkLayout.right, backLinkDiagnostic).toBeLessThanOrEqual(backLinkLayout.containerRight + 1);
    expect(backLinkLayout.scrollWidth, backLinkDiagnostic).toBeLessThanOrEqual(backLinkLayout.clientWidth + 1);
    expect(backLinkLayout.textLeft, backLinkDiagnostic).toBeGreaterThanOrEqual(backLinkLayout.left - 1);
    expect(backLinkLayout.textRight, backLinkDiagnostic).toBeLessThanOrEqual(backLinkLayout.right + 1);
    expect(layout.linkLeft, diagnostic).toBeGreaterThanOrEqual(layout.sectionLeft - 1);
    expect(layout.linkRight, diagnostic).toBeLessThanOrEqual(layout.sectionRight + 1);
    expect(layout.linkHeight, diagnostic).toBeGreaterThanOrEqual(44);
    expect(layout.linkScrollHeight, diagnostic).toBeLessThanOrEqual(layout.linkClientHeight + 1);
    expect(layout.labelScrollHeight, diagnostic).toBeLessThanOrEqual(layout.labelClientHeight + 1);
    expect(layout.labelTextTop, diagnostic).toBeGreaterThanOrEqual(layout.linkTop - 1);
    expect(layout.labelTextBottom, diagnostic).toBeLessThanOrEqual(layout.linkBottom + 1);
    expect(layout.labelScrollWidth, diagnostic).toBeLessThanOrEqual(layout.labelClientWidth + 1);
    expect(layout.labelTextLeft, diagnostic).toBeGreaterThanOrEqual(layout.labelLeft - 1);
    expect(layout.labelTextRight, diagnostic).toBeLessThanOrEqual(layout.labelRight + 1);
    expect(layout.labelTextLeft, diagnostic).toBeGreaterThanOrEqual(layout.linkLeft - 1);
    expect(layout.labelTextRight, diagnostic).toBeLessThanOrEqual(layout.linkRight + 1);
    expect(layout.linkScrollWidth, diagnostic).toBeLessThanOrEqual(layout.linkClientWidth + 1);
    if (requireDocumentReflow) {
      expect(layout.documentWidth, diagnostic).toBeLessThanOrEqual(layout.viewportWidth);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`${captureName}-share-320-text-200.png`),
      fullPage: true,
    });

    await sharing.getByRole("button").first().focus();
    await page.keyboard.press("Shift+Tab");
    await expect(whatsapp).toBeFocused();
    await expect.poll(() => whatsapp.evaluate(link => getComputedStyle(link).boxShadow)).not.toBe("none");
  }
  finally {
    await page.evaluate(() => {
      document.documentElement.style.removeProperty("font-size");
    });
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  await expect.poll(
    () => whatsappLabel.evaluate(label => Number.parseFloat(getComputedStyle(label).fontSize)),
  ).toBeCloseTo(initialControlFontSize, 1);
  await expect.poll(
    () => sharing.evaluate(section => section.getAnimations({ subtree: true })
      .filter(animation => animation.playState === "running").length),
  ).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  const desktopLayout = await sharing.evaluate((section) => {
    const sectionBounds = section.getBoundingClientRect();
    const controls = Array.from(
      section.querySelectorAll<HTMLElement>("a[data-slot='button'], button[data-slot='button']"),
    );

    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      rootFontSize: getComputedStyle(document.documentElement).fontSize,
      shareLabelFontSize: getComputedStyle(
        section.querySelector<HTMLElement>("a[data-slot='button'] span")!,
      ).fontSize,
      section: {
        left: sectionBounds.left,
        right: sectionBounds.right,
        width: sectionBounds.width,
      },
      controls: controls.map((control) => {
        const bounds = control.getBoundingClientRect();
        const textRange = document.createRange();
        textRange.selectNodeContents(control);
        const textBounds = textRange.getBoundingClientRect();
        const style = getComputedStyle(control);

        return {
          tag: control.tagName.toLowerCase(),
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height,
          clientWidth: control.clientWidth,
          scrollWidth: control.scrollWidth,
          clientHeight: control.clientHeight,
          scrollHeight: control.scrollHeight,
          textLeft: textBounds.left,
          textRight: textBounds.right,
          textTop: textBounds.top,
          textBottom: textBounds.bottom,
          fontSize: style.fontSize,
        };
      }),
    };
  });
  await testInfo.attach("public-share-desktop-geometry.json", {
    body: JSON.stringify(desktopLayout),
    contentType: "application/json",
  });
  await page.screenshot({
    path: testInfo.outputPath(`${captureName}-share-1280.png`),
    fullPage: true,
  });

  expect(Number.isFinite(Number.parseFloat(desktopLayout.rootFontSize)), JSON.stringify(desktopLayout))
    .toBe(true);
  expect(desktopLayout.rootFontSize, JSON.stringify(desktopLayout)).toBe(initialRootFontSize);
  expect(Number.parseFloat(desktopLayout.shareLabelFontSize), JSON.stringify(desktopLayout))
    .toBeCloseTo(initialControlFontSize, 1);
  expect(desktopLayout.controls.length, JSON.stringify(desktopLayout)).toBeGreaterThan(0);
  for (const control of desktopLayout.controls) {
    expect(Number.isFinite(control.left), JSON.stringify(desktopLayout)).toBe(true);
    expect(Number.isFinite(control.right), JSON.stringify(desktopLayout)).toBe(true);
    expect(control.left, JSON.stringify(desktopLayout)).toBeGreaterThanOrEqual(desktopLayout.section.left - 1);
    expect(control.right, JSON.stringify(desktopLayout)).toBeLessThanOrEqual(desktopLayout.section.right + 1);
    expect(control.scrollWidth, JSON.stringify(desktopLayout)).toBeLessThanOrEqual(control.clientWidth + 1);
    expect(control.scrollHeight, JSON.stringify(desktopLayout)).toBeLessThanOrEqual(control.clientHeight + 1);
    expect(control.textLeft, JSON.stringify(desktopLayout)).toBeGreaterThanOrEqual(control.left - 1);
    expect(control.textRight, JSON.stringify(desktopLayout)).toBeLessThanOrEqual(control.right + 1);
    expect(control.textTop, JSON.stringify(desktopLayout)).toBeGreaterThanOrEqual(control.top - 1);
    expect(control.textBottom, JSON.stringify(desktopLayout)).toBeLessThanOrEqual(control.bottom + 1);
  }
}
