import { strict as assert } from "node:assert";
import type { createPublicationDrafts, PublicationRecord, PublicationProfileRecord } from "../publicationDrafts";

export async function run(module: { createPublicationDrafts: typeof createPublicationDrafts }) {
  let record: PublicationRecord | null = null;
  const profile: { current: PublicationProfileRecord | null } = { current: null };
  const drafts = module.createPublicationDrafts({
    now: () => 1000,
    store: {
      async read() { return record; },
      async list() { return record ? [record] : []; },
      async transact(_id, decide) {
        return decide({
          async read() { return record; },
          async readProfile() { return profile.current; },
          saveProfile(profileId, fields) {
            profile.current = fields;
            if (!record) throw new Error("Missing publication");
            record = { ...record, advertiserProfileId: profileId };
          },
          save(value) { record = value; },
          updatePublication(fields) {
            if (!record) throw new Error("Missing publication");
            record = { ...record, ...fields };
          },
          deletePublication() { record = null; },
        });
      },
    },
  });
  await drafts.save("owner", { id: "draft", title: "Bicicleta azul", text: "Bicicleta em bom estado", categoryId: "bikes", subcategoryId: "used" });
  assert.equal((await drafts.read("owner", "draft"))?.title, "Bicicleta azul");
  assert.equal((await drafts.list("owner")).length, 1);
  assert.equal(await drafts.saveProfile("owner", { publicationId: "draft", title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] }), "publication-draft");
  assert.equal(profile.current?.revision, 1);
  await drafts.saveProfile("owner", { publicationId: "draft", title: "Ana Silva", contacts: [{ number: "22999999999", isWhatsapp: true }] });
  assert.equal(profile.current?.revision, 2);
  assert.equal((await drafts.read("owner", "draft"))?.published, false);
  await drafts.publish("owner", "draft");
  await drafts.returnToPending("owner", "draft");
  assert.equal((await drafts.read("owner", "draft"))?.published, false);
  await drafts.publish("owner", "draft");
  await drafts.complete("owner", "draft");
  assert.equal((await drafts.list("owner")).length, 0);
  record = null;
  await drafts.save("owner", { id: "discard", title: "Bicicleta azul", text: "Bicicleta em bom estado", categoryId: "bikes", subcategoryId: "used" });
  await drafts.startDelete("owner", "discard");
  await drafts.delete("owner", "discard");
  assert.equal(await drafts.read("owner", "discard"), null);
}
