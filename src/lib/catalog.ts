import type { CatalogResult, MediaType } from "../types";

type Claim = {
  mainsnak?: { datavalue?: { value?: string | { id?: string } } };
};
type WikiEntity = {
  claims?: { P31?: Claim[]; P18?: Claim[] };
  labels?: Record<string, { value: string }>;
  aliases?: Record<string, Array<{ value: string }>>;
  descriptions?: Record<string, { value: string }>;
};
type WikiSearchItem = {
  id: string;
  label: string;
  description?: string;
  aliases?: string[];
};
type WikiSearchResponse = { search: WikiSearchItem[] };
type WikiEntityResponse = { entities: Record<string, WikiEntity> };
type WikipediaPage = {
  title: string;
  pageprops?: { wikibase_item?: string };
  thumbnail?: { source?: string };
};
type WikipediaResponse = { query?: { pages?: Record<string, WikipediaPage> } };
type WikipediaSummary = {
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
};
type WikipediaRestSearch = {
  pages?: Array<{
    id: number;
    key: string;
    title: string;
    description?: string;
    thumbnail?: { url?: string };
  }>;
};
type WikipediaLangLinks = {
  query?: {
    pages?: Record<
      string,
      { langlinks?: Array<{ lang: string; "*": string }> }
    >;
  };
};
type TvMazeItem = {
  score: number;
  show: {
    id: number;
    name: string;
    premiered?: string;
    image?: { medium?: string; original?: string };
    url: string;
    network?: { name: string };
    webChannel?: { name: string };
  };
};
type OpenLibraryResponse = {
  docs: Array<{
    key: string;
    title: string;
    subtitle?: string;
    alternative_title?: string[];
    author_name?: string[];
    first_publish_year?: number;
    cover_i?: number;
  }>;
};
type ProxyGame = {
  id: string;
  title: string;
  alternativeTitles?: string[];
  subtitle?: string;
  cover?: string;
  url: string;
};
type RankedResult = CatalogResult & {
  searchTerms: string[];
  baseScore?: number;
  entityId?: string;
};
export type SearchProgress = { complete: boolean; cached: boolean };

const RESPONSE_TTL_MS = 15 * 60 * 1000;
const RESULT_TTL_MS = 30 * 60 * 1000;
const FAST_TIMEOUT_MS = 6000;
const ENRICH_TIMEOUT_MS = 8000;
const cache = new Map<string, { value: unknown; expiresAt: number }>();
type SharedRequest = {
  promise: Promise<unknown>;
  controller: AbortController;
  consumers: number;
  settled: boolean;
};
const inFlight = new Map<string, SharedRequest>();
const resultCache = new Map<
  string,
  { value: CatalogResult[]; expiresAt: number }
>();
const GAME_TYPES = new Set(["Q7889", "Q7058673", "Q134556"]);
const SERIES_TYPES = new Set(["Q5398426", "Q1259759", "Q15416"]);
const BOOK_TYPES = new Set([
  "Q571",
  "Q8261",
  "Q277759",
  "Q7725634",
  "Q47461344",
  "Q49084",
]);
const hostQueues = new Map<string, Promise<void>>();
const hostNextRequestAt = new Map<string, number>();

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener("abort", abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      abort();
      reject(new DOMException("Timed out", "TimeoutError"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abort);
  }
}

