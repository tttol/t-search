import "./styles.css";
import { DEFAULT_LIMIT, findArticle, normalizeLimit, searchArticles } from "./search";
import type { Article, ArticlesDocument, SearchOptions, SourcesDocument } from "./types";

const app = document.querySelector<HTMLDivElement>("#app");

const sourceOptions = [
  { id: "", label: "All" },
  { id: "qiita", label: "Qiita" },
  { id: "zenn", label: "Zenn" },
  { id: "blog", label: "Blog" }
] as const;

const limitOptions = [50, 100, "all"] as const;

const state = {
  articles: [] as readonly Article[],
  sources: [] as SourcesDocument["items"],
  searchOptions: {
    q: "",
    source: "",
    limit: DEFAULT_LIMIT
  } satisfies SearchOptions,
  isComposing: false,
  selectedArticle: undefined as Article | undefined
};

const loadJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(path, { cache: "no-cache" });

  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status}`);
  }

  return await response.json() as T;
};

const readSearchOptions = (): SearchOptions => {
  const form = document.querySelector<HTMLFormElement>("#search-form");

  const formData = new FormData(form ?? undefined);

  return {
    q: String(formData.get("q") ?? ""),
    source: String(formData.get("source") ?? ""),
    limit: normalizeLimit(formData.get("limit") ?? DEFAULT_LIMIT)
  };
};

const getFocusedField = (): {
  readonly name: string;
  readonly selectionStart: number | null;
  readonly selectionEnd: number | null;
} | undefined => {
  const element = document.activeElement;

  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
    return undefined;
  }

  if (element.name === "") {
    return undefined;
  }

  return {
    name: element.name,
    selectionStart: element instanceof HTMLInputElement ? element.selectionStart : null,
    selectionEnd: element instanceof HTMLInputElement ? element.selectionEnd : null
  };
};

const restoreFocusedField = (focusedField: ReturnType<typeof getFocusedField>): void => {
  if (focusedField === undefined) {
    return;
  }

  const element = document.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${focusedField.name}"]`);

  if (element === null) {
    return;
  }

  element.focus();

  if (element instanceof HTMLInputElement && focusedField.selectionStart !== null) {
    element.setSelectionRange(focusedField.selectionStart, focusedField.selectionEnd);
  }
};

const createElement = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  textContent?: string
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tagName);

  if (className !== undefined) {
    element.className = className;
  }

  if (textContent !== undefined) {
    element.textContent = textContent;
  }

  return element;
};

// Use DOM APIs instead of HTML strings so fetched feed content cannot execute as markup.
const formatDate = (value: string): string => new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date(value));

const sourceLabel = (source: string): string => {
  const fixedSource = sourceOptions.find((item) => item.id === source)?.label;

  return fixedSource ?? state.sources.find((item) => item.id === source)?.label ?? source;
};

