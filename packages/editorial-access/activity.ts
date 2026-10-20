export const EDITORIAL_ACTIVITY_RETENTION_DAYS = 365;

export const editorialActivityOperations = [
  "article.imagesProposed",
  "article.imageProposalAdjusted",
  "article.imageProposalReturned",
  "article.imageProposalDiscarded",
  "article.imagesApplied",
  "article.edited",
  "article.takenOffline",
  "article.republished",
  "publication.prepared",
  "publication.granted",
  "publication.completed",
  "publication.aborted",
  "article.publicationTimeChanged",
  "media.correctionProposed",
  "media.correctionApplied",
  "media.correctionRejected",
  "source.registered",
  "source.updated",
  "sourcePermission.granted",
  "sourcePermission.revoked",
  "sourcePermission.validityRead",
  "capture.registered",
  "capture.invalidationProposed",
  "capture.invalidationAccepted",
  "capture.invalidationRejected",
  "story.registered",
  "story.captureAttached",
  "story.reclassified",
  "topic.registered",
  "topic.merged",
  "story.topicAssociated",
  "story.topicRemoved",
  "story.priorityRecommended",
  "story.prioritySet",
  "story.queueRead",
  "article.listRead",
  "draft.created",
  "draft.updated",
  "draft.read",
  "source.listRead",
  "capture.listRead",
  "topic.listRead",
  "submission.created",
  "submission.changesRequested",
  "submission.rejected",
  "submission.superseded",
  "delegation.started",
  "delegation.completed",
  "delegation.failed",
  "delegation.abandoned",
  "client.registered",
  "credential.issued",
  "credential.revoked",
  "session.issued",
  "session.revoked",
  "media.uploadPrepared",
  "media.uploadFinalized",
  "media.searchRead",
] as const;

export const editorialActivityResults = ["completed"] as const;

export type EditorialActivityOperation
  = typeof editorialActivityOperations[number];
export type EditorialActivityResult = typeof editorialActivityResults[number];

export interface EditorialActivity {
  editorId: string;
  administratorId?: string;
  channel: "newsroom" | "administration" | "mcp";
  operation: EditorialActivityOperation;
  targetId: string;
  result: EditorialActivityResult;
  correlationId: string;
  createdAt: number;
  expiresAt: number;
  editorialClientId?: string;
  editorialDelegationId?: string;
  reason?: string;
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export function editorialActivityExpiresAt(createdAt: number): number {
  return createdAt + EDITORIAL_ACTIVITY_RETENTION_DAYS * DAY_IN_MILLISECONDS;
}
