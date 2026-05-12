import "./styles.css";
import { DEFAULT_LIMIT, normalizeLimit, searchArticles } from "./search";
import type { Article, ArticlesDocument, SearchOptions, SourcesDocument } from "./types";

const app = document.querySelector<HTMLDivElement>("#app");

const sourceOptions = [
  { id: "", label: "All" },
  { id: "qiita", label: "Qiita" },
  { id: "zenn", label: "Zenn" },
  { id: "blog", label: "Blog" }
] as const;

const limitOptions = [50, 100, "all"] as const;

type Theme = "light" | "dark";

const themeStorageKey = "t-search-theme";

const sourceIcons: Readonly<Record<string, string>> = {
  qiita: "./images/qiita-icon.png",
  zenn: "./images/logo-only.svg",
  blog: "./images/blog.jpg"
};

const readStoredTheme = (): Theme | undefined => {
  try {
    const storedTheme = localStorage.getItem(themeStorageKey);

    return storedTheme === "light" || storedTheme === "dark" ? storedTheme : undefined;
  } catch {
    return undefined;
  }
};

const writeStoredTheme = (theme: Theme): void => {
  try {
    localStorage.setItem(themeStorageKey, theme);
  } catch {
    return;
  }
};

const readInitialTheme = (): Theme => {
  const storedTheme = readStoredTheme();

  if (storedTheme !== undefined) {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const state = {
  articles: [] as readonly Article[],
  sources: [] as SourcesDocument["items"],
  searchOptions: {
    q: "",
    source: "",
    limit: DEFAULT_LIMIT
  } satisfies SearchOptions,
  theme: readInitialTheme(),
  isComposing: false
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
    selectionStart: element instanceof HTMLInputElement && element.type === "search" ? element.selectionStart : null,
    selectionEnd: element instanceof HTMLInputElement && element.type === "search" ? element.selectionEnd : null
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

const createSourceBadge = (source: string): HTMLSpanElement => {
  const badge = createElement("span", "source-badge");

  const iconPath = sourceIcons[source];

  if (iconPath !== undefined) {
    const icon = createElement("img", "source-icon");

    icon.src = iconPath;
    icon.alt = "";
    icon.loading = "lazy";
    icon.decoding = "async";

    badge.append(icon);
  }

  badge.append(createElement("span", undefined, sourceLabel(source)));

  return badge;
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

const createTagRow = (tags: readonly string[]): HTMLDivElement => {
  const row = createElement("div", "tag-row");

  row.append(...tags.map((tag) => createElement("span", undefined, tag)));

  return row;
};

const createArticleCard = (article: Article): HTMLElement => {
  const safeUrl = safeHttpsUrl(article.url);

  const card = createElement(safeUrl === undefined ? "article" : "a", "article-card");

  const meta = createElement("div", "article-meta");

  const publishedAt = createElement("time", undefined, formatDate(article.publishedAt));

  const title = createElement("h2", undefined, article.title);

  publishedAt.dateTime = article.publishedAt;

  meta.append(createSourceBadge(article.source), publishedAt);

  if (safeUrl !== undefined && card instanceof HTMLAnchorElement) {
    card.href = safeUrl;
    card.target = "_blank";
    card.rel = "noreferrer";
  }

  card.append(meta, title, createTagRow(article.tags));

  return card;
};

const applyTheme = (theme: Theme): void => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
};

const createThemeToggle = (theme: Theme): HTMLButtonElement => {
  const button = createElement("button", "theme-toggle", theme === "dark" ? "Light" : "Dark");

  button.type = "button";
  button.setAttribute("aria-pressed", String(theme === "dark"));
  button.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  button.addEventListener("click", () => {
    const nextTheme = state.theme === "dark" ? "light" : "dark";

    state.theme = nextTheme;
    writeStoredTheme(nextTheme);
    render();
  });

  return button;
};

const createSearchForm = (options: SearchOptions): HTMLFormElement => {
  const form = createElement("form", "search-panel");

  const keywordLabel = createElement("label");

  const keyword = createElement("input");

  const sourceLabelElement = createElement("label");

  const source = createElement("select");

  const limitFieldset = createElement("fieldset", "limit-fieldset");

  const limitLegend = createElement("legend", undefined, "Limit");

  form.id = "search-form";

  keyword.name = "q";
  keyword.value = options.q;
  keyword.type = "search";
  keyword.placeholder = "keyword";

  source.name = "source";

  source.append(...sourceOptions.map((item) => {
    const option = createElement("option", undefined, item.label);

    option.value = item.id;
    option.selected = options.source === item.id;

    return option;
  }));

  limitFieldset.append(limitLegend, ...limitOptions.map((item) => {
    const radioLabel = createElement("label", "radio-option");

    const radio = createElement("input");

    radio.name = "limit";
    radio.type = "radio";
    radio.value = String(item);
    radio.checked = options.limit === item;

    radioLabel.append(radio, createElement("span", undefined, String(item)));

    return radioLabel;
  }));

  keywordLabel.append(createElement("span", undefined, "検索"), keyword);

  sourceLabelElement.append(createElement("span", undefined, "Source"), source);

  form.append(keywordLabel, sourceLabelElement, limitFieldset);

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

  const headerText = createElement("div");

  const resultHead = createElement("section", "result-head");

  const grid = createElement("section", "article-grid");

  applyTheme(state.theme);

  headerText.append(createElement("h1", undefined, "T Search"), createElement("p", undefined, "Qiita、Zenn、Blogの記事タイトルを横断検索します。"));

  header.append(headerText, createThemeToggle(state.theme));

  resultHead.append(createElement("p", undefined, `${articles.length}件を表示`));

  grid.append(...articles.map(createArticleCard));

  main.append(header, createSearchForm(options), resultHead, grid);

  app.replaceChildren(main);

  restoreFocusedField(focusedField);
};

const renderError = (error: unknown): void => {
  if (app === null) {
    return;
  }

  const main = createElement("main");

  const header = createElement("header", "app-header");

  const headerText = createElement("div");

  const errorBox = createElement("pre", "error-box", error instanceof Error ? error.message : String(error));

  applyTheme(state.theme);

  headerText.append(createElement("h1", undefined, "T Search"), createElement("p", undefined, "データの読み込みに失敗しました。"));

  header.append(headerText, createThemeToggle(state.theme));

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
