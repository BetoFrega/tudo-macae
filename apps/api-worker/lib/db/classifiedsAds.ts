import { createClassifiedsAdContext, type ClassifiedsAdDependencies } from "./classifiedsAdsContext";
import { createDraftStore, createMutationStore } from "./classifiedsAdsDrafts";
import { createManagementStore } from "./classifiedsAdsManagement";
import { createPublicAdReads } from "./classifiedsAdsPublic";
import { createPublicationWrites } from "./classifiedsAdsPublication";

export function createClassifiedsAdStores(dependencies: ClassifiedsAdDependencies) {
  const context = createClassifiedsAdContext(dependencies);
  const drafts = createDraftStore(context);
  return { drafts, mutations: createMutationStore(context), management: createManagementStore(context),
    ...createPublicAdReads(context), ...createPublicationWrites(context, drafts) };
}
