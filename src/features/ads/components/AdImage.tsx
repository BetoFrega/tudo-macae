import { PublicImage } from "@/integrations/public-images/PublicImage";

interface AdImageProps {
  src?: string | undefined;
  alt: string;
}

export function AdImage({ src, alt }: AdImageProps) {
  return (
    <div className="relative aspect-video w-full overflow-hidden bg-muted">
      {src
        ? (
            <PublicImage
              src={src}
              alt={alt}
              fill
              loading="lazy"
              className={`
                object-cover transition-transform duration-300
                group-hover:scale-105
              `}
              sizes="(min-width: 768px) 370px, 95vw"
            />
          )
        : (
            <div className={`
              flex size-full items-center justify-center text-muted-foreground
            `}
            >
              <span className="text-sm">Sem foto</span>
            </div>
          )}
    </div>
  );
}
