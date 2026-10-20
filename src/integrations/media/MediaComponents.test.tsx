// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { MediaPicker } from "./MediaComponents";

vi.mock("@/features/media/createMedia", () => ({ createMedia: vi.fn() }));
vi.mock("@/features/media/actions/updateMedia", () => ({ updateMedia: vi.fn() }));
vi.mock("@/features/media/actions/getMediaOptions", () => ({ getMediaOptionById: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

test("composes the portable picker with bounded browser failure context and no private error text", async () => {
  window.history.replaceState({}, "", "/redacao/pautas/private-story-id?token=private");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  render(
    <MediaPicker
      kind="article-image"
      loadAction={async () => { throw new Error("provider credential detail"); }}
      onCreateAction={vi.fn()}
      onSelectAction={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Escolher mídia" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível ler o acervo.");
  expect(log).toHaveBeenCalledTimes(1);
  const event = JSON.parse(String(log.mock.calls[0]?.[0]));
  expect(event).toMatchObject({ event: "media.picker.read.failed", operation: "media.options.read",
    environment: expect.any(String), release: expect.any(String),
    route: "/redacao/pautas/[id]", service: "browser", statusClass: "unknown", outcome: "error" });
  expect(event.executionId).toEqual(expect.stringMatching(/^[a-f0-9-]{36}$/iu));
  expect(JSON.stringify(event)).not.toContain("private-story-id");
  expect(JSON.stringify(event)).not.toContain("token=private");
  expect(JSON.stringify(event)).not.toContain("credential detail");
});
