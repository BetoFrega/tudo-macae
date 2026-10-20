import { makeRandomString } from "../../makeRandomString";

export function makeTestPassword() {
  return `testpassword-${makeRandomString()}`;
}
