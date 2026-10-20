import Image from "next/image";
import { X, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdImages } from "../../hooks/useAdImages";
import { VALID_IMAGE_TYPES_ACCEPT } from "@tudomacae/media/imageProcessing";
import { publishedPendingPhotoLoader } from "@/integrations/public-images/PublicImage";

/** An existing ad photo resizes through its authorized route; local previews and pending uploads render as originals. */
function AdFormImagePreview({ src, alt }: { src: string; alt: string }) {
  const authorizedPhotoRoute = src.startsWith("/api/anuncios/");
  return (
    <Image
      {...(authorizedPhotoRoute ? { loader: publishedPendingPhotoLoader } : {})}
      src={src}
      alt={alt}
      fill
      unoptimized={!authorizedPhotoRoute}
      className="object-cover"
    />
  );
}

export function AdFormImageSection({ maxOutputSize, showSaveStatus = false, onProcessingChange, captureCurrentPublication }: { maxOutputSize?: number; showSaveStatus?: boolean; onProcessingChange?: (processing: boolean) => void; captureCurrentPublication?: () => () => boolean } = {}) {
  const {
    images,
    uploadError,
    handleImageSelect,
    handleRemoveImage,
    handleImageMetadataChange,
  } = useAdImages(maxOutputSize, onProcessingChange, captureCurrentPublication);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Fotos do Anúncio</Label>
        <span
          data-testid="photo-counter"
          className="text-xs text-muted-foreground tabular-nums"
        >
          {images.length}
          /3
        </span>
      </div>

      <div className="grid gap-4">
        {images.map((image, index) => (
          <div
            key={image.fieldId}
            className="relative overflow-hidden rounded-xl bg-secondary/60"
          >
            <div className={`
              grid gap-4 p-4
              sm:grid-cols-[8rem_1fr_auto]
            `}
            >
              <div className={`
                relative aspect-video w-full shrink-0 overflow-hidden rounded-lg
                bg-muted
                sm:aspect-square sm:w-32
              `}
              >
                {image.pending
                  ? (
                      <div className="
                        flex size-full items-center justify-center text-center
                        text-sm text-muted-foreground
                      "
                      >
                        Envio incompleto
                      </div>
                    )
                  : (
                      <AdFormImagePreview
                        src={image.url}
                        alt={image.description || image.title || `Foto ${index + 1}`}
                      />
                    )}
              </div>

              <div className="flex-1 space-y-3">
                {showSaveStatus && !image.pending && (
                  <p className="text-xs text-muted-foreground">
                    {image.file ? "Ainda não salva. Clique em Continuar para salvar esta foto." : "Foto salva na publicação pendente."}
                  </p>
                )}
                {image.pending && (
                  <p
                    role="status"
                    className="text-sm text-destructive"
                  >
                    Esta foto não terminou de enviar. Remova-a e escolha novamente.
                  </p>
                )}
                <div className="grid gap-2">
                  <Label htmlFor={`title-${index}`}>
                    Título da imagem
                    <span className="font-normal text-muted-foreground">
                      (opcional)
                    </span>
                  </Label>
                  <Input
                    id={`title-${index}`}
                    value={image.title}
                    maxLength={140}
                    onChange={e => handleImageMetadataChange(index, "title", e.target.value)}
                    placeholder="Ex: Frente do veículo"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`desc-${index}`}>
                    Descrição
                    <span className="font-normal text-muted-foreground">
                      (opcional)
                    </span>
                  </Label>
                  <Input
                    id={`desc-${index}`}
                    value={image.description}
                    maxLength={300}
                    onChange={e => handleImageMetadataChange(index, "description", e.target.value)}
                    placeholder="Ex: Detalhe do para-choque"
                  />
                </div>
              </div>

              <div className="
                absolute right-6 mt-2 flex items-start
                sm:static sm:mt-0
              "
              >
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() => handleRemoveImage(index)}
                  className={`
                    bg-background/90 text-destructive shadow-sm
                    hover:text-destructive/90
                  `}
                  aria-label={`Remover foto ${index + 1}`}
                >
                  <X className="size-5" />
                </Button>
              </div>
            </div>
          </div>
        ))}

        {images.length < 3 && (
          <>
            <Label
              htmlFor="image-upload"
              className="
                group flex min-h-36 cursor-pointer flex-col items-center
                justify-center gap-3 rounded-xl border-2 border-dashed
                bg-secondary/30 p-6 text-center transition-colors
                focus-within:border-ring focus-within:ring-[3px]
                focus-within:ring-ring/50
                hover:border-primary/40 hover:bg-primary/5
              "
            >
              <div className="
                flex size-11 items-center justify-center rounded-xl
                bg-primary/10 text-primary transition-colors
                group-hover:bg-primary group-hover:text-primary-foreground
              "
              >
                <ImagePlus className="size-5" aria-hidden="true" />
              </div>
              <span className="space-y-1">
                <span className="block text-sm font-semibold text-foreground">
                  Adicionar foto
                </span>
                <span className="
                  block text-xs font-normal text-muted-foreground
                "
                >
                  JPEG, PNG, WebP ou GIF, até 20 MB
                </span>
              </span>
              <input
                id="image-upload"
                type="file"
                accept={VALID_IMAGE_TYPES_ACCEPT}
                className="sr-only"
                onChange={handleImageSelect}
              />
            </Label>
            {uploadError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {uploadError}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
