import { describe, expect, it } from "vitest";
import { searchCatalog } from "./catalog";
import type { MediaType } from "../types";

const live = import.meta.env.VITE_LIVE_CATALOG === "1";
const cases: Array<[MediaType, string, RegExp]> = [
  ["game", "FIFA", /fifa/i],
  ["game", "FIFA 23", /fifa\s*23/i],
  ["game", "Dota 2", /dota\s*2/i],
  ["game", "Ведьмак 3", /(ведьмак|witcher).*3|3.*(ведьмак|witcher)/i],
  ["game", "Minecraft", /minecraft/i],
  ["game", "Cyberpunk 2077", /cyberpunk\s*2077/i],
  ["game", "Red Dead Redemption 2", /red dead redemption\s*2/i],
  ["game", "RDR2", /red dead redemption\s*2/i],
  ["game", "Vedmak 3", /(ведьмак|witcher).*3|3.*(ведьмак|witcher)/i],
  ["series", "Бумажный дом", /(money heist|la casa de papel|бумажный дом)/i],
  ["series", "La Casa de Papel", /(money heist|la casa de papel)/i],
  ["series", "Money Heist", /(money heist|la casa de papel)/i],
  ["series", "Breaking Bad", /(breaking bad|во все тяжкие)/i],
  ["series", "Во все тяжкие", /(breaking bad|во все тяжкие)/i],
  ["series", "Очень странные дела", /(stranger things|очень странные дела)/i],
  ["book", "Дюна", /(дюна|dune)/i],
  ["book", "Гарри Поттер", /(гарри поттер|harry potter)/i],
  ["book", "Мастер и Маргарита", /(мастер и маргарита|master and margarita)/i],
];
const selectedCases = import.meta.env.VITE_LIVE_QUERY
  ? cases.filter(([, query]) => query === import.meta.env.VITE_LIVE_QUERY)
  : cases;

describe.skipIf(!live)("live catalog smoke", () => {
  it.each(selectedCases)(
    "%s: %s",
    async (type, query, expected) => {
      const results = await searchCatalog(type, query);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toMatch(expected);
      expect(
        results.some((item) => Boolean(item.cover)),
        JSON.stringify(results, null, 2),
      ).toBe(true);
    },
    45_000,
  );
});
