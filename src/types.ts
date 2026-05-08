// Public JSON shapes shared by the fetch script and browser UI.
export type Article = {
  readonly id: string;
  readonly source: string;
  readonly title: string;
  readonly url: string;
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly tags: readonly string[];
};

export type ArticlesDocument = {
  readonly generatedAt: string;
  readonly items: readonly Article[];
};

export type Source = {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly lastFetchedAt: string | null;
  readonly itemCount: number;
};

export type SourcesDocument = {
  readonly generatedAt: string;
  readonly items: readonly Source[];
};

export type LimitOption = 50 | 100 | "all";

export type SearchOptions = {
  readonly q: string;
  readonly source: string;
  readonly limit: LimitOption;
};
