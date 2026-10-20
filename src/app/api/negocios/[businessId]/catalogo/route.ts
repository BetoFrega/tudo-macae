import { offeringCatalog } from "@/packages/classifieds-api/offerings";

export async function GET(_request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const headers = { "Cache-Control": "private, no-store, max-age=0", "CDN-Cache-Control": "no-store" };
  try {
    const catalog = await offeringCatalog.readPublic(businessId);
    return Response.json(catalog, { status: catalog ? 200 : 404, headers });
  }
  catch { return Response.json(null, { status: 503, headers }); }
}
