import { describe, expect, it } from "vitest";
import {
  relevanceScore,
  transliterateLatin,
  transliterateRu,
  tvMazeSearchTerms,
} from "./catalog";

describe("catalog query normalization", () => {
  it("supports Cyrillic and Latin transliteration in both directions", () => {
    expect(transliterateRu("Ведьмак 3")).toBe("vedmak 3");
    expect(transliterateLatin("Vedmak 3")).toBe("ведмак 3");
  });

  it("prioritizes an exact numbered release over a franchise or another release", () => {
    const exact = relevanceScore("FIFA 23", ["FIFA 23"]);
    const franchise = relevanceScore("FIFA 23", ["FIFA"]);
    const anotherRelease = relevanceScore("FIFA 23", ["FIFA 22"]);
    expect(exact).toBeGreaterThan(franchise);
    expect(exact).toBeGreaterThan(anotherRelease);
  });

  it("uses multilingual aliases for exact ranking", () => {
    const bridged = relevanceScore("Бумажный дом", [
      "Money Heist",
      "La casa de papel",
      "Бумажный дом",
    ]);
    const unrelated = relevanceScore("Бумажный дом", ["House of Cards"]);
    expect(bridged).toBeGreaterThan(unrelated);
  });

  it("does not give an alias match to a similarly named TVmaze spin-off", () => {
    const aliases = ["Бумажный дом", "Money Heist", "La Casa de Papel"];
    const original = relevanceScore(
      "Бумажный дом",
      tvMazeSearchTerms("La Casa de Papel", aliases),
    );
    const spinOff = relevanceScore(
      "Бумажный дом",
      tvMazeSearchTerms("Money Heist: Korea - Joint Economic Area", aliases),
    );
    expect(original).toBeGreaterThan(spinOff);
  });

  it("recognizes an acronym composed from title tokens and a release number", () => {
    const abbreviated = relevanceScore("RDR2", ["Red Dead Redemption 2"]);
    const unrelated = relevanceScore("RDR2", ["Red Dead Revolver"]);
    expect(abbreviated).toBeGreaterThan(unrelated);
  });
});
