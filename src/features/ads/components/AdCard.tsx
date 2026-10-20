import Link from "next/link";
import { formatSaoPauloDate } from "@tudomacae/civil-time";
import { AdImage } from "./AdImage";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface AdCardProps {
  id: string;
  title: string;
  slug: string;
  categoryId: string;
  subcategoryId: string;
  categorySlug: string;
  subcategorySlug: string;
  categoryName: string;
  subcategoryName: string;
  text: string;
  createdAt: number;
  imageUrl?: string;
  className?: string;
}

export function AdCard({
  id,
  title,
  slug,
  categoryId,
  subcategoryId,
  categorySlug,
  subcategorySlug,
  categoryName,
  subcategoryName,
  text,
  createdAt,
  imageUrl,
  className,
}: AdCardProps) {
  const date = createdAt
    ? formatSaoPauloDate(createdAt)
    : "Data desconhecida";

  return (
    <Card className={cn(`
      group h-full overflow-hidden transition-all
      hover:shadow-lg
    `, className)}
    >
      <CardHeader className="p-0">
        <Link href={`/anuncio/${id}/${slug}`}>
          <AdImage src={imageUrl} alt={title} />
        </Link>
      </CardHeader>
      <CardContent className="p-4">
        <div className="
          flex flex-wrap items-start justify-between gap-x-2 gap-y-1
        "
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {categorySlug
              ? (
                  <Link href={`/categoria/${categoryId}/${categorySlug}`}>
                    <Badge
                      variant="secondary"
                      className={`
                        max-w-full shrink wrap-anywhere whitespace-normal
                        hover:bg-secondary/80
                      `}
                    >
                      {categoryName}
                    </Badge>
                  </Link>
                )
              : (
                  <Badge
                    variant="secondary"
                    className="
                      max-w-full shrink wrap-anywhere whitespace-normal
                    "
                  >
                    {categoryName}
                  </Badge>
                )}

            {subcategorySlug
              ? (
                  <Link
                    href={`/categoria/${categoryId}/${categorySlug}/${subcategoryId}/${subcategorySlug}`}
                  >
                    <span className={`
                      text-xs font-medium wrap-anywhere
                      hover:underline
                    `}
                    >
                      {subcategoryName}
                    </span>
                  </Link>
                )
              : (
                  <span className="text-xs font-medium wrap-anywhere">{subcategoryName}</span>
                )}
          </div>
          <span className="text-xs">{date}</span>
        </div>
      </CardContent>
      <Link href={`/anuncio/${id}/${slug}`} className="block flex-1">
        <CardContent>
          <h3 className={`
            mb-2 line-clamp-2 text-lg font-semibold wrap-anywhere
            transition-colors
            group-hover:text-primary
          `}
          >
            {title}
          </h3>
          <p className={`
            line-clamp-3 leading-relaxed whitespace-pre-wrap
            text-muted-foreground
          `}
          >
            {text}
          </p>
        </CardContent>
      </Link>
    </Card>
  );
}
