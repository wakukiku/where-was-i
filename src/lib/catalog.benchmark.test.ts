import { describe, it } from "vitest";
import { searchCatalogProgressive } from "./catalog";
import type { MediaType } from "../types";

const enabled = import.meta.env.VITE_BENCH_SEARCH === "1";
const queries: Array<[MediaType, string]> = [
  ["game", "Ведьмак 3"],
  ["game", "FIFA 23"],
  ["game", "Dota 2"],
  ["series", "Бумажный дом"],
  ["series", "Breaking Bad"],
  ["book", "Дюна"],
];
const selectedQueries = import.meta.env.VITE_BENCH_QUERY
  ? queries.filter(([, query]) => query === import.meta.env.VITE_BENCH_QUERY)
  : queries;

describe.skipIf(!enabled)("catalog benchmark", () => {
  it("measures cold and memory-cache responses", async () => {
    const measurements: Array<{
      type: MediaType;
      query: string;
      firstMs: number;
      completeMs: number;
      cachedMs: number;
      count: number;
      error?: string;
    }> = [];
    for (const [type, query] of selectedQueries) {
      const coldStarted = performance.now();
      let firstMs = 0;
      try {
        const cold = await searchCatalogProgressive(type, query, (results) => {
          if (!firstMs && results.length)
            firstMs = performance.now() - coldStarted;
        });
        const completeMs = performance.now() - coldStarted;
        const cachedStarted = performance.now();
        await searchCatalogProgressive(type, query, () => undefined);
        const cachedMs = performance.now() - cachedStarted;
        measurements.push({
          type,
          query,
          firstMs: Math.round(firstMs),
          completeMs: Math.round(completeMs),
          cachedMs: Math.round(cachedMs * 10) / 10,
          count: cold.length,
        });
      } catch (error) {
        measurements.push({
          type,
          query,
          firstMs: Math.round(firstMs),
          completeMs: Math.round(performance.now() - coldStarted),
          cachedMs: 0,
          count: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    console.log(`SEARCH_BENCHMARK=${JSON.stringify(measurements)}`);
  }, 240_000);
});
