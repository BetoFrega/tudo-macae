/** Account contact details must never become a public editorial byline. */
export function publicEditorName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed && !trimmed.includes("@") ? trimmed : null;
}
