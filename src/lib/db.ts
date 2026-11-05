import Dexie, { type EntityTable } from "dexie";
import type { Draft, MemoryPoint, Settings, Work } from "../types";

export class WhereWasIDatabase extends Dexie {
  works!: EntityTable<Work, "id">;
  points!: EntityTable<MemoryPoint, "id">;
  settings!: EntityTable<Settings, "id">;
  drafts!: EntityTable<Draft, "id">;

  constructor(name = "where-was-i") {
    super(name);
    this.version(1).stores({
      works: "id, type, status, pinned, updatedAt, lastPointAt, lastResumedAt",
      points: "id, workId, createdAt, updatedAt",
      settings: "id",
    });
    this.version(2).stores({
      works: "id, type, status, pinned, updatedAt, lastPointAt, lastResumedAt",
      points: "id, workId, createdAt, updatedAt",
      settings: "id",
      drafts: "id, workId, updatedAt",
    });
  }
}

export const db = new WhereWasIDatabase();

export async function ensureSettings() {
  const current = await db.settings.get("settings");
  if (!current) await db.settings.put({ id: "settings", theme: "system" });
}

export async function upsertWork(
  input: Pick<Work, "title" | "type"> & Partial<Work>,
) {
  const now = new Date().toISOString();
  const work: Work = {
    id: input.id ?? crypto.randomUUID(),
    type: input.type,
    title: input.title.trim(),
    subtitle: input.subtitle?.trim(),
    cover: input.cover,
    coverBlob: input.coverBlob,
    source: input.source,
    sourceUrl: input.sourceUrl,
    status: input.status ?? "active",
    pinned: input.pinned ?? false,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    lastPointAt: input.lastPointAt,
    lastResumedAt: input.lastResumedAt,
  };
  await db.works.put(work);
  return work;
}

export async function savePoint(
  point: Omit<MemoryPoint, "id" | "createdAt" | "updatedAt"> &
    Partial<Pick<MemoryPoint, "id" | "createdAt">>,
) {
  const now = new Date().toISOString();
  const isNew = !point.id;
  const next: MemoryPoint = {
    ...point,
    id: point.id ?? crypto.randomUUID(),
    createdAt: point.createdAt ?? now,
    updatedAt: now,
  };
  await db.transaction("rw", db.points, db.works, db.drafts, async () => {
    await db.points.put(next);
    await db.works.update(point.workId, {
      ...(isNew ? { lastPointAt: now } : {}),
      updatedAt: now,
    });
    await db.drafts.delete(`point:${point.workId}`);
  });
  return next;
}

export async function deletePoint(id: string) {
  const point = await db.points.get(id);
  if (!point) return;
  await db.transaction("rw", db.points, db.works, async () => {
    await db.points.delete(id);
    const remaining = await db.points
      .where("workId")
      .equals(point.workId)
      .toArray();
    const latest = remaining.sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )[0];
    await db.works.update(point.workId, {
      lastPointAt: latest?.createdAt,
      updatedAt: new Date().toISOString(),
    });
  });
}

export async function getPointsNewestFirst(workId: string) {
  const points = await db.points.where("workId").equals(workId).toArray();
  return points.sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) ||
      b.updatedAt.localeCompare(a.updatedAt),
  );
}

export async function deleteWork(id: string) {
  await db.transaction("rw", db.works, db.points, db.drafts, async () => {
    await db.points.where("workId").equals(id).delete();
    await db.drafts.where("workId").equals(id).delete();
    await db.works.delete(id);
  });
}