async function waitForShared<T>(shared: SharedRequest, signal?: AbortSignal) {
  shared.consumers += 1;
  if (signal?.aborted) {
    shared.consumers -= 1;
    if (shared.consumers === 0 && !shared.settled) shared.controller.abort();
    throw new DOMException("Aborted", "AbortError");
  }
  let rejectAbort: ((reason?: unknown) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const abort = () => rejectAbort?.(new DOMException("Aborted", "AbortError"));
  signal?.addEventListener("abort", abort, { once: true });
  try {
    return await (signal
      ? Promise.race([shared.promise as Promise<T>, aborted])
      : (shared.promise as Promise<T>));
  } finally {
    signal?.removeEventListener("abort", abort);
    shared.consumers -= 1;
    if (shared.consumers === 0 && !shared.settled) shared.controller.abort();
  }
}

async function scheduledFetch(url: string, signal?: AbortSignal) {
  const hostname = new URL(url).hostname;
  const isWikimedia = /(^|\.)wiki(data|pedia)\.org$/.test(hostname);
  if (!isWikimedia)
    return fetch(url, { signal, headers: { Accept: "application/json" } });
  let release: (() => void) | undefined;
  const previous = hostQueues.get(hostname) ?? Promise.resolve();
  hostQueues.set(
    hostname,
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  await previous;
  try {
    await wait(
      Math.max(0, (hostNextRequestAt.get(hostname) ?? 0) - Date.now()),
      signal,
    );
    return await fetch(url, {
      signal,
      headers: { Accept: "application/json" },
    });
  } finally {
    hostNextRequestAt.set(hostname, Date.now() + 220);
    release?.();
  }
}

const fetchJson = async <T>(url: string, signal?: AbortSignal): Promise<T> => {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  if (cached) cache.delete(url);
  const existing = inFlight.get(url);
  if (existing) return waitForShared<T>(existing, signal);
  const requestController = new AbortController();
  const task = (async () => {
    const requestTimeout = setTimeout(() => requestController.abort(), 12_000);
    try {
      let response = await scheduledFetch(url, requestController.signal);
      for (
        let attempt = 0;
        response.status === 429 && attempt < 2;
        attempt += 1
      ) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        await wait(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 1400 * (attempt + 1),
          requestController.signal,
        );
        response = await scheduledFetch(url, requestController.signal);
      }
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "Каталог временно ограничил запросы. Попробуйте чуть позже."
            : "Каталог сейчас недоступен.",
        );
      const data = (await response.json()) as T;
      cache.set(url, { value: data, expiresAt: Date.now() + RESPONSE_TTL_MS });
      return data;
    } finally {
      clearTimeout(requestTimeout);
    }
  })();
  const shared: SharedRequest = {
    promise: task,
    controller: requestController,
    consumers: 0,
    settled: false,
  };
  inFlight.set(url, shared);
  void task
    .finally(() => {
      shared.settled = true;
      inFlight.delete(url);
    })
    .catch(() => undefined);
  return waitForShared<T>(shared, signal);
};

const normalize = (value: string) =>
  value
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
const numbers = (value: string): string[] =>
  normalize(value).match(/\d+/g) ?? [];
const tokens = (value: string) => normalize(value).split(" ").filter(Boolean);
const acronym = (value: string) =>
  tokens(value)
    .map((part) => (/^\d+$/.test(part) ? part : part[0]))
    .join("");

const RU_TO_LAT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};
const LAT_TO_RU: Array<[RegExp, string]> = [
  [/shch/g, "щ"],
  [/sch/g, "щ"],
  [/yo/g, "ё"],
  [/zh/g, "ж"],
  [/kh/g, "х"],
  [/ts/g, "ц"],
  [/ch/g, "ч"],
  [/sh/g, "ш"],
  [/yu/g, "ю"],
  [/ju/g, "ю"],
  [/ya/g, "я"],
  [/ja/g, "я"],
  [/ye/g, "е"],
  [/a/g, "а"],
  [/b/g, "б"],
  [/v/g, "в"],
  [/g/g, "г"],
  [/d/g, "д"],
  [/e/g, "е"],
  [/z/g, "з"],
  [/i/g, "и"],
  [/j/g, "й"],
  [/k/g, "к"],
  [/l/g, "л"],
  [/m/g, "м"],
  [/n/g, "н"],
  [/o/g, "о"],
  [/p/g, "п"],
  [/r/g, "р"],
  [/s/g, "с"],
  [/t/g, "т"],
  [/u/g, "у"],
  [/f/g, "ф"],
  [/h/g, "х"],
  [/y/g, "ы"],
  [/c/g, "к"],
  [/q/g, "к"],
  [/w/g, "в"],
  [/x/g, "кс"],
];

export function transliterateRu(value: string) {
  return value
    .toLocaleLowerCase("ru")
    .split("")
    .map((char) => RU_TO_LAT[char] ?? char)
    .join("");
}

export function transliterateLatin(value: string) {
  let result = value.toLocaleLowerCase("en");
  for (const [pattern, replacement] of LAT_TO_RU)
    result = result.replace(pattern, replacement);
  return result;
}

function levenshtein(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[b.length];
}

