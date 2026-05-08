import type { Article, LimitOption, SearchOptions } from "./types";

export const DEFAULT_LIMIT: LimitOption = 50;

export const normalizeLimit = (value: FormDataEntryValue | number | string | null): LimitOption => {
  if (value === "all") {
    return "all";
  }

  if (String(value) === "100") {
    return 100;
  }

  return DEFAULT_LIMIT;
};

// Keep search pure so it can be reused by UI tests and future data sources.
export const searchArticles = (articles: readonly Article[], options: SearchOptions): readonly Article[] => {
  const keyword = options.q.trim().toLocaleLowerCase();

  const limit = normalizeLimit(options.limit);

  const searchedArticles = articles
    .filter((article) => options.source === "" || article.source === options.source)
    .filter((article) => keyword === "" || article.title.toLocaleLowerCase().includes(keyword))
    .toSorted((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return limit === "all" ? searchedArticles : searchedArticles.slice(0, limit);
};

export const findArticle = (
  articles: readonly Article[],
  source: string,
  id: string
): Article | undefined => articles.find((article) => article.source === source && article.id === id);
