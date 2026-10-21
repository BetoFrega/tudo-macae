export function makeRandomString() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => (byte % 36).toString(36)).join("");
}
