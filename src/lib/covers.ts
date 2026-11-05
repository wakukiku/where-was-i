import { db } from "./db";

const COVER_TIMEOUT_MS = 8_000;
const MAX_COVER_BYTES = 8 * 1024 * 1024;
const SUCCESS_TTL_MS = 30 * 60_000;
const FAILURE_TTL_MS = 2 * 60_000;

export type CoverFetchStatus =
  | "ready"
  | "missing"
  | "invalid-url"
  | "not-image"
  | "too-large"
  | "timeout"
  | "unavailable";
export type CoverFetchResult = {
  status: CoverFetchStatus;
  blob?: Blob;
  httpStatus?: number;
};

const coverCache = new Map<
  string,
  { expiresAt: number; result: CoverFetchResult }
>();
const inFlight = new Map<string, Promise<CoverFetchResult>>();

function validCoverUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

async function downloadCover(url: string): Promise<CoverFetchResult> {
  if (!validCoverUrl(url)) return { status: "invalid-url" };
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), COVER_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "force-cache",
      credentials: "omit",
    });
    if (!response.ok)
      return {
        status:
          response.status === 404 || response.status === 410
            ? "missing"
            : "unavailable",
        httpStatus: response.status,
      };
    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("image/"))
      return { status: "not-image", httpStatus: response.status };
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_COVER_BYTES)
      return { status: "too-large", httpStatus: response.status };
    const blob = await response.blob();
    if (
      !blob.size ||
      blob.size > MAX_COVER_BYTES ||
      !blob.type.toLowerCase().startsWith("image/")
    ) {
      return {
        status: blob.size > MAX_COVER_BYTES ? "too-large" : "not-image",
        httpStatus: response.status,
      };
    }
    return { status: "ready", blob, httpStatus: response.status };
  } catch (cause) {
    return {
      status:
        cause instanceof DOMException && cause.name === "AbortError"
          ? "timeout"
          : "unavailable",
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export function warmCover(url: string): Promise<CoverFetchResult> {
  const cached = coverCache.get(url);
  if (cached && cached.expiresAt > Date.now())
    return Promise.resolve(cached.result);
  const pending = inFlight.get(url);
  if (pending) return pending;
  const request = downloadCover(url)
    .then((result) => {
      coverCache.set(url, {
        expiresAt:
          Date.now() +
          (result.status === "ready" ? SUCCESS_TTL_MS : FAILURE_TTL_MS),
        result,
      });
      return result;
    })
    .finally(() => inFlight.delete(url));
  inFlight.set(url, request);
  return request;
}

export async function cacheCoverForWork(workId: string, url: string) {
  const result = await warmCover(url);
  if (result.status !== "ready" || !result.blob) return result;
  const current = await db.works.get(workId);
  if (current && !current.coverBlob && current.cover === url)
    await db.works.update(workId, { coverBlob: result.blob });
  return result;
}

export function clearCoverMemoryCache() {
  coverCache.clear();
  inFlight.clear();
}