export function relevanceScore(query: string, terms: string[], baseScore = 0) {
  const q = normalize(query);
  const qTranslit = normalize(
    /[а-яё]/i.test(query) ? transliterateRu(query) : transliterateLatin(query),
  );
  const qTokens = new Set(tokens(query));
  const qNumbers = numbers(query);
  let best = 0;
  for (const rawTerm of terms) {
    const term = normalize(rawTerm);
    if (!term) continue;
    let score = 0;
    if (term === q) score = 1200;
    else if (term === qTranslit) score = 1080;
    else if (term.startsWith(`${q} `) || q.startsWith(`${term} `)) score = 850;
    else if (term.includes(q)) score = 700;
    if (acronym(rawTerm) === q.replaceAll(" ", ""))
      score = Math.max(score, 940);
    const termTokens = new Set(tokens(rawTerm));
    const overlap = [...qTokens].filter((token) =>
      termTokens.has(token),
    ).length;
    if (qTokens.size)
      score += Math.round(
        (360 * overlap) / Math.max(qTokens.size, termTokens.size),
      );
    if (q.length >= 4 && term.length >= 4)
      score += Math.round(
        240 * (1 - levenshtein(q, term) / Math.max(q.length, term.length)),
      );
    if (qNumbers.length)
      score += qNumbers.every((value) => numbers(rawTerm).includes(value))
        ? 240
        : -520;
    best = Math.max(best, score);
  }
  return best + baseScore;
}

