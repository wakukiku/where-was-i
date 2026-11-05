import { expect, test, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";

async function addManual(
  page: Page,
  title: string,
  type: "Игра" | "Сериал" | "Книга",
  localCover = false,
) {
  await page
    .getByRole("button", { name: /Добавить/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: type }).check({ force: true });
  await dialog.getByLabel("Название").fill(title);
  if (localCover) {
    await dialog.getByText("Обложка", { exact: true }).click();
    await dialog
      .locator("input[type=file]")
      .setInputFiles("public/favicon.svg");
  }
  await dialog.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(page).toHaveURL(/#\/work\//);
  const pointDialog = page.getByRole("dialog");
  if (await pointDialog.getByText("Новая точка").isVisible())
    await pointDialog.getByRole("button", { name: "Отмена" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

async function addFromSearch(
  page: Page,
  query: string,
  type: "Игра" | "Сериал" | "Книга",
  expectedTitle: string,
) {
  await page
    .getByRole("button", { name: /Добавить/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: type }).check({ force: true });
  await dialog.getByLabel("Название").fill(query);
  await dialog
    .getByRole("button", { name: new RegExp(expectedTitle, "i") })
    .click();
  await dialog.getByRole("button", { name: "Добавить", exact: true }).click();
  const pointDialog = page.getByRole("dialog");
  await pointDialog.getByRole("button", { name: "Отмена" }).click();
  await expect(
    page.getByRole("heading", { name: expectedTitle }),
  ).toBeVisible();
  await expect(page.locator(".cover img")).toBeVisible();
}

async function createPoint(page: Page, stoppedAt: string, next: string) {
  await page.getByRole("button", { name: "Новая точка" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Где остановился? *").fill(stoppedAt);
  await dialog.getByLabel("Что дальше? *").fill(next);
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/");
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("where-was-i");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stores = [...database.objectStoreNames];
    if (stores.length)
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(stores, "readwrite");
        stores.forEach((name) => transaction.objectStore(name).clear());
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    database.close();
  });
  await page.reload();
});

test("full local lifecycle, points, remember, statuses and filters", async ({
  page,
}) => {
  await addManual(page, "Release Game", "Игра");
  await expect(page.getByText("Точек памяти пока нет")).toBeVisible();
  await page.getByRole("button", { name: "Новая точка" }).click();
  const firstDialog = page.getByRole("dialog");
  await firstDialog.getByLabel("Где остановился? *").fill("Первая точка");
  await firstDialog.getByLabel("Что дальше? *").fill("Первый шаг");
  await firstDialog.getByRole("slider").fill("42");
  await firstDialog.getByLabel("Часы").fill("10");
  await firstDialog.getByRole("button", { name: "Сохранить" }).click();

  await page.getByRole("button", { name: "Новая точка" }).click();
  const secondDialog = page.getByRole("dialog");
  await expect(secondDialog.getByLabel("Где остановился? *")).toHaveValue("");
  await expect(secondDialog.getByLabel("Что дальше? *")).toHaveValue("");
  await expect(secondDialog.getByRole("slider")).toHaveValue("42");
  await expect(secondDialog.getByLabel("Часы")).toHaveValue("10");
  await secondDialog.getByLabel("Где остановился? *").fill("Вторая точка");
  await secondDialog.getByLabel("Что дальше? *").fill("Второй шаг");
  await secondDialog.getByRole("slider").fill("55");
  await secondDialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Вторая точка").first()).toBeVisible();

  const newestPoint = page.locator(".history-card").first();
  await newestPoint.getByRole("button", { name: "Действия с точкой" }).click();
  await page.getByText("Редактировать", { exact: true }).click();
  const editPointDialog = page.getByRole("dialog");
  await editPointDialog
    .getByLabel("Где остановился? *")
    .fill("Вторая точка — исправлено");
  await editPointDialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(
    page.getByText("Вторая точка — исправлено").first(),
  ).toBeVisible();
  const olderPoint = page.locator(".history-card").nth(1);
  await olderPoint.getByRole("button", { name: "Действия с точкой" }).click();
  await page.getByText("Удалить", { exact: true }).click();
  const deletePointDialog = page.getByRole("dialog");
  await deletePointDialog
    .getByRole("button", { name: "Удалить", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Первая точка" })).toHaveCount(
    0,
  );

  await page.getByRole("button", { name: "Вспомнить" }).first().click();
  await expect(page.getByText("Вторая точка — исправлено")).toBeVisible();
  await page.getByRole("button", { name: "Вспомнил" }).click();
  await expect(page.getByText("Готово — возвращение отмечено.")).toBeVisible();
  await page.getByRole("button", { name: "Отменить отметку" }).click();
  await expect(page.getByRole("button", { name: "Вспомнил" })).toBeVisible();
  await page.getByRole("button", { name: "Вспомнил" }).click();
  await page.getByRole("button", { name: "К произведению" }).click();
  await expect(page.getByText(/Возвращались сегодня/)).toBeVisible();

  await page.getByRole("button", { name: "Закрепить" }).click();
  await page.getByRole("button", { name: "Where Was I?" }).click();
  await expect(
    page.getByRole("heading", { name: "Release Game" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Библиотека/ }).click();
  await page.getByLabel("Поиск в библиотеке").fill("Release");
  await expect(
    page.getByRole("heading", { name: "Release Game" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Книги" }).click();
  await expect(page.getByText("Ничего не найдено")).toBeVisible();
  await page.getByRole("tab", { name: "Все" }).click();
  await page.getByLabel("Поиск в библиотеке").fill("");
  await expect(
    page.getByRole("heading", { name: "Release Game" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Открыть Release Game" }).click();
  await page.getByRole("button", { name: "Действия с произведением" }).click();
  await page.getByText("Завершить", { exact: true }).click();
  await expect(page.getByText("Завершено", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Библиотека/ }).click();
  await page.getByRole("button", { name: "Завершённые" }).click();
  await page.getByRole("button", { name: "Открыть Release Game" }).click();
  await page.getByRole("button", { name: "Действия с произведением" }).click();
  await page.getByText("Вернуть в активные", { exact: true }).click();
  await page.getByRole("button", { name: "Действия с произведением" }).click();
  await page.getByText("В архив", { exact: true }).click();
  await expect(page.getByText("Архив", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Библиотека/ }).click();
  await page.getByRole("button", { name: "Архив" }).click();
  await page.getByRole("button", { name: "Открыть Release Game" }).click();
  await page.getByRole("button", { name: "Действия с произведением" }).click();
  await page.getByText("Вернуть в активные", { exact: true }).click();
  await page.getByRole("button", { name: "Действия с произведением" }).click();
  await page.getByText("Удалить", { exact: true }).click();
  const deleteWorkDialog = page.getByRole("dialog");
  await deleteWorkDialog
    .getByRole("button", { name: "Удалить", exact: true })
    .click();
  await expect(page.getByText("Ничего не найдено")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Release Game" })).toHaveCount(
    0,
  );
});

test("search selection adds every category with automatic covers", async ({
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "Поиск проверяется один раз; мобильная геометрия покрыта локальными сценариями.",
  );
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  await page.route(/^https:\/\//, async (route) => {
    const url = route.request().url();
    const headers = { "access-control-allow-origin": "*" };
    if (url.includes("images.test") || url.includes("covers.openlibrary.org"))
      return route.fulfill({
        contentType: "image/svg+xml",
        headers,
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="96"><rect width="64" height="96" fill="#b8ff3d"/></svg>',
      });
    if (url.includes("/w/rest.php/v1/search/page"))
      return route.fulfill({
        headers,
        json: {
          pages: [
            {
              id: 1,
              key: "Dota_2",
              title: "Dota 2",
              description: "multiplayer online battle arena video game",
              thumbnail: { url: "https://images.test/dota.svg" },
            },
          ],
        },
      });
    if (url.includes("api.tvmaze.com/search/shows"))
      return route.fulfill({
        headers,
        json: [
          {
            score: 1,
            show: {
              id: 2,
              name: "Breaking Bad",
              premiered: "2008-01-20",
              image: { medium: "https://images.test/breaking.svg" },
              url: "https://www.tvmaze.com/shows/169/breaking-bad",
            },
          },
        ],
      });
    if (url.includes("openlibrary.org/search.json"))
      return route.fulfill({
        headers,
        json: {
          docs: [
            {
              key: "/works/OL893415W",
              title: "Dune",
              author_name: ["Frank Herbert"],
              first_publish_year: 1965,
              cover_i: 1,
            },
          ],
        },
      });
    if (url.includes("wbsearchentities"))
      return route.fulfill({ headers, json: { search: [] } });
    if (url.includes("wbgetentities"))
      return route.fulfill({ headers, json: { entities: {} } });
    if (url.includes("w/api.php"))
      return route.fulfill({ headers, json: { query: { pages: {} } } });
    return route.abort();
  });
  await page.goto("http://127.0.0.1:4173");

  await addFromSearch(page, "Dota 2", "Игра", "Dota 2");
  await page.getByRole("button", { name: "Where Was I?" }).click();
  await addFromSearch(page, "Breaking Bad", "Сериал", "Breaking Bad");
  await page.getByRole("button", { name: "Where Was I?" }).click();
  await addFromSearch(page, "Dune", "Книга", "Dune");
  await context.close();
});

test("backup round-trip, theme, responsive layout and offline reload", async ({
  page,
  context,
}, testInfo) => {
  await addManual(page, "Offline Book", "Книга", true);
  await createPoint(page, "Страница 25", "Читать дальше");
  await page.getByRole("button", { name: /Настройки/ }).click();
  await page.getByText("Тёмная", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Тёмная" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-wak-theme", "dark");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспортировать" }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();

  await page.getByRole("button", { name: /Библиотека/ }).click();
  await page.getByRole("button", { name: "Открыть Offline Book" }).click();
  await page.getByRole("button", { name: "Действия с произведением" }).click();
  await page.getByText("Редактировать", { exact: true }).click();
  const editDialog = page.getByRole("dialog");
  await editDialog.getByLabel("Название").fill("Changed Book");
  await editDialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(
    page.getByRole("heading", { name: "Changed Book" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Настройки/ }).click();
  await page.locator("input[type=file]").setInputFiles(backupPath!);
  const importDialog = page.getByRole("dialog");
  await expect(importDialog.getByText("1 произведений")).toBeVisible();
  await importDialog
    .getByRole("button", { name: "Заменить библиотеку" })
    .click();
  await page.getByRole("button", { name: /Библиотека/ }).click();
  await expect(
    page.getByRole("heading", { name: "Offline Book" }),
  ).toBeVisible();
  await expect(page.locator(".cover img")).toBeVisible();

  await page.getByRole("button", { name: /Настройки/ }).click();
  const importInput = page.locator("input[type=file]");
  await importInput.setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{broken"),
  });
  await expect(
    page.getByText("Файл не подходит", { exact: true }),
  ).toBeVisible();
  await importInput.setInputFiles({
    name: "future.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "where-was-i",
        version: 99,
        exportedAt: new Date().toISOString(),
        works: [],
        points: [],
      }),
    ),
  });
  await expect(
    page.getByText("Версия или структура резервной копии не поддерживается."),
  ).toBeVisible();
  await page.getByRole("button", { name: /Библиотека/ }).click();
  await expect(
    page.getByRole("heading", { name: "Offline Book" }),
  ).toBeVisible();

  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  const manifest = (await (
    await page.request.get("/manifest.webmanifest")
  ).json()) as { name: string; display: string; icons: unknown[] };
  expect(manifest).toMatchObject({
    name: "Where Was I?",
    display: "standalone",
  });
  expect(manifest.icons.length).toBeGreaterThan(0);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  expect(
    await page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
  ).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Библиотека" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Offline Book" }),
  ).toBeVisible();
  await context.setOffline(false);
  testInfo.annotations.push({
    type: "viewport",
    description: `${testInfo.project.name}: ${await page.evaluate(() => `${innerWidth}x${innerHeight}`)}`,
  });
});
