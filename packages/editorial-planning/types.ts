import type { EditorialPriority, EditorialPriorityDecision, EditorialPriorityRecommendation, RecommendedEditorialPriority, ResolvedStoryPriority } from "./priority";
export interface Story {
  id: string;
  sectionId: string;
  fact: string;
  occurredAt: number;
  captureIds: string[];
  topicId?: string;
  hasArticle: boolean;
  queuePriority: EditorialPriority;
  priorityProvenance: ResolvedStoryPriority["provenance"];
  priorityRecommendation?: EditorialPriorityRecommendation;
  editorialPriorityDecision?: EditorialPriorityDecision;
  revision: number;
  createdAt: number;
}

export interface Topic {
  id: string;
  sectionId: string;
  name: string;
  slug: string;
  revision: number;
  mergedIntoTopicId?: string;
  createdAt: number;
}

export interface RegisterStoryInput {
  sectionId: string;
  fact: string;
  occurredAt: number;
  captureIds: string[];
  topicId?: string;
  idempotencyKey: string;
}

export type RegisterStoryResult
  = | { status: "created"; story: Story; correlationId: string }
    | { status: "replayed"; story: Story; correlationId: string }
    | { status: "conflict"; code: "idempotency_conflict" };

export interface RegisterTopicInput {
  sectionId: string;
  name: string;
  idempotencyKey: string;
}

export type RegisterTopicResult
  = | { status: "created"; topic: Topic; correlationId: string }
    | { status: "reused"; topic: Topic; correlationId: string }
    | { status: "replayed"; topic: Topic; correlationId: string }
    | { status: "conflict"; code: "idempotency_conflict" };

export interface AttachCaptureToStoryInput {
  storyId: string;
  captureId: string;
  expectedRevision: number;
  idempotencyKey: string;
}

export type AttachCaptureToStoryResult
  = | { status: "conflict"; code: "submission_pending" }
    | { status: "updated"; story: Story; correlationId: string }
    | { status: "replayed"; story: Story; correlationId: string }
    | { status: "unchanged"; story: Story }
    | { status: "conflict"; code: "idempotency_conflict" }
    | { status: "conflict"; code: "revision_conflict"; currentRevision: number };

export interface ChangeStoryTopicInput {
  storyId: string;
  topicId: string;
  expectedRevision: number;
  idempotencyKey: string;
}

export type ChangeStoryTopicResult
  = | {
    status: "updated";
    story: Story;
    correlationId: string;
    previousTopicId?: string;
  }
  | {
    status: "replayed";
    story: Story;
    correlationId: string;
    previousTopicId?: string;
  }
  | { status: "unchanged"; story: Story }
  | { status: "conflict"; code: "idempotency_conflict" }
  | { status: "conflict"; code: "revision_conflict"; currentRevision: number };

export interface RecommendStoryPriorityInput {
  storyId: string;
  priority: RecommendedEditorialPriority;
  rationale: string;
  expectedRevision: number;
  idempotencyKey?: string;
}

export interface SetStoryEditorialPriorityInput {
  storyId: string;
  priority: EditorialPriority;
  expectedRevision: number;
}

export type ChangeStoryPriorityResult
  = | { status: "updated"; story: Story; correlationId: string }
    | { status: "replayed"; story: Story; correlationId: string }
    | { status: "conflict"; code: "revision_conflict"; currentRevision: number };

export interface StoryQueueInput {
  section?: "active" | "suspended";
  limit?: number;
  cursor?: string;
}

export interface StoryQueuePage {
  stories: Story[];
  nextCursor?: string;
}

export interface StoryEvidenceSummary {
  captureCount: number;
  sourceCount: number;
  latestAccessedAt: number;
}

export interface StoryQueueReadItem {
  id: string;
  fact: string;
  occurredAt: number;
  priority: EditorialPriority;
  priorityProvenance: ResolvedStoryPriority["provenance"];
  revision: number;
  topic?: Topic;
  evidenceSummary: StoryEvidenceSummary;
}

export interface StoryQueueReadInput extends StoryQueueInput {
  requestId: string;
}

export interface StoryQueueReadPage {
  stories: StoryQueueReadItem[];
  requestId: string;
  nextCursor?: string;
}

export interface TopicStoriesInput {
  topicId: string;
  limit?: number;
  cursor?: string;
}

export interface TopicStoriesPage {
  stories: Story[];
  nextCursor?: string;
}

export interface TopicListInput {
  limit?: number;
  cursor?: string;
}

export interface TopicListPage {
  topics: Topic[];
  nextCursor?: string;
}

interface EditorialListReadInput {
  requestId: string;
  limit?: number;
  cursor?: string;
}

export interface TopicListReadInput extends EditorialListReadInput {
  name?: string;
}

export interface TopicListReadPage {
  topics: Topic[];
  requestId: string;
  nextCursor?: string;
}

export type { EditorialPriority, EditorialPriorityDecision, EditorialPriorityRecommendation, RecommendedEditorialPriority, ResolvedStoryPriority } from "./priority";
