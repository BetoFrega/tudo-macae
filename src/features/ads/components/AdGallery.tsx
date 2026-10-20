"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";
import type { AdImage } from "@tudomacae/ads/types";
import { PublicImage } from "@/integrations/public-images/PublicImage";

interface AdGalleryProps {
  images: (AdImage & { url: string })[];
  title: string;
}

export function AdGallery({ images, title }: AdGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!images || images.length === 0) {
    return (
      <div className={`
        flex aspect-video w-full flex-col items-center justify-center rounded-lg
        bg-muted p-8 text-muted-foreground
      `}
      >
        <ImageOff className="mb-4 size-12" />
        <p>Este anúncio não possui fotos.</p>
      </div>
    );
  }

  const selectedImage = images[selectedIndex];

  return (
    <div className="space-y-4">
      {/* Main Viewer */}
      <div className={`
        relative aspect-video w-full overflow-hidden rounded-lg border
        bg-black/5
      `}
      >
        <PublicImage
          src={selectedImage.url}
          alt={selectedImage.title || title}
          fill
          loading="lazy"
          className="object-contain"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
        {(selectedImage.title || selectedImage.description) && (
          <div className={`
            absolute inset-x-0 bottom-0 bg-black/60 p-4 text-white
            backdrop-blur-sm
          `}
          >
            {selectedImage.title && (
              <h3 className="text-lg font-semibold">{selectedImage.title}</h3>
            )}
            {selectedImage.description && (
              <p className="text-sm opacity-90">{selectedImage.description}</p>
            )}
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="grid grid-cols-4 gap-4">
          {images.map((image, index) => (
            <button
              key={image.id}
              onClick={() => setSelectedIndex(index)}
              className={`
                relative aspect-square overflow-hidden rounded-md border-2
                transition-all
                ${
            index === selectedIndex
              ? "border-primary ring-2 ring-primary/20"
              : `
                border-transparent
                hover:border-primary/50
              `
            }
              `}
            >
              <PublicImage
                src={image.url}
                alt={image.title || `Foto ${index + 1}`}
                width={100}
                height={100}
                className="object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
