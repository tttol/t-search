import { XMLParser } from "fast-xml-parser";
import type { Article, ArticlesDocument, Source, SourcesDocument } from "./types";

type FetchResult = {
  readonly source: Source;
  readonly articles: readonly Article[];
};

type FeedEntry = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text"
});

const sourceLabels: Readonly<Record<string, string>> = {
  qiita: "Qiita",
  zenn: "Zenn",
  blog: "Blog"
};

const qiitaPerPage = 100;

const qiitaMaxPage = 100;

// RSS and Atom parsers return arrays only when multiple elements are present.
const asArray = <T>(value: T | readonly T[] | undefined): readonly T[] => {
  if (value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return [value as T];
};

const asString = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "object" && value !== null && "#text" in value) {
    return asString((value as FeedEntry)["#text"]);
  }

  return "";
};

const getUrlFromLink = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(getUrlFromLink).find((url) => url !== "") ?? "";
  }

  if (typeof value === "object" && value !== null) {
    const entry = value as FeedEntry;

    return asString(entry["@_href"] ?? entry["href"] ?? entry["#text"]);
  }

  return "";
};

const toIsoString = (value: string, fallback: string): string => {
  const time = Date.parse(value);

  return Number.isNaN(time) ? fallback : new Date(time).toISOString();
};

const getLastPathSegment = (url: string): string => {
  const parsed = new URL(url);

  const parts = parsed.pathname.split("/").filter((part) => part !== "");

  return parts.at(-1) ?? parsed.hostname;
};

const dedupeArticles = (articles: readonly Article[]): readonly Article[] => {
  const pairs = articles.map((article) => [`${article.source}:${article.id}`, article] as const);

  return [...new Map(pairs).values()];
};

const createSource = (
  id: string,
  itemCount: number,
  enabled: boolean
): Source => ({
  id,
  label: sourceLabels[id] ?? id,
  enabled,
  itemCount
});

export const normalizeQiitaItems = (items: readonly FeedEntry[]): readonly Article[] => items.map((item) => ({
  id: asString(item.id),
  source: "qiita",
  title: asString(item.title),
  url: asString(item.url),
  publishedAt: toIsoString(asString(item.created_at), new Date(0).toISOString()),
  updatedAt: toIsoString(asString(item.updated_at), toIsoString(asString(item.created_at), new Date(0).toISOString())),
  tags: asArray(item.tags as FeedEntry | readonly FeedEntry[] | undefined).map((tag) => asString(tag.name)).filter((tag) => tag !== "")
})).filter((article) => article.id !== "" && article.title !== "" && article.url !== "");

export const normalizeFeed = (xml: string, source: string): readonly Article[] => {
  const document = parser.parse(xml) as FeedEntry;

  const channel = ((document.rss as FeedEntry | undefined)?.channel ?? {}) as FeedEntry;

  const rssItems = asArray(channel.item as FeedEntry | readonly FeedEntry[] | undefined);

  const atomEntries = asArray((document.feed as FeedEntry | undefined)?.entry as FeedEntry | readonly FeedEntry[] | undefined);

  // Prefer RSS items when both shapes exist, because mixed feeds are usually RSS documents.
  const entries = rssItems.length > 0 ? rssItems : atomEntries;

  return entries.map((entry) => {
    const url = getUrlFromLink(entry.link);

    const publishedAt = toIsoString(asString(entry.pubDate ?? entry.published ?? entry.updated), new Date(0).toISOString());

    return {
      id: asString(entry.guid ?? entry.id) || getLastPathSegment(url),
      source,
      title: asString(entry.title),
      url,
      publishedAt,
      updatedAt: toIsoString(asString(entry.updated ?? entry.pubDate ?? entry.published), publishedAt),
      tags: asArray(entry.category as unknown | readonly unknown[] | undefined).map(asString).filter((tag) => tag !== "")
    };
  }).filter((article) => article.id !== "" && article.title !== "" && article.url !== "");
};

export const createDocuments = (
  results: readonly FetchResult[]
): { readonly articlesDocument: ArticlesDocument; readonly sourcesDocument: SourcesDocument } => {
  const articles = dedupeArticles(results.flatMap((result) => [...result.articles]))
    .toSorted((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const sources = results.map((result) => result.source).toSorted((a, b) => a.id.localeCompare(b.id));

  return {
    articlesDocument: {
      items: articles
    },
    sourcesDocument: {
      items: sources
    }
  };
};

const fetchQiitaItemsPage = async (
  userId: string,
  page: number
): Promise<readonly FeedEntry[]> => {
  const response = await fetch(`https://qiita.com/api/v2/users/${encodeURIComponent(userId)}/items?page=${page}&per_page=${qiitaPerPage}`);

  if (!response.ok) {
    throw new Error(`Qiita fetch failed: ${response.status}`);
  }

  return await response.json() as readonly FeedEntry[];
};

const fetchAllQiitaItems = async (
  userId: string,
  page = 1
): Promise<readonly FeedEntry[]> => {
  const items = await fetchQiitaItemsPage(userId, page);
  const isLastPage = items.length < qiitaPerPage || page >= qiitaMaxPage;

  if (isLastPage) {
    return items;
  }

  const nextItems = await fetchAllQiitaItems(userId, page + 1);

  return [...items, ...nextItems];
};

export const fetchQiita = async (userId: string): Promise<FetchResult> => {
  const items = await fetchAllQiitaItems(userId);
  const articles = normalizeQiitaItems(items);

  return {
    source: createSource("qiita", articles.length, true),
    articles
  };
};

export const fetchFeedSource = async (
  id: string,
  url: string
): Promise<FetchResult> => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${id} fetch failed: ${response.status}`);
  }

  const xml = await response.text();

  const articles = normalizeFeed(xml, id);

  return {
    source: createSource(id, articles.length, true),
    articles
  };
};

export const createDisabledSource = (id: string): Source => createSource(id, 0, false);
