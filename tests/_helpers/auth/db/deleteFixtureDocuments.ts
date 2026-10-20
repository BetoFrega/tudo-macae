import { workerFixture } from "../helpers/workerFixture";

export async function deleteAdFixture(id: string) {
  if (!/^[A-Za-z0-9_-]+$/u.test(id)) throw new Error("Identificador de fixture inválido.");
  await workerFixture("/delete-ad", { id });
}

export async function deleteProfileFixture(id: string) {
  if (!/^[A-Za-z0-9_-]+$/u.test(id)) throw new Error("Identificador de fixture inválido.");
  await workerFixture("/delete-profile", { id });
}
