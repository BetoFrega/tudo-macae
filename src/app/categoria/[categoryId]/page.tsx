import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/ui/loading";
import { getCategories } from "@/features/categories/actions/getCategories";

type CategoryPageProps = PageProps<"/categoria/[categoryId]">;

/**
 * Handles legacy URLs: /categoria/[categoryId]
 * Redirects to: /categoria/[categoryId]/[categorySlug]
 */
export default async function CategoryRedirectPage(props: CategoryPageProps) {
  return (
    <Suspense fallback={<Loading />}>
      <AsyncPageLoader {...props} />
    </Suspense>
  );
}

const AsyncPageLoader = async (props: CategoryPageProps) => {
  const { categoryId } = await props.params;

  const categories = await getCategories();
  const category = categories.find(c => c.id === categoryId);

  if (!category) {
    notFound();
  }

  permanentRedirect(`/categoria/${categoryId}/${category.slug}`);
};
