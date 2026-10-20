import articleData from "./data/articles.json";

interface DemoCorrection {
  correctedDaysAgo: number;
  summary: string;
}

interface DemoArticleBase {
  storyKey: string;
  title: string;
  body: string;
  createdDaysAgo: number;
}

export type DemoArticle = DemoArticleBase & (
  | { status: "draft" }
  | {
    status: "published";
    publishedDaysAgo: number;
    corrections?: DemoCorrection[];
  }
);

/** The Matérias of the demo mass, written as Blog posts through the API Worker. */
export const demoArticles: readonly DemoArticle[] = articleData as DemoArticle[];