function unique(values: Array<string | undefined>) {
  const seen = new Set<string>();
  return values
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value) => {
      const key = normalize(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function ranked(
  query: string,
  results: RankedResult[],
  limit = 12,
): CatalogResult[] {
  const seen = new Set<string>();
  return results
    .sort(
      (a, b) =>
        relevanceScore(query, b.searchTerms, b.baseScore) -
        relevanceScore(query, a.searchTerms, a.baseScore),
    )
    .filter((item) => {
      const key = `${item.source}:${item.externalId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map((item) => ({
      externalId: item.externalId,
      title: item.title,
      subtitle: item.subtitle,
      cover: item.cover,
      source: item.source,
      sourceUrl: item.sourceUrl,
    }));
}

function claimIds(entity: WikiEntity) {
  return (entity.claims?.P31 ?? [])
    .map((claim) => claim.mainsnak?.datavalue?.value)
    .filter(
      (value): value is { id: string } =>
        typeof value === "object" && typeof value.id === "string",
    )
    .map((value) => value.id);
}

function commonsImage(entity: WikiEntity) {
  const value = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  return typeof value === "string"
    ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(value)}?width=360`
    : undefined;
}

function entityTerms(entity: WikiEntity, search?: WikiSearchItem) {
  return unique([
    search?.label,
    ...(search?.aliases ?? []),
    ...Object.values(entity.labels ?? {}).map((label) => label.value),
    ...Object.values(entity.aliases ?? {}).flatMap((aliases) =>
      aliases.map((alias) => alias.value),
    ),
  ]);
}

function displayLabel(entity: WikiEntity, query: string, fallback: string) {
  const preferred = /[а-яё]/i.test(query)
    ? ["ru", "en", "es"]
    : ["en", "es", "ru"];
  return (
    preferred.map((lang) => entity.labels?.[lang]?.value).find(Boolean) ??
    fallback
  );
}

function fuzzyWikiQuery(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => (/^[а-яё]{4,}$/i.test(part) ? `${part}~1` : part))
    .join(" ");
}

async function discoverWikimedia(
  query: string,
  type: MediaType,
  signal?: AbortSignal,
  options: {
    transliteration?: boolean;
    summaries?: boolean;
    wikipedia?: boolean;
  } = {},
): Promise<RankedResult[]> {
  const cyrillic = /[а-яё]/i.test(query);
  const transliterated = cyrillic
    ? transliterateRu(query)
    : transliterateLatin(query);
  const primaryPlan = { term: query, lang: cyrillic ? "ru" : "en" };
  const plans =
    options.transliteration === false
      ? [primaryPlan]
      : cyrillic
        ? [primaryPlan, { term: transliterated, lang: "en" }]
        : [primaryPlan, { term: transliterated, lang: "ru" }];
  const searches = await Promise.allSettled(
    plans.map(({ term, lang }) =>
      fetchJson<WikiSearchResponse>(
        `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(term)}&language=${lang}&uselang=ru&type=item&limit=20&origin=*&format=json`,
        signal,
      ),
    ),
  );
  const searchItems = searches.flatMap((result) =>
    result.status === "fulfilled" ? result.value.search : [],
  );
  const wikiLanguage = cyrillic ? "ru" : "en";
  const [primaryWikipedia, transliteratedWikipedia] = await Promise.all([
    options.wikipedia === false
      ? Promise.resolve({} as WikipediaResponse)
      : fetchJson<WikipediaResponse>(
          `https://${wikiLanguage}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=12&prop=pageprops%7Cpageimages&ppprop=wikibase_item&pithumbsize=360&format=json&origin=*`,
          signal,
        ).catch(() => ({}) as WikipediaResponse),
    options.wikipedia !== false &&
    options.transliteration !== false &&
    !cyrillic &&
    normalize(transliterated) !== normalize(query)
      ? fetchJson<WikipediaResponse>(
          `https://ru.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(fuzzyWikiQuery(transliterated))}&gsrlimit=12&prop=pageprops%7Cpageimages&ppprop=wikibase_item&pithumbsize=360&format=json&origin=*`,
          signal,
        ).catch(() => ({}) as WikipediaResponse)
      : Promise.resolve({} as WikipediaResponse),
  ]);
  const primaryPages = Object.values(primaryWikipedia.query?.pages ?? {}).map(
    (page) => ({ page, lang: wikiLanguage }),
  );
  const transliteratedPages = Object.values(
    transliteratedWikipedia.query?.pages ?? {},
  ).map((page) => ({ page, lang: "ru" }));
  const pages = [...primaryPages, ...transliteratedPages];
  const pageByEntity = new Map(
    pages
      .filter(({ page }) => page.pageprops?.wikibase_item)
      .map(({ page, lang }) => [
        page.pageprops!.wikibase_item!,
        { page, lang },
      ]),
  );
  const ids = unique([
    ...searchItems.map((item) => item.id),
    ...pageByEntity.keys(),
  ]).slice(0, 50);
  if (!ids.length) return [];
  const entities = await fetchJson<WikiEntityResponse>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(ids.join("|"))}&props=claims%7Clabels%7Caliases%7Cdescriptions&languages=ru%7Cen%7Ces%7Cde%7Cfr&languagefallback=1&origin=*&format=json`,
    signal,
  );
  const allowed =
    type === "game"
      ? GAME_TYPES
      : type === "series"
        ? SERIES_TYPES
        : BOOK_TYPES;
  const candidates = ids.flatMap((id, index): RankedResult[] => {
    const entity = entities.entities[id];
    if (!entity || !claimIds(entity).some((value) => allowed.has(value)))
      return [];
    const search = searchItems.find((item) => item.id === id);
    const terms = entityTerms(entity, search);
    const page = pageByEntity.get(id)?.page;
    const fallback = search?.label ?? page?.title ?? id;
    return [
      {
        externalId: id,
        title: displayLabel(entity, query, fallback),
        subtitle:
          search?.description ??
          entity.descriptions?.ru?.value ??
          entity.descriptions?.en?.value,
        cover: commonsImage(entity) ?? page?.thumbnail?.source,
        source: "Wikidata",
        sourceUrl: `https://www.wikidata.org/wiki/${id}`,
        searchTerms: unique([...terms, page?.title]),
        baseScore: Math.max(0, 45 - index),
        entityId: id,
      },
    ];
  });
  if (type === "game" && options.summaries !== false) {
    for (const candidate of candidates
      .filter((item) => !item.cover && pageByEntity.has(item.entityId ?? ""))
      .slice(0, 4)) {
      const linkedPage = pageByEntity.get(candidate.entityId ?? "");
      if (!linkedPage) continue;
      const summary = await fetchJson<WikipediaSummary>(
        `https://${linkedPage.lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(linkedPage.page.title.replaceAll(" ", "_"))}`,
        signal,
      ).catch(() => undefined);
      candidate.cover =
        summary?.thumbnail?.source ?? summary?.originalimage?.source;
      if (candidate.cover) break;
    }
  }
  return candidates;
}

