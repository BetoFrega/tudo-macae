import { expect, test } from "vitest";
import { input, setup, stored } from "./publicationDraftsFixtures";

test("only pending publications can be deleted and completion requires publication first", async () => {
  const drafts = setup();
  await drafts.save("owner", input);
  await expect(drafts.complete("owner", input.id)).rejects.toThrow("A publicação ainda não foi concluída.");
  await expect(drafts.delete("foreign", input.id)).rejects.toThrow("Publicação não encontrada nesta conta.");
  await drafts.startDelete("owner", input.id);
  expect(await drafts.read("owner", input.id)).toMatchObject({ deleting: true });
  await expect(drafts.publish("owner", input.id)).rejects.toThrow("sendo excluída");
  await drafts.delete("owner", input.id);
  expect(await drafts.read("owner", input.id)).toBeNull();
  await expect(drafts.delete("owner", input.id)).rejects.toThrow("Publicação não encontrada nesta conta.");
  for (const publicationState of ["publishing", "published"]) {
    const active = setup([{ ...stored, publicationState, status: "active" }]);
    await expect(active.delete("owner", input.id)).rejects.toThrow("Use a exclusão do anúncio publicado.");
    await active.complete("owner", input.id);
    await active.complete("owner", input.id);
    expect(await active.read("owner", input.id)).toMatchObject({ completed: true });
  }
});

test("an interrupted publication can be discarded without activation", async () => {
  const drafts = setup();
  await drafts.save("owner", input);
  await drafts.saveProfile("owner", { publicationId: input.id, title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] });
  await drafts.publish("owner", input.id);
  expect(await drafts.list("owner")).toHaveLength(1);
  await expect(drafts.startDelete("foreign", input.id)).rejects.toThrow("Publicação não encontrada nesta conta.");
  await drafts.startDelete("owner", input.id);
  expect(await drafts.read("owner", input.id)).toMatchObject({ deleting: true, published: false, completed: false });
  await expect(drafts.complete("owner", input.id)).rejects.toThrow("A publicação ainda não foi concluída.");
  await expect(drafts.publish("owner", input.id)).rejects.toThrow("sendo excluída");
  await drafts.delete("owner", input.id);
  expect(await drafts.read("owner", input.id)).toBeNull();
});

test("discarding an interrupted publication still waits for its photo writer", async () => {
  const drafts = setup([{ ...stored, publicationState: "publishing", pendingImageUploadReservations: [{ path: "ad-images/draft/pending/writer.webp", expiresAt: 2000 }] }]);
  await expect(drafts.startDelete("owner", input.id)).rejects.toThrow("Aguarde o envio das fotos terminar");
  expect(await drafts.read("owner", input.id)).toMatchObject({ published: true, completed: false });
});

test.each(["active", "paused"])("completed %s ads cannot use pending-publication deletion", async (status) => {
  const drafts = setup([{ ...stored, publicationState: "published", status }]);
  await expect(drafts.startDelete("owner", input.id)).rejects.toThrow("Use a exclusão do anúncio publicado.");
  expect(await drafts.read("owner", input.id)).toMatchObject({ completed: true });
});
