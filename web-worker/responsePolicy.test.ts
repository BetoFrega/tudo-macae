import { expect, test } from "vitest";
import { dynamicCacheControl, withResponsePolicy } from "./responsePolicy";

const answer = (init: ResponseInit) => withResponsePolicy({ fetch: (_request: Request, _env: Record<string, unknown>, _ctx: unknown) => new Response("body", init) })
  .fetch(new Request("https://www.tudomacae.com.br/minha-conta"), {}, undefined);

test("a response without a policy gets Next's dynamic default", async () => {
  const response = await answer({ status: 404, headers: { "content-type": "text/html" } });
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe(dynamicCacheControl);
  expect(response.headers.get("content-type")).toBe("text/html");
  expect(await response.text()).toBe("body");
});

test("a response that names its policy keeps it", async () => {
  const response = await answer({ headers: { "cache-control": "public, max-age=3600" } });
  expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
});
