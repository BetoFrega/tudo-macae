import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/ui/loading";
import { getAd } from "@/features/ads/actions/getAd";

type AdPageProps = PageProps<"/anuncio/[id]">;
/**
 * This page handles legacy URLs without slugs.
 * It redirects to the new SEO-friendly URL format: /anuncio/[id]/[slug]
 */

export default async function AdPage(props: AdPageProps) {
  return (
    <Suspense fallback={<Loading />}>
      <AsyncPageLoader {...props} />
    </Suspense>
  );
}

const AsyncPageLoader = async (props: AdPageProps) => {
  const { id } = await props.params;

  const ad = await getAd(id);
  if (!ad) {
    notFound();
  }

  // Redirect to the canonical URL with slug
  permanentRedirect(`/anuncio/${id}/${ad.slug}`);
};
