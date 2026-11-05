import { expect, test } from "@playwright/test";

async function clearLibrary(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("where-was-i");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  });
  await page.reload();
}

async function hasStoredCover(page: import("@playwright/test").Page) {
  return page.evaluate(
    async () =>
      await new Promise<boolean>((resolve, reject) => {
        const request = indexedDB.open("where-was-i");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("works", "readonly");
          const all = transaction.objectStore("works").getAll();
          all.onsuccess = () => {
            resolve(Boolean(all.result[0]?.coverBlob));
            database.close();
          };
          all.onerror = () => reject(all.error);
        };
      }),
  );
}

test("slow cover never blocks creation and is persisted in the background", async ({
  page,
}) => {
  let coverRequests = 0;
  await page.route("https://slow.test/cover.svg", async (route) => {
    coverRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=3600",
      },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="90" height="130"><rect width="90" height="130" fill="#b8ff3d"/></svg>',
    });
  });
  await page.goto("/");
  await clearLibrary(page);
  await page
    .getByRole("button", { name: /Добавить/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Название").fill("Slow Cover Test");
  await dialog.getByText("Обложка", { exact: true }).click();
  await dialog
    .getByLabel("URL изображения")
    .fill("https://slow.test/cover.svg");
  const started = Date.now();
  await dialog.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(page).toHaveURL(/#\/work\//, { timeout: 1_500 });
  const addMs = Date.now() - started;
  console.info(JSON.stringify({ scenario: "delayed-cover-add", addMs }));
  expect(addMs).toBeLessThan(1_500);
  const pointDialog = page.getByRole("dialog");
  await pointDialog.getByRole("button", { name: "Отмена" }).click();
  await expect(page.locator(".cover img")).toBeVisible({ timeout: 7_000 });
  await expect.poll(() => hasStoredCover(page), { timeout: 7_000 }).toBe(true);
  expect(coverRequests).toBeLessThanOrEqual(2);
});

test("Wak Pixel logo remains stable through repeated theme changes", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const brand = page.getByRole("button", { name: "Where Was I?" });
  const logo = brand.locator("span");
  await expect(brand).toBeVisible();
  const font = await logo.evaluate(
    (element) => getComputedStyle(element).fontFamily,
  );
  expect(font.toLowerCase()).toContain("wak");
  expect(await page.evaluate(() => document.fonts.status)).toBe("loaded");
  expect(
    await brand.evaluate((element) => getComputedStyle(element).filter),
  ).toBe("none");

  await page.getByRole("button", { name: /Настройки/ }).click();
  for (const theme of [
    "Светлая",
    "Тёмная",
    "Системная",
    "Светлая",
    "Тёмная",
  ] as const) {
    await page.getByText(theme, { exact: true }).click();
    await expect(page.getByRole("radio", { name: theme })).toBeChecked();
    await expect(brand).toBeVisible();
    expect(
      await brand.evaluate((element) => getComputedStyle(element).filter),
    ).toBe("none");
  }
  const brandBox = await brand.boundingBox();
  const dockBox = await page.locator(".dock-wrap").boundingBox();
  expect(brandBox).not.toBeNull();
  expect(dockBox).not.toBeNull();
  const separated =
    brandBox!.x + brandBox!.width <= dockBox!.x ||
    dockBox!.x + dockBox!.width <= brandBox!.x ||
    brandBox!.y + brandBox!.height <= dockBox!.y ||
    dockBox!.y + dockBox!.height <= brandBox!.y;
  expect(separated).toBe(true);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page
    .locator(".topbar")
    .screenshot({
      path: testInfo.outputPath(`topbar-${testInfo.project.name}-dark.png`),
    });

  await page.getByText("Светлая", { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-wak-theme", "light");
  await page
    .locator(".topbar")
    .screenshot({
      path: testInfo.outputPath(`topbar-${testInfo.project.name}-light.png`),
    });
});

test("live Money Heist cover is correct and survives reload", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    process.env.VITE_LIVE_BROWSER !== "1" || testInfo.project.name === "mobile",
    "Optional live external-catalog check.",
  );
  await page.goto("/");
  await clearLibrary(page);
  await page
    .getByRole("button", { name: /Добавить/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Сериал" }).check({ force: true });
  await dialog.getByLabel("Название").fill("Бумажный дом");
  const result = dialog
    .getByRole("button", { name: /La Casa de Papel/i })
    .first();
  await expect(result).toBeVisible({ timeout: 15_000 });
  await result.click();
  const started = Date.now();
  await dialog.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(page).toHaveURL(/#\/work\//, { timeout: 1_500 });
  const addMs = Date.now() - started;
  console.info(JSON.stringify({ scenario: "live-money-heist-add", addMs }));
  expect(addMs).toBeLessThan(1_500);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Отмена" })
    .click();
  await expect(
    page.getByRole("heading", { name: "La Casa de Papel" }),
  ).toBeVisible();
  await expect(page.locator(".cover img")).toBeVisible({ timeout: 12_000 });
  await expect.poll(() => hasStoredCover(page), { timeout: 12_000 }).toBe(true);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".cover img")).toBeVisible();
  await context.setOffline(false);
});
