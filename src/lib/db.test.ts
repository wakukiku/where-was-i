import { beforeEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import {
  WhereWasIDatabase,
  db,
  deletePoint,
  deleteWork,
  getPointsNewestFirst,
  savePoint,
} from "./db";
import type { MemoryPoint, Work } from "../types";

const work: Work = {
  id: "work",
  title: "Тест",
  type: "game",
  status: "active",
  pinned: false,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};
const makePoint = (id: string, createdAt: string): MemoryPoint => ({
  id,
  workId: work.id,
  stoppedAt: id,
  next: `next-${id}`,
  progress: { percent: 10 },
  createdAt,
  updatedAt: createdAt,
});

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

describe("database lifecycle", () => {
  beforeEach(clearDatabase);

  it("always returns the newest point by date rather than UUID order", async () => {
    await db.works.put(work);
    await db.points.bulkAdd([
      makePoint("z-old", "2025-01-01T00:00:00.000Z"),
      makePoint("a-new", "2025-02-01T00:00:00.000Z"),
    ]);
    expect(
      (await getPointsNewestFirst(work.id)).map((item) => item.id),
    ).toEqual(["a-new", "z-old"]);
  });

  it("preserves point creation time while editing and updates work activity", async () => {
    const original = makePoint("point", "2025-01-01T00:00:00.000Z");
    await db.works.put({ ...work, lastPointAt: original.createdAt });
    await db.points.put(original);
    await savePoint({ ...original, stoppedAt: "Обновлено" });
    expect(await db.points.get(original.id)).toMatchObject({
      stoppedAt: "Обновлено",
      createdAt: original.createdAt,
    });
    expect((await db.works.get(work.id))?.updatedAt).not.toBe(work.updatedAt);
  });

  it("recalculates the latest date after deletion and cascades work deletion", async () => {
    const older = makePoint("older", "2025-01-01T00:00:00.000Z");
    const newer = makePoint("newer", "2025-02-01T00:00:00.000Z");
    await db.works.put({ ...work, lastPointAt: newer.createdAt });
    await db.points.bulkAdd([older, newer]);
    await db.drafts.put({
      id: `point:${work.id}`,
      workId: work.id,
      payload: {},
      updatedAt: newer.createdAt,
    });
    await deletePoint(newer.id);
    expect((await db.works.get(work.id))?.lastPointAt).toBe(older.createdAt);
    await deleteWork(work.id);
    expect(await db.works.count()).toBe(0);
    expect(await db.points.count()).toBe(0);
    expect(await db.drafts.count()).toBe(0);
  });

  it("migrates a version 1 database without losing existing works or points", async () => {
    const name = `where-was-i-migration-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(1).stores({
      works: "id, type, status, pinned, updatedAt, lastPointAt, lastResumedAt",
      points: "id, workId, createdAt, updatedAt",
      settings: "id",
    });
    await legacy.table("works").put(work);
    await legacy
      .table("points")
      .put(makePoint("legacy-point", "2025-01-02T00:00:00.000Z"));
    await legacy.table("settings").put({ id: "settings", theme: "dark" });
    legacy.close();

    const upgraded = new WhereWasIDatabase(name);
    await upgraded.open();
    expect(await upgraded.works.get(work.id)).toEqual(work);
    expect((await upgraded.points.get("legacy-point"))?.stoppedAt).toBe(
      "legacy-point",
    );
    expect(await upgraded.settings.get("settings")).toEqual({
      id: "settings",
      theme: "dark",
    });
    expect(upgraded.tables.map((table) => table.name)).toContain("drafts");
    upgraded.close();
    await Dexie.delete(name);
  });
});
