import { makeRandomString } from "../../makeRandomString";

export function makeTestEmail() {
  const randomString = makeRandomString();
  return `testemail-${randomString}@example.com`;
}
