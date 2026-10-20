import { ArrowRight } from "lucide-react";
import type { IdentityImage, IdentityLink } from "./rendering";
import type { BusinessCategory as Category } from "../../taxonomy";
import type { BusinessPublicData } from "../../business";
import { businessCanonicalPath } from "../../businessPresentation";
import { BusinessCard } from "./BusinessCard";
import { resolveBusinessActivities } from "../../resolveBusinessActivities";

interface CategoryBusinessPreviewProps {
  Link: IdentityLink;
  Image: IdentityImage;
  category: Category;
  categories: Category[];
  businesses: BusinessPublicData[];
}

export function CategoryBusinessPreview({
  category,
  Link,
  Image,
  categories,
  businesses,
}: CategoryBusinessPreviewProps) {
  return (
    <section
      id="negocios"
      aria-labelledby="category-businesses-title"
      className="scroll-mt-24 border-y border-foreground/20 py-7"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="category-businesses-title"
            className="text-2xl font-semibold tracking-tight"
          >
            Negócios de
            {" "}
            {category.name}
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Conheça quem vende, presta ou atende nas subcategorias desta categoria.
          </p>
        </div>
        {businesses.length > 0 && (
          <Link
            href={`/negocios?categoria=${encodeURIComponent(category.id)}&origem=category`}
            className="
              inline-flex min-h-11 items-center gap-2 font-semibold text-primary
              underline-offset-4
              hover:underline
            "
          >
            Ver todos os negócios de
            {" "}
            {category.name}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        )}
      </div>
      {businesses.length === 0
        ? (
            <p className="mt-5 text-sm text-muted-foreground">
              Ainda não há negócios nesta categoria.
            </p>
          )
        : (
            <div className="mt-5">
              {businesses.map(business => (
                <BusinessCard
                  Image={Image}
                  key={business.id}
                  business={business}
                  href={businessCanonicalPath(business)}
                  activities={resolveBusinessActivities(
                    business.activityAreas,
                    categories,
                  ).filter(activity => activity.categoryId === category.id)}
                  source="category"
                />
              ))}
            </div>
          )}
    </section>
  );
}
