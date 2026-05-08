import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createDisabledSource, createDocuments, fetchFeedSource, fetchQiita } from "../src/fetchers";
import type { Article } from "../src/types";

type FetchResult = Awaited<ReturnType<typeof fetchQiita>>;

type FetchTask = {
  readonly id: string;
  readonly run: () => Promise<FetchResult>;
};

type FailedFetch = {
  readonly id: string;
  readonly reason: unknown;
};

type FetchOutcome =
  | {
    readonly status: "fetched";
    readonly id: string;
    readonly value: FetchResult;
  }
  | {
    readonly status: "rejected";
    readonly id: string;
    readonly reason: unknown;
  };

const publicDir = resolve("public");

const articlesPath = resolve(publicDir, "articles.json");

const sourcesPath = resolve(publicDir, "sources.json");

/**
 * Reads an optional environment variable and treats blank values as unset.
 */
const optionalEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();

  return value === "" ? undefined : value;
};

/**
 * Reads an existing file when present and lets non-missing file errors fail the script.
 */
const readExisting = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
};

/**
 * Writes a pretty-printed JSON file after ensuring its directory exists.
 */
const writeJson = async (path: string, value: unknown): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });

  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
};

/**
 * Formats an unknown failure reason for GitHub Actions logs.
 */
const formatReason = (reason: unknown): string => {
  if (reason instanceof Error) {
    return reason.stack ?? reason.message;
  }

  return String(reason);
};

/**
 * Logs the fetched article count and titles for one source.
 */
const logFetchedArticles = (source: string, articles: readonly Article[]): void => {
  console.log(`${source} has ${articles.length} articles.`);

  articles.forEach((article) => {
    console.log(`- ${article.title}`);
  });
};

/**
 * Logs fetch failures without stopping successful source processing.
 */
const logFailedFetches = (failedFetches: readonly FailedFetch[]): void => {
  failedFetches.forEach((failedFetch) => {
    console.error(`${failedFetch.id} fetch failed.`);
    console.error(formatReason(failedFetch.reason));
  });
};

/**
 * Runs one source fetch in isolation and converts thrown errors into outcomes.
 */
const runFetchTask = async (task: FetchTask): Promise<FetchOutcome> => {
  try {
    return {
      status: "fetched",
      id: task.id,
      value: await task.run()
    };
  } catch (error) {
    return {
      status: "rejected",
      id: task.id,
      reason: error
    };
  }
};

const generatedAt = new Date().toISOString();

const tasks = [
  optionalEnv("QIITA_USER_ID") === undefined ? undefined : { id: "qiita", run: () => fetchQiita(optionalEnv("QIITA_USER_ID") ?? "", generatedAt) },
  optionalEnv("ZENN_USER_ID") === undefined ? undefined : { id: "zenn", run: () => fetchFeedSource("zenn", `https://zenn.dev/${encodeURIComponent(optionalEnv("ZENN_USER_ID") ?? "")}/feed?all=1`, generatedAt) },
  optionalEnv("BLOG_FEED_URL") === undefined ? undefined : { id: "blog", run: () => fetchFeedSource("blog", optionalEnv("BLOG_FEED_URL") ?? "", generatedAt) }
].filter((task): task is FetchTask => task !== undefined);

const outcomes = await Promise.all(tasks.map(runFetchTask));

const succeeded = outcomes.filter((outcome): outcome is Extract<FetchOutcome, { readonly status: "fetched" }> => outcome.status === "fetched").map((outcome) => outcome.value);

const failed = outcomes
  .filter((outcome): outcome is Extract<FetchOutcome, { readonly status: "rejected" }> => outcome.status === "rejected")
  .map((outcome) => ({
    id: outcome.id,
    reason: outcome.reason
  }));

const existingArticles = await readExisting(articlesPath);

if (tasks.length === 0) {
  throw new Error("No sources configured. Set QIITA_USER_ID, ZENN_USER_ID, or BLOG_FEED_URL.");
}

succeeded.forEach((result) => {
  logFetchedArticles(result.source.label, result.articles);
});

logFailedFetches(failed);

if (succeeded.length === 0 && existingArticles !== undefined) {
  // Keep the last published dataset when every source fails.
  throw new Error("All sources failed. Existing articles.json was kept.");
}

if (succeeded.length === 0) {
  throw new Error("All sources failed and no existing articles.json exists.");
}

const configuredIds = [
  optionalEnv("QIITA_USER_ID") === undefined ? undefined : "qiita",
  optionalEnv("ZENN_USER_ID") === undefined ? undefined : "zenn",
  optionalEnv("BLOG_FEED_URL") === undefined ? undefined : "blog"
].filter((id): id is string => id !== undefined);

const succeededIds = new Set(succeeded.map((result) => result.source.id));

const disabledResults = configuredIds
  .filter((id) => !succeededIds.has(id))
  .map((id) => ({
    source: createDisabledSource(id),
    articles: []
  }));

const documents = createDocuments([...succeeded, ...disabledResults], generatedAt);

await writeJson(articlesPath, documents.articlesDocument);

await writeJson(sourcesPath, documents.sourcesDocument);
