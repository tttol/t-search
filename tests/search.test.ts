import { describe, expect, test } from "vitest";
import { findArticle, normalizeLimit, searchArticles } from "../src/search";
import type { Article, LimitOption } from "../src/types";

const articles: readonly Article[] = [
  {
    id: "rust-lambda",
    source: "qiita",
    title: "Rust Lambda Guide",
    url: "https://example.com/rust-lambda",
    publishedAt: "2026-05-05T00:00:00.000Z",
    updatedAt: "2026-05-05T00:00:00.000Z",
    tags: ["rust"]
  },
  {
    id: "vite-search",
    source: "zenn",
    title: "Vite Search UI",
    url: "https://example.com/vite-search",
    publishedAt: "2026-05-06T00:00:00.000Z",
    updatedAt: "2026-05-06T00:00:00.000Z",
    tags: ["typescript"]
  }
];

describe("searchArticles", () => {
  test("Searches titles without case sensitivity", () => {
    // GIVEN
    const expected = [articles[0]];

    // WHEN
    const actual = searchArticles(articles, { q: "lambda", source: "", limit: 50 });

    // THEN
    expect(actual).toEqual(expected);
  });

  test("Filters by source", () => {
    // GIVEN
    const expected = [articles[1]];

    // WHEN
    const actual = searchArticles(articles, { q: "", source: "zenn", limit: 50 });

    // THEN
    expect(actual).toEqual(expected);
  });

  test("Returns all matched articles when limit is all", () => {
    // GIVEN
    const expected = [articles[1], articles[0]];

    // WHEN
    const actual = searchArticles(articles, { q: "", source: "", limit: "all" });

    // THEN
    expect(actual).toEqual(expected);
  });
});

describe("normalizeLimit", () => {
  test.each([
    ["50", 50],
    ["100", 100],
    ["all", "all"],
    ["invalid", "all"]
  ] as const)("Normalizes %s", (value, expected: LimitOption) => {
    // GIVEN
    const input = value;

    // WHEN
    const actual = normalizeLimit(input);

    // THEN
    expect(actual).toBe(expected);
  });
});

describe("findArticle", () => {
  test("Finds an article by source and id", () => {
    // GIVEN
    const expected = articles[1];

    // WHEN
    const actual = findArticle(articles, "zenn", "vite-search");

    // THEN
    expect(actual).toEqual(expected);
  });
});
