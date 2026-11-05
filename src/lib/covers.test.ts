import { beforeEach, describe, expect, it, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { cacheCoverForWork, clearCoverMemoryCache, warmCover } from "./covers";
import { db, upsertWork } from "./db";

describe("cover caching", () => {
  function imageResponse(blob: Blob) {
    return {
      ok: true,
      status: 200,
      headers: new Headers({
        "content-type": blob.type,
        "content-length": String(blob.size),
      }),
      blob: async () => blob,
    } as Response;
  }

  beforeEach(async () => {
    clearCoverMemoryCache();
    await db.works.clear();
    vi.restoreAllMocks();
  });

  it("deduplicates downloads and stores a valid image locally", async () => {
    const image = new NodeBlob(["cover"], { type: "image/jpeg" }) as Blob;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(imageResponse(image));
    const url = "https://static.tvmaze.com/example.jpg";
    const work = await upsertWork({
      type: "series",
      title: "Money Heist",
      cover: url,
    });

    const [first, second] = await Promise.all([
      cacheCoverForWork(work.id, url),
      warmCover(url),
    ]);

    expect(first.status).toBe("ready");
    expect(second.status).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await db.works.get(work.id))?.coverBlob?.type).toBe("image/jpeg");
  });

  it.each([
    [404, "missing"],
    [500, "unavailable"],
  ] as const)("distinguishes HTTP %s as %s", async (status, expected) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status }),
    );
    await expect(
      warmCover(`https://example.test/${status}.jpg`),
    ).resolves.toMatchObject({ status: expected, httpStatus: status });
  });

  it("rejects successful responses that are not images", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    await expect(
      warmCover("https://example.test/not-an-image"),
    ).resolves.toMatchObject({ status: "not-image" });
  });

  it("does not overwrite a manually uploaded cover", async () => {
    const url = "https://covers.openlibrary.org/b/id/1-M.jpg";
    const manual = new NodeBlob(["manual"], { type: "image/png" }) as Blob;
    const remote = new NodeBlob(["remote"], { type: "image/jpeg" }) as Blob;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(imageResponse(remote));
    const work = await upsertWork({
      type: "book",
      title: "Dune",
      cover: url,
      coverBlob: manual,
    });

    await cacheCoverForWork(work.id, url);

    expect((await db.works.get(work.id))?.coverBlob?.type).toBe("image/png");
  });
});
