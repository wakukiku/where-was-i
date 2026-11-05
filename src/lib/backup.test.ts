import { beforeEach, describe, expect, it, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { createBackup, restoreBackup, validateBackup } from "./backup";
import { db } from "./db";
import type { BackupV1, MemoryPoint, Work } from "../types";

const stamp = "2025-01-01T10:00:00.000Z";
const work: Work = {
  id: "w1",
  title: "Дюна",
  type: "book",
  status: "active",
  pinned: true,
  createdAt: stamp,
  updatedAt: stamp,
  lastPointAt: stamp,
};
const point: MemoryPoint = {
  id: "p1",
  workId: "w1",
  stoppedAt: "Глава 4",
  next: "Продолжить путь",
  happened: "Прибытие",
  remember: "Имена домов",
  progress: { chapter: "4", page: 123, totalPages: 640 },
  createdAt: stamp,
  updatedAt: stamp,
};

async function clearDatabase() {
  await db.transaction(
    "rw",
    db.works,
    db.points,
    db.settings,
    db.drafts,
    async () =>
      Promise.all([
        db.works.clear(),
        db.points.clear(),
        db.settings.clear(),
        db.drafts.clear(),
      ]),
  );
}

describe("backup validation and restoration", () => {
  beforeEach(clearDatabase);

  it("accepts a complete versioned backup", () => {
    const backup = validateBackup({
      format: "where-was-i",
      version: 1,
      exportedAt: stamp,
      works: [work],
      points: [point],
      settings: { id: "settings", theme: "system" },
    });
    expect(backup.works[0].title).toBe("Дюна");
    expect(backup.points[0].progress.page).toBe(123);
  });

  it("rejects incompatible, damaged and internally inconsistent backups", () => {
    expect(() =>
      validateBackup({ format: "other", version: 9, works: [], points: [] }),
    ).toThrow(/не поддерживается/);
    expect(() =>
      validateBackup({
        format: "where-was-i",
        version: 1,
        exportedAt: stamp,
        works: [{}],
        points: [],
      }),
    ).toThrow(/произведений/);
    expect(() =>
      validateBackup({
        format: "where-was-i",
        version: 1,
        exportedAt: stamp,
        works: [work],
        points: [{ ...point, workId: "missing" }],
        settings: { id: "settings", theme: "system" },
      }),
    ).toThrow(/точки/);
    expect(() =>
      validateBackup({
        format: "where-was-i",
        version: 1,
        exportedAt: stamp,
        works: [work],
        points: [],
        settings: { id: "settings", theme: "unknown" },
      }),
    ).toThrow(/настройки/);
  });

  it("round-trips works, points, dates, settings and a local cover", async () => {
    const coverBlob = new NodeBlob(["local-cover"], {
      type: "image/png",
    }) as Blob;
    await db.points.put(point);
    await db.settings.put({ id: "settings", theme: "dark" });
    const worksRead = vi
      .spyOn(db.works, "toArray")
      .mockResolvedValue([{ ...work, coverBlob }]);
    const backup = await createBackup();
    worksRead.mockRestore();
    expect(backup.works[0].coverDataUrl).toMatch(/^data:image\/png;base64,/);

    await db.works.put({ ...work, title: "Изменено", pinned: false });
    await db.points.clear();
    await db.settings.put({ id: "settings", theme: "light" });
    await restoreBackup(validateBackup(backup));

    const restoredWork = await db.works.get(work.id);
    expect(restoredWork).toMatchObject({
      title: "Дюна",
      pinned: true,
      createdAt: stamp,
      lastPointAt: stamp,
    });
    expect(restoredWork?.coverBlob).toBeDefined();
    expect(await db.points.get(point.id)).toEqual(point);
    expect(await db.settings.get("settings")).toEqual({
      id: "settings",
      theme: "dark",
    });
  });

  it("rolls back the complete replacement when a database write fails", async () => {
    await db.works.put({ ...work, title: "Существующие данные" });
    const invalidForDatabase = {
      format: "where-was-i",
      version: 1,
      exportedAt: stamp,
      works: [work],
      points: [point, { ...point, stoppedAt: "Дубликат" }],
      settings: { id: "settings", theme: "dark" },
    } as BackupV1;
    await expect(restoreBackup(invalidForDatabase)).rejects.toBeTruthy();
    expect(await db.works.get(work.id)).toMatchObject({
      title: "Существующие данные",
    });
    expect(await db.points.count()).toBe(0);
  });
});
