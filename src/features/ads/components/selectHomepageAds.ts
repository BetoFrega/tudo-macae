const COMPACT_AD_LIMIT = 4;
export const HOMEPAGE_AD_LIMIT = 6;

export interface HomepageAdSelection<T> {
  ads: T[];
  desktopOnlyFromIndex: number;
}

export function selectHomepageAds<T>(ads: readonly T[]): HomepageAdSelection<T> {
  return {
    ads: ads.slice(0, HOMEPAGE_AD_LIMIT),
    desktopOnlyFromIndex: COMPACT_AD_LIMIT,
  };
}