async function searchGameProxy(
  query: string,
  signal?: AbortSignal,
): Promise<RankedResult[]> {
  const base = import.meta.env.VITE_GAME_SEARCH_PROXY?.trim();
  if (!base) return [];
  const separator = base.includes("?") ? "&" : "?";
  const data = await fetchJson<ProxyGame[]>(
    `${base}${separator}q=${encodeURIComponent(query)}`,
    signal,
  );
  if (!Array.isArray(data))
    throw new Error("Игровой proxy вернул неподдерживаемый формат.");
  return data
    .filter((item) => item && item.id && item.title && item.url)
    .map((item, index) => ({
      externalId: item.id,
      title: item.title,
      subtitle: item.subtitle,
      cover: item.cover,
      source: "Игровой каталог",
      sourceUrl: item.url,
      searchTerms: unique([item.title, ...(item.alternativeTitles ?? [])]),
      baseScore: Math.max(0, 90 - index),
    }));
}

async function searchGames(query: string, signal?: AbortSignal) {
  const [wikimedia, proxy] = await Promise.allSettled([
    discoverWikimedia(query, "game", signal),
    searchGameProxy(query, signal),
  ]);
  const results = [
    ...(proxy.status === "fulfilled" ? proxy.value : []),
    ...(wikimedia.status === "fulfilled" ? wikimedia.value : []),
  ];
  if (
    !results.length &&
    proxy.status === "rejected" &&
    wikimedia.status === "rejected"
  )
    throw new Error("Игровые каталоги сейчас недоступны.");
  return ranked(query, results);
}

export function tvMazeSearchTerms(showName: string, bridgeTerms: string[]) {
  const exactAlias = bridgeTerms.some(
    (term) => normalize(term) === normalize(showName),
  );
  return unique([showName, ...(exactAlias ? bridgeTerms : [])]);
}

function tvMazeResults(
  items: TvMazeItem[],
  bridgeTerms: string[] = [],
): RankedResult[] {
  return items.map(({ score, show }, index) => ({
    externalId: String(show.id),
    title: show.name,
    subtitle: [
      show.premiered?.slice(0, 4),
      show.network?.name ?? show.webChannel?.name,
    ]
      .filter(Boolean)
      .join(" · "),
    cover: show.image?.medium ?? show.image?.original,
    source: "TVmaze",
    sourceUrl: show.url,
    searchTerms: tvMazeSearchTerms(show.name, bridgeTerms),
    baseScore: Math.round(score * 80) + Math.max(0, 35 - index),
  }));
}

async function searchSeriesDirect(query: string, signal?: AbortSignal) {
  const items = await fetchJson<TvMazeItem[]>(
    `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`,
    signal,
  );
  return ranked(query, tvMazeResults(items));
}

async function searchSeriesWikipediaBridge(
  query: string,
  signal?: AbortSignal,
) {
  const lang = /[а-яё]/i.test(query) ? "ru" : "en";
  const data = await fetchJson<WikipediaRestSearch>(
    `https://${lang}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=6`,
    signal,
  );
  const seriesPages = (data.pages ?? [])
    .filter((page) =>
      /(television|tv|streaming) series|телесериал|сериал/i.test(
        page.description ?? "",
      ),
    )
    .slice(0, 2);
  const bridged = await Promise.all(
    seriesPages.map(async (page) => {
      let catalogTitle = page.title;
      if (lang !== "en") {
        const links = await fetchJson<WikipediaLangLinks>(
          `https://${lang}.wikipedia.org/w/api.php?action=query&prop=langlinks&titles=${encodeURIComponent(page.title)}&lllang=en&lllimit=1&format=json&origin=*`,
          signal,
        ).catch(() => undefined);
        catalogTitle =
          Object.values(links?.query?.pages ?? {})[0]?.langlinks?.[0]?.["*"] ??
          catalogTitle;
      }
      const shows = await fetchJson<TvMazeItem[]>(
        `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(catalogTitle)}`,
        signal,
      ).catch(() => []);
      return tvMazeResults(shows, unique([query, page.title, catalogTitle]));
    }),
  );
  return ranked(query, bridged.flat());
}

