export type AdStatus = "paused" | "active";

export interface AdImage {
  id: string;
  path: string;
  url?: string | undefined;
  uploadRevision?: number | undefined;
  title?: string | undefined;
  description?: string | undefined;
  order: number;
  pending?: boolean;
}

export interface AdRecord {
  categoryId: string;
  subcategoryId: string;
  advertiserProfileId: string;
  title: string;
  slug: string;
  text: string;
  userId: string;
  status: AdStatus;
  images: AdImage[];
}

export interface AdData extends AdRecord {
  id: string;
  createdAt: number;
  revision?: number | undefined;
  updatedAt?: number | undefined;
}
