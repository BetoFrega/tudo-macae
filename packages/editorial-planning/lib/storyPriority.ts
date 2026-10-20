export const editorialPriorities = [
  "normal",
  "high",
  "urgent",
  "suspended",
] as const;
export const recommendedEditorialPriorities = [
  "normal",
  "high",
  "urgent",
] as const;

export type EditorialPriority = typeof editorialPriorities[number];
export type RecommendedEditorialPriority
  = typeof recommendedEditorialPriorities[number];

export interface EditorialPriorityRecommendation {
  priority: RecommendedEditorialPriority;
  rationale: string;
  editorId: string;
  createdAt: number;
  editorialClientId?: string;
  editorialDelegationId?: string;
}

export interface EditorialPriorityDecision {
  priority: EditorialPriority;
  editorId: string;
  createdAt: number;
}

export interface ResolvedStoryPriority {
  priority: EditorialPriority;
  provenance: "default" | "recommendation" | "editor";
}

export interface StoryQueuePosition {
  id: string;
  priority: EditorialPriority;
  createdAt: number;
}

export const editorialPriorityRankByValue: Record<EditorialPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  suspended: 3,
};

export function resolveStoryPriority({
  decision,
  recommendation,
}: {
  decision?: EditorialPriorityDecision;
  recommendation?: EditorialPriorityRecommendation;
}): ResolvedStoryPriority {
  if (decision) return { priority: decision.priority, provenance: "editor" };
  if (recommendation) {
    return { priority: recommendation.priority, provenance: "recommendation" };
  }
  return { priority: "normal", provenance: "default" };
}

export function compareStoryQueuePositions(
  left: StoryQueuePosition,
  right: StoryQueuePosition,
): number {
  return editorialPriorityRankByValue[left.priority]
    - editorialPriorityRankByValue[right.priority]
    || left.createdAt - right.createdAt
    || left.id.localeCompare(right.id);
}