async function searchSeries(query: string, signal?: AbortSignal) {
  const [direct, wikimedia] = await Promise.all([
    fetchJson<TvMazeItem[]>(
      `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`,
      signal,
    ).catch(() => []),
    discoverWikimedia(query, "series", signal).catch(() => []),
  ]);
  const bridged: RankedResult[] = [];
  const matchedEntities = new Set<string>();
  for (const candidate of wikimedia
    .sort(
      (a, b) =>
        relevanceScore(query, b.searchTerms) -
        relevanceScore(query, a.searchTerms),
    )
    .slice(0, 3)) {
    const alternate = candidate.searchTerms.find(
      (term) => normalize(term) !== normalize(query) && /[a-z]/i.test(term),
    );
    if (!alternate) continue;
    const shows = await fetchJson<TvMazeItem[]>(
      `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(alternate)}`,
      signal,
    ).catch(() => []);
    if (shows.length) {
      bridged.push(...tvMazeResults(shows, candidate.searchTerms));
      if (candidate.entityId) matchedEntities.add(candidate.entityId);
    }
    if (bridged.length >= 12) break;
  }
  const fallback = wikimedia.filter(
    (candidate) =>
      !candidate.entityId || !matchedEntities.has(candidate.entityId),
  );
  const results = [...tvMazeResults(direct), ...bridged, ...fallback];
  return ranked(query, results);
}

function solrPhrase(value: string) {
  return `"${value.replace(/["\\]/g, " ").trim()}"`;
}

function mapOpenLibrary(
  data: OpenLibraryResponse,
  bridgeTerms: string[] = [],
): RankedResult[] {
  return data.docs.map((book, index) => ({
    externalId: book.key,
    title: book.title,
    subtitle:
      [book.author_name?.[0], book.first_publish_year]
        .filter(Boolean)
        .join(" · ") || book.subtitle,
    cover: book.cover_i
      ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`
      : undefined,
    source: "Open Library",
    sourceUrl: `https://openlibrary.org${book.key.startsWith("/") ? book.key : `/works/${book.key}`}`,
    searchTerms: unique([
      book.title,
      book.subtitle,
      ...(book.alternative_title ?? []),
      ...bridgeTerms,
    ]),
    baseScore: Math.max(0, 80 - index),
  }));
}

