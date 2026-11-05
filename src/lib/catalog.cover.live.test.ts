import { describe, expect, it } from "vitest";
import { searchCatalog } from "./catalog";
import type { MediaType } from "../types";

const live = import.meta.env.VITE_LIVE_COVERS === "1";
const cases: Array<[MediaType, string, RegExp]> = [
  ["series", "Бумажный дом", /^(money heist|la casa de papel|бумажный дом)$/i],
  ["series", "Breaking Bad", /(breaking bad|во все тяжкие)/i],
  ["game", "The Witcher 3", /(witcher|ведьмак).*3|3.*(witcher|ведьмак)/i],
  ["game", "FIFA 23", /fifa\s*23/i],
  ["game", "Dota 2", /dota\s*2/i],
  ["book", "Дюна", /(dune|дюна)/i],
];
const selectedCases = import.meta.env.VITE_LIVE_QUERY
  ? cases.filter(([, query]) => query === import.meta.env.VITE_LIVE_QUERY)
  : cases;

describe.skipIf(!live)("live cover URLs", () => {
  it.each(selectedCases)(
    "%s: %s has a reachable, correctly matched cover",
    async (type, query, expected) => {
      const started = performance.now();
      const results = await searchCatalog(type, query);
      const match = results.find(
        (item) => expected.test(item.title) && item.cover,
      );
      expect(match, JSON.stringify(results, null, 2)).toBeDefined();
      const searchMs = Math.round(performance.now() - started);
      const coverStarted = performance.now();
      const response = await fetch(match!.cover!, {
        signal: AbortSignal.timeout(12_000),
      });
      const coverMs = Math.round(performance.now() - coverStarted);
      const contentType = response.headers.get("content-type") ?? "";
      console.info(
        JSON.stringify({
          query,
          title: match!.title,
          source: match!.source,
          searchMs,
          coverMs,
          status: response.status,
          contentType,
          cover: match!.cover,
        }),
      );
      expect(response.ok).toBe(true);
      expect(contentType).toMatch(/^image\//i);
    },
    60_000,
  );
});
