import { afterEach, describe, expect, test, vi } from "vitest";
import { createDocuments, fetchQiita, normalizeFeed, normalizeQiitaItems } from "../src/fetchers";

const createQiitaItem = (id: string): Record<string, unknown> => ({
  id,
  title: `Qiita title ${id}`,
  url: `https://qiita.com/example/items/${id}`,
  created_at: "2026-05-01T00:00:00+09:00",
  updated_at: "2026-05-02T00:00:00+09:00",
  tags: [{ name: "rust" }]
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeQiitaItems", () => {
  test("Normalizes Qiita response", () => {
    // GIVEN
    const items = [
      {
        id: "abc",
        title: "Qiita title",
        url: "https://qiita.com/example/items/abc",
        created_at: "2026-05-01T00:00:00+09:00",
        updated_at: "2026-05-02T00:00:00+09:00",
        tags: [{ name: "rust" }]
      }
    ];

    const expected = [
      {
        id: "abc",
        source: "qiita",
        title: "Qiita title",
        url: "https://qiita.com/example/items/abc",
        publishedAt: "2026-04-30T15:00:00.000Z",
        updatedAt: "2026-05-01T15:00:00.000Z",
        tags: ["rust"]
      }
    ];

    // WHEN
    const actual = normalizeQiitaItems(items);

    // THEN
    expect(actual).toEqual(expected);
  });
});

describe("fetchQiita", () => {
  test("Fetches all Qiita pages until the last page", async () => {
    // GIVEN
    const firstPageItems = Array.from({ length: 100 }, (_, index) => createQiitaItem(`page-1-${index}`));
    const secondPageItems = [createQiitaItem("page-2-0")];
    const pages: Readonly<Record<string, readonly Record<string, unknown>[]>> = {
      "1": firstPageItems,
      "2": secondPageItems
    };
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const page = new URL(String(url)).searchParams.get("page") ?? "";
      return new Response(JSON.stringify(pages[page] ?? []));
    });
    const expected = {
      source: {
        id: "qiita",
        label: "Qiita",
        enabled: true,
        itemCount: 101
      },
      articles: normalizeQiitaItems([...firstPageItems, ...secondPageItems])
    };
    vi.stubGlobal("fetch", fetchMock);

    // WHEN
    const actual = await fetchQiita("example");

    // THEN
    expect(actual).toEqual(expected);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("normalizeFeed", () => {
  test("Normalizes RSS feed", () => {
    // GIVEN
    const xml = `<?xml version="1.0"?><rss><channel><item><title>Blog title</title><link>https://example.com/posts/1</link><guid>post-1</guid><pubDate>Tue, 05 May 2026 00:00:00 GMT</pubDate><category>api</category></item></channel></rss>`;

    const expected = [
      {
        id: "post-1",
        source: "blog",
        title: "Blog title",
        url: "https://example.com/posts/1",
        publishedAt: "2026-05-05T00:00:00.000Z",
        updatedAt: "2026-05-05T00:00:00.000Z",
        tags: ["api"]
      }
    ];

    // WHEN
    const actual = normalizeFeed(xml, "blog");

    // THEN
    expect(actual).toEqual(expected);
  });

  test("Normalizes Atom feed", () => {
    // GIVEN
    const xml = `<?xml version="1.0"?><feed><entry><title>Zenn title</title><link href="https://zenn.dev/example/articles/abc"/><id>abc</id><published>2026-05-05T00:00:00Z</published><updated>2026-05-06T00:00:00Z</updated></entry></feed>`;

    const expected = [
      {
        id: "abc",
        source: "zenn",
        title: "Zenn title",
        url: "https://zenn.dev/example/articles/abc",
        publishedAt: "2026-05-05T00:00:00.000Z",
        updatedAt: "2026-05-06T00:00:00.000Z",
        tags: []
      }
    ];

    // WHEN
    const actual = normalizeFeed(xml, "zenn");

    // THEN
    expect(actual).toEqual(expected);
  });
});

describe("createDocuments", () => {
  test("Deduplicates by source and id", () => {
    // GIVEN
    const article = {
      id: "same",
      source: "blog",
      title: "Same title",
      url: "https://example.com/same",
      publishedAt: "2026-05-05T00:00:00.000Z",
      updatedAt: "2026-05-05T00:00:00.000Z",
      tags: []
    };

    const expected = [article];

    // WHEN
    const actual = createDocuments([
      {
        source: {
          id: "blog",
          label: "Blog",
          enabled: true,
          itemCount: 2
        },
        articles: [article, article]
      }
    ]).articlesDocument.items;

    // THEN
    expect(actual).toEqual(expected);
  });
});
