import { randomUUID } from "node:crypto";
import type { EditorialPersistence } from "@tudomacae/editorial-persistence";
import { createBlog, type BlogDependencies } from "@tudomacae/editorial-blog/blog";
import { createBlogStore, type BlogIdentity } from "./db/editorialBlog";

/** The Blog panel over the editorial D1; distribution and purge confirmation arrive through `synchronize`. */
export function createEditorialBlog(dependencies: {
  persistence: EditorialPersistence;
  identity: BlogIdentity;
  synchronize: BlogDependencies["synchronize"];
  now?: () => number;
  newId?: () => string;
}) {
  const now = dependencies.now ?? Date.now;
  return createBlog({
    ...createBlogStore(dependencies.persistence, dependencies.identity, now),
    now, newId: dependencies.newId ?? randomUUID, synchronize: dependencies.synchronize,
  });
}
