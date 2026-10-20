// @vitest-environment jsdom
import { StrictMode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import AdminError from "./error";

const capture = vi.hoisted(() => vi.fn());
vi.mock("posthog-js", () => ({ default: { capture } }));
beforeEach(() => capture.mockReset());

test("reports a private client render failure once and keeps retry available", () => {
  const error = new Error("Private editorial content and https://example.test/private?token=secret");
  const retry = vi.fn();
  const view = render(<StrictMode><AdminError error={error} retry={retry} /></StrictMode>);
  view.rerender(<StrictMode><AdminError error={error} retry={retry} /></StrictMode>);
  expect(capture).toHaveBeenCalledOnce();
  expect(capture).toHaveBeenCalledWith("admin_render_failed", {
    component: "AdminError", route: "/admin", service: "browser",
    environment: "test", release: "unknown", outcome: "error",
    $process_person_profile: false, $current_url: null, $pathname: null, $referrer: null,
  });
  expect(JSON.stringify(capture.mock.calls)).not.toContain(error.message);
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(retry).toHaveBeenCalledOnce();
});

test("a server failure with a digest does not duplicate its request diagnostic", () => {
  const error = Object.assign(new Error("server private failure"), { digest: "123456" });
  render(<AdminError error={error} retry={vi.fn()} />);
  expect(screen.getByRole("alert")).toBeVisible();
  expect(capture).not.toHaveBeenCalled();
});
