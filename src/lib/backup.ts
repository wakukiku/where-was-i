import { db } from './db';
import type { BackupV1, Settings, Work } from '../types';

const mediaTypes = new Set(['game', 'series', 'book']);
const workStatuses = new Set(['active', 'completed', 'archived']);
const themes = new Set(['light', 'dark', 'system']);
const validDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const optionalString = (value: unknown) => value === undefined || typeof value === 'string';
const optionalNumber = (value: unknown) => value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0);

const blobToDataUrl = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
};

const dataUrlToBlob = async (url: string) => (await fetch(url)).blob();

export async function createBackup(): Promise<BackupV1> {
  const works = await db.works.toArray();
  const mapped = await Promise.all(works.map(async ({ coverBlob, ...work }) => ({ ...work, coverDataUrl: coverBlob ? await blobToDataUrl(coverBlob) : undefined })));
  return { format: 'where-was-i', version: 1, exportedAt: new Date().toISOString(), works: mapped, points: await db.points.toArray(), settings: (await db.settings.get('settings')) ?? { id: 'settings', theme: 'system' } };
}

export function validateBackup(value: unknown): BackupV1 {
  if (!value || typeof value !== 'object') throw new Error('Файл не содержит резервную копию.');
  const data = value as Partial<BackupV1>;
  if (data.format !== 'where-was-i' || data.version !== 1 || !validDate(data.exportedAt) || !Array.isArray(data.works) || !Array.isArray(data.points)) throw new Error('Версия или структура резервной копии не поддерживается.');
  if (!data.works.every((work) => work && typeof work.id === 'string' && work.id.length > 0 && typeof work.title === 'string' && work.title.trim().length > 0 && mediaTypes.has(work.type) && workStatuses.has(work.status) && typeof work.pinned === 'boolean' && validDate(work.createdAt) && validDate(work.updatedAt) && optionalString(work.subtitle) && optionalString(work.cover) && optionalString(work.source) && optionalString(work.sourceUrl) && optionalString(work.lastPointAt) && optionalString(work.lastResumedAt) && (work.coverDataUrl === undefined || (typeof work.coverDataUrl === 'string' && work.coverDataUrl.startsWith('data:image/'))))) throw new Error('В резервной копии повреждён список произведений.');
  const workIds = new Set(data.works.map((work) => work.id));
  if (workIds.size !== data.works.length) throw new Error('В резервной копии повторяются идентификаторы произведений.');
  if (!data.points.every((point) => point && typeof point.id === 'string' && point.id.length > 0 && typeof point.workId === 'string' && workIds.has(point.workId) && typeof point.stoppedAt === 'string' && point.stoppedAt.trim().length > 0 && typeof point.next === 'string' && point.next.trim().length > 0 && optionalString(point.happened) && optionalString(point.remember) && point.progress && typeof point.progress === 'object' && optionalNumber(point.progress.percent) && optionalNumber(point.progress.hours) && optionalNumber(point.progress.season) && optionalNumber(point.progress.episode) && optionalString(point.progress.chapter) && optionalNumber(point.progress.page) && optionalNumber(point.progress.totalPages) && validDate(point.createdAt) && validDate(point.updatedAt))) throw new Error('В резервной копии повреждены точки памяти.');
  const pointIds = new Set(data.points.map((point) => point.id));
  if (pointIds.size !== data.points.length) throw new Error('В резервной копии повторяются идентификаторы точек.');
  const settings = data.settings ?? { id: 'settings', theme: 'system' };
  if (settings.id !== 'settings' || !themes.has(settings.theme)) throw new Error('В резервной копии повреждены настройки.');
  return { ...(data as BackupV1), settings };
}

export async function restoreBackup(backup: BackupV1) {
  const workIds = new Set(backup.works.map((work) => work.id));
  if (backup.points.some((point) => !workIds.has(point.workId))) throw new Error('Резервная копия содержит точки без произведений.');
  const works: Work[] = await Promise.all(backup.works.map(async ({ coverDataUrl, ...work }) => ({ ...work, coverBlob: coverDataUrl ? await dataUrlToBlob(coverDataUrl) : undefined })));
  await db.transaction('rw', db.works, db.points, db.settings, db.drafts, async () => {
    await Promise.all([db.works.clear(), db.points.clear(), db.settings.clear(), db.drafts.clear()]);
    await db.works.bulkAdd(works);
    await db.points.bulkAdd(backup.points);
    await db.settings.put((backup.settings as Settings | undefined) ?? { id: 'settings', theme: 'system' });
  });
}
