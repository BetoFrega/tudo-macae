export function payload(id: string, file?: File) {
  const form = new FormData();
  form.set("images", JSON.stringify([{ id, title: "Frente", description: "Vista frontal", order: 0 }]));
  if (file) form.set("file-0", file);
  return form;
}

export const pathFor = (publicationId: string, uploadId: string) => `ad-images/${publicationId}/pending/${uploadId}.png`;
