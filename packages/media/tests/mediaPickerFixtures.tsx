import { fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "./uiFixtures";
import userEvent from "@testing-library/user-event";
import { expect, vi } from "vitest";
import type { MediaOption, MediaOptionsResult } from "@tudomacae/media/options";
import { MediaPicker } from "@tudomacae/media/ui";

export function articleImage(fields: Partial<MediaOption> & { id: string; alt: string }): MediaOption {
  return {
    kind: "article-image",
    caption: "",
    provenance: {
      origin: "own-production",
      creator: "Maria Souza",
      credit: "Foto: Maria Souza/Tudo Macaé",
      displayBasis: "own-production",
      acquiredAt: 1777000000000,
    },
    status: "staged",
    revision: 1,
    mimeType: "image/webp",
    url: `https://storage.test/media/${fields.id}.webp`,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...fields,
  };
}

export const prefeitura = articleImage({
  id: "media-prefeitura",
  alt: "Fachada da Prefeitura de Macaé",
  caption: "Sede da Prefeitura, no centro",
});

export const orla = articleImage({
  id: "media-orla",
  alt: "Praia dos Cavaleiros ao amanhecer",
});

// A kind this slice does not ship: the picker's promise is that it never
// offers one, and only a media of another kind can hold it to that.
export const entrevista = {
  ...articleImage({ id: "media-entrevista", alt: "Trecho da entrevista" }),
  kind: "sound-bite",
} as unknown as MediaOption;

/**
 * A library that answers like the real one: only the asked kind comes back,
 * and a media registered through the picker is there on the next read.
 */
export function fakeLibrary(initial: MediaOption[]) {
  const stored = [...initial];
  const loadAction = async (
    kind: string,
    _cursor?: string,
  ): Promise<MediaOptionsResult> => ({
    success: true,
    options: stored.filter(media => media.kind === kind),
  });

  return {
    stored,
    loadAction: vi.fn(loadAction),
    createAction: vi.fn(async (formData: FormData): Promise<import("@tudomacae/media/form").CreateMediaResult> => {
      const registered = articleImage({
        id: `media-${stored.length + 1}`,
        kind: formData.get("kind") as MediaOption["kind"],
        alt: formData.get("alt") as string,
        caption: (formData.get("caption") as string) ?? "",
      });
      // A fresh read need not order the newly registered media first. Keeping
      // it last makes the picker prove it selects by the returned id.
      stored.push(registered);
      return { success: true as const, mediaId: registered.id };
    }),
  };
}

export function renderPicker(library: ReturnType<typeof fakeLibrary>, resolveAction?: (id: string) => Promise<MediaOption | null>) {
  const onSelectAction = vi.fn();

  render(
    <MediaPicker
      kind="article-image"
      loadAction={library.loadAction}
      onCreateAction={library.createAction}
      onSelectAction={onSelectAction}
      resolveAction={resolveAction ?? (async () => null)}
    />,
  );

  return { onSelectAction };
}

export async function openPicker(library: ReturnType<typeof fakeLibrary>) {
  const rendered = renderPicker(library);
  await userEvent.click(screen.getByRole("button", { name: "Escolher mídia" }));
  return rendered;
}

export async function fillNewMediaForm() {
  fireEvent.change(screen.getByLabelText("Arquivo"), {
    target: { files: [new File(["bytes"], "orla.webp", { type: "image/webp" })] },
  });
  await waitFor(() => expect(screen.getByLabelText("Arquivo")).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Texto alternativo"), { target: { value: orla.alt } });
  fireEvent.change(screen.getByLabelText("Autoria"), { target: { value: "Maria Souza" } });
  fireEvent.change(screen.getByLabelText("Crédito"), { target: { value: "Foto: Maria Souza/Tudo Macaé" } });
  fireEvent.change(screen.getByLabelText("Data de aquisição"), {
    target: { value: "2026-08-20T14:30" },
  });
}

export function option(alt: string) {
  return screen.getByRole("button", { name: new RegExp(alt) });
}
