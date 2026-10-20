export interface MediaPublicationGrant {
  operationId: string;
  submissionId?: string;
  articleId: string;
  mediaId: string;
  revision: number;
  digest: string;
}

export function samePublicationGrant(left: MediaPublicationGrant, right: MediaPublicationGrant): boolean {
  return left.operationId === right.operationId && left.submissionId === right.submissionId
    && left.articleId === right.articleId && left.mediaId === right.mediaId
    && left.revision === right.revision && left.digest === right.digest;
}

export interface GrantedMediaContentDependencies {
  readAccess(articleId: string, mediaId: string): Promise<{
    grant: MediaPublicationGrant | null;
    published: boolean;
    receiptGrants: MediaPublicationGrant[];
  }>;
  readContent(mediaId: string, digest: string): Promise<{ bytes: Uint8Array; mimeType: string } | null>;
}

export function createGrantedMediaContent(dependencies: GrantedMediaContentDependencies) {
  return {
    async read(articleId: string, mediaId: string) {
      const access = await dependencies.readAccess(articleId, mediaId);
      const grant = access.grant;
      if (!access.published || !grant || grant.articleId !== articleId || grant.mediaId !== mediaId
        || !access.receiptGrants.some(item => samePublicationGrant(item, grant))) return null;
      return dependencies.readContent(mediaId, grant.digest);
    },
  };
}