const safeHttpsUrl = (value: string): string | undefined => {
  try {
    const url = new URL(value);

    // Feed data is untrusted, so only browser-safe HTTPS links are rendered.
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};

const createExternalLink = (url: string, label: string, className?: string): HTMLElement => {
  const safeUrl = safeHttpsUrl(url);

  if (safeUrl === undefined) {
    return createElement("span", className, "無効なURL");
  }

  const link = createElement("a", className, label);

  link.href = safeUrl;
  link.target = "_blank";
  link.rel = "noreferrer";

  return link;
};

const createTagRow = (tags: readonly string[]): HTMLDivElement => {
  const row = createElement("div", "tag-row");

  row.append(...tags.map((tag) => createElement("span", undefined, tag)));

  return row;
};

const createArticleCard = (article: Article): HTMLElement => {
  const card = createElement("article", "article-card");

  const meta = createElement("div", "article-meta");

  const publishedAt = createElement("time", undefined, formatDate(article.publishedAt));

  const title = createElement("h2", undefined, article.title);

  const actions = createElement("div", "article-actions");

  const detailButton = createElement("button", undefined, "詳細");

  publishedAt.dateTime = article.publishedAt;

  meta.append(createElement("span", undefined, sourceLabel(article.source)), publishedAt);

  detailButton.type = "button";
  detailButton.dataset.detailSource = article.source;
  detailButton.dataset.detailId = article.id;

  actions.append(detailButton, createExternalLink(article.url, "開く"));

  card.append(meta, title, createTagRow(article.tags), actions);

  return card;
};

const createDetailDialog = (): HTMLDialogElement | undefined => {
  if (state.selectedArticle === undefined) {
    return undefined;
  }

  const article = state.selectedArticle;

  const dialog = createElement("dialog", "detail-dialog");

  const head = createElement("div", "dialog-head");

  const closeButton = createElement("button", undefined, "×");

  const title = createElement("h2", undefined, article.title);

  const url = createElement("p", "detail-url", article.url);

  closeButton.type = "button";
  closeButton.dataset.closeDetail = "true";
  closeButton.ariaLabel = "閉じる";

  dialog.open = true;

  head.append(createElement("p", undefined, `${sourceLabel(article.source)} / ${formatDate(article.publishedAt)}`), closeButton);

  dialog.append(head, title, url, createTagRow(article.tags), createExternalLink(article.url, "記事を開く", "primary-link"));

  return dialog;
};

const createSearchForm = (options: SearchOptions): HTMLFormElement => {
  const form = createElement("form", "search-panel");

  const keywordLabel = createElement("label");

  const keyword = createElement("input");

  const sourceLabelElement = createElement("label");

  const source = createElement("select");

  const limitLabel = createElement("label");

  const limit = createElement("select");

  form.id = "search-form";

  keyword.name = "q";
  keyword.value = options.q;
  keyword.type = "search";
  keyword.placeholder = "keyword";

  source.name = "source";

  limit.name = "limit";

  source.append(...sourceOptions.map((item) => {
    const option = createElement("option", undefined, item.label);

    option.value = item.id;
    option.selected = options.source === item.id;

    return option;
  }));

  limit.append(...limitOptions.map((item) => {
    const option = createElement("option", undefined, String(item));

    option.value = String(item);
    option.selected = options.limit === item;

    return option;
  }));

  keywordLabel.append(createElement("span", undefined, "検索"), keyword);

  sourceLabelElement.append(createElement("span", undefined, "Source"), source);

  limitLabel.append(createElement("span", undefined, "Limit"), limit);

  form.append(keywordLabel, sourceLabelElement, limitLabel);

  keyword.addEventListener("compositionstart", () => {
    state.isComposing = true;
  });

  keyword.addEventListener("compositionend", () => {
    state.isComposing = false;
    render();
  });

  form.addEventListener("input", () => {
    if (!state.isComposing) {
      render();
    }
  });

  return form;
};

const render = (): void => {
  if (app === null) {
    return;
  }

  const focusedField = getFocusedField();

  state.searchOptions = readSearchOptions();

  const options = state.searchOptions;

  const articles = searchArticles(state.articles, options);

  const main = createElement("main");

  const header = createElement("header", "app-header");

  const resultHead = createElement("section", "result-head");

  const grid = createElement("section", "article-grid");

  const detail = createDetailDialog();

  header.append(createElement("h1", undefined, "T Search"), createElement("p", undefined, "Qiita、Zenn、Blogの記事タイトルを横断検索します。"));

  resultHead.append(createElement("p", undefined, `${articles.length}件を表示`));

  grid.append(...articles.map(createArticleCard));

  main.append(header, createSearchForm(options), resultHead, grid);

  if (detail !== undefined) {
    main.append(detail);
  }

  app.replaceChildren(main);

  document.querySelectorAll<HTMLButtonElement>("[data-detail-source]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedArticle = findArticle(state.articles, button.dataset.detailSource ?? "", button.dataset.detailId ?? "");
      render();
    });
  });

  document.querySelector("[data-close-detail]")?.addEventListener("click", () => {
    state.selectedArticle = undefined;
    render();
  });

  restoreFocusedField(focusedField);
};

const renderError = (error: unknown): void => {
  if (app === null) {
    return;
  }

  const main = createElement("main");

  const header = createElement("header", "app-header");

  const errorBox = createElement("pre", "error-box", error instanceof Error ? error.message : String(error));

  header.append(createElement("h1", undefined, "T Search"), createElement("p", undefined, "データの読み込みに失敗しました。"));

  main.append(header, errorBox);

  app.replaceChildren(main);
};

try {
  const [articlesDocument, sourcesDocument] = await Promise.all([
    loadJson<ArticlesDocument>("./articles.json"),
    loadJson<SourcesDocument>("./sources.json")
  ]);

  state.articles = articlesDocument.items;
  state.sources = sourcesDocument.items.filter((source) => source.enabled);

  render();
} catch (error) {
  renderError(error);
}