async function fetchOpenLibrary(
  query: string,
  searchTerms: string[],
  bridgeTerms: string[],
  signal?: AbortSignal,
) {
  const q = unique(searchTerms).slice(0, 5).map(solrPhrase).join(" OR ");
  const data = await fetchJson<OpenLibraryResponse>(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&lang=ru&limit=24&fields=key,title,subtitle,alternative_title,author_name,first_publish_year,cover_i`,
    signal,
  );
  return ranked(query, mapOpenLibrary(data, bridgeTerms));
}

async function searchBooksDirect(query: string, signal?: AbortSignal) {
  const transliterated = /[а-яё]/i.test(query)
    ? transliterateRu(query)
    : transliterateLatin(query);
  return fetchOpenLibrary(query, [query, transliterated], [], signal);
}

async function searchBooks(query: string, signal?: AbortSignal) {
  const wikimedia = await discoverWikimedia(query, "book", signal).catch(
    () => [],
  );
  const bridgeTerms = wikimedia
    .sort(
      (a, b) =>
        relevanceScore(query, b.searchTerms) -
        relevanceScore(query, a.searchTerms),
    )
    .flatMap((item) => item.searchTerms)
    .filter((term) => term.length >= 2)
    .slice(0, 4);
  const transliterated = /[а-яё]/i.test(query)
    ? transliterateRu(query)
    : transliterateLatin(query);
  const results = await fetchOpenLibrary(
    query,
    [query, transliterated, ...bridgeTerms],
    bridgeTerms,
    signal,
  );
  if (!results.length) return ranked(query, wikimedia);
  return results;
}

async function searchWikipediaGamesFast(query: string, signal?: AbortSignal) {
  const lang = /[а-яё]/i.test(query) ? "ru" : "en";
  const data = await fetchJson<WikipediaRestSearch>(
    `https://${lang}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=10`,
    signal,
  );
  const gameDescription =
    /(video|computer|mobile|arcade) game|video game series|компьютерн\w* игр|видеоигр|серия игр/i;
  const results: RankedResult[] = (data.pages ?? [])
    .filter((page) => gameDescription.test(page.description ?? ""))
    .map((page, index) => ({
      externalId: String(page.id),
      title: page.title,
      subtitle: page.description,
      cover: page.thumbnail?.url
        ? page.thumbnail.url.startsWith("//")
          ? `https:${page.thumbnail.url}`
          : page.thumbnail.url
        : undefined,
      source: "Wikipedia",
      sourceUrl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.key)}`,
      searchTerms: [page.title],
      baseScore: Math.max(0, 75 - index),
    }));
  return ranked(query, results);
}

export async function searchCatalogProgressive(
  type: MediaType,
  query: string,
  onUpdate: (results: CatalogResult[], progress: SearchProgress) => void,
  signal?: AbortSignal,
): Promise<CatalogResult[]> {
  const q = query.trim();
  if (q.length < 2) {
    onUpdate([], { complete: true, cached: false });
    return [];
  }
  const key = `${type}:${normalize(q)}`;
  const cached = resultCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    onUpdate(cached.value, { complete: true, cached: true });
    return cached.value;
  }
  if (cached) resultCache.delete(key);
  let firstResults: CatalogResult[] = [];
  const publish = (results: CatalogResult[], complete: boolean) => {
    if (signal?.aborted) return;
    if (results.length || complete) {
      if (results.length) firstResults = results;
      onUpdate(results, { complete, cached: false });
    }
  };
  try {
    let finalResults: CatalogResult[];
    if (type === "series") {
      const directTask = withTimeout(
        (fastSignal) => searchSeriesDirect(q, fastSignal),
        FAST_TIMEOUT_MS,
        signal,
      )
        .then((results) => {
          if (results[0] && relevanceScore(q, [results[0].title]) >= 500)
            publish(results, false);
          return results;
        })
        .catch(() => []);
      const wikipediaTask = withTimeout(
        (fastSignal) => searchSeriesWikipediaBridge(q, fastSignal),
        FAST_TIMEOUT_MS,
        signal,
      )
        .then((results) => {
          if (results.length) publish(results, false);
          return results;
        })
        .catch(() => []);
      const fullTask = withTimeout(
        (enrichSignal) => searchSeries(q, enrichSignal),
        ENRICH_TIMEOUT_MS,
        signal,
      );
      await Promise.all([directTask, wikipediaTask]);
      finalResults = await fullTask;
    } else if (type === "book") {
      const direct = await withTimeout(
        (fastSignal) => searchBooksDirect(q, fastSignal),
        FAST_TIMEOUT_MS,
        signal,
      );
      if (direct[0] && relevanceScore(q, [direct[0].title]) >= 500)
        publish(direct, false);
      const confidence = direct[0] ? relevanceScore(q, [direct[0].title]) : 0;
      finalResults =
        confidence >= 900
          ? direct
          : await withTimeout(
              (enrichSignal) => searchBooks(q, enrichSignal),
              ENRICH_TIMEOUT_MS,
              signal,
            );
    } else {
      const wikipediaFast = withTimeout(
        (fastSignal) => searchWikipediaGamesFast(q, fastSignal),
        4000,
        signal,
      )
        .then((results) => {
          publish(results, false);
          return results;
        })
        .catch(() => []);
      const fullTask = withTimeout(
        (enrichSignal) => searchGames(q, enrichSignal),
        ENRICH_TIMEOUT_MS,
        signal,
      ).then((results) => {
        if (results.length) publish(results, false);
        return results;
      });
      await wikipediaFast;
      finalResults = await fullTask;
    }
    if (!finalResults.length && firstResults.length)
      finalResults = firstResults;
    resultCache.set(key, {
      value: finalResults,
      expiresAt: Date.now() + RESULT_TTL_MS,
    });
    publish(finalResults, true);
    return finalResults;
  } catch (error) {
    if (firstResults.length) {
      resultCache.set(key, {
        value: firstResults,
        expiresAt: Date.now() + RESULT_TTL_MS,
      });
      publish(firstResults, true);
      return firstResults;
    }
    throw error;
  }
}

export async function searchCatalog(
  type: MediaType,
  query: string,
  signal?: AbortSignal,
): Promise<CatalogResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  if (type === "game") return searchGames(q, signal);
  if (type === "series") return searchSeries(q, signal);
  return searchBooks(q, signal);
}
