export interface ArticleCacheSubject {
  id: string;
  slug: string;
}

export interface ArticlePublicationCacheSubject extends ArticleCacheSubject {
  storyId: string;
}

export interface TopicCacheSubject {
  id: string;
  slug: string;
}
