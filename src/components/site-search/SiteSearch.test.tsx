// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { SiteSearchForm } from "./SiteSearchForm";
import { SiteSearchResults } from "./SiteSearchResults";

const capture = vi.hoisted(() => vi.fn());
vi.mock("posthog-js", () => ({ default: { capture } }));
vi.mock("next/link", () => ({ default: (props: React.ComponentProps<"a">) => <a data-router="next" {...props} /> }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("application supplies PostHog to the shared form without query properties", () => {
  render(<SiteSearchForm surface="header" />);
  const form = screen.getByRole("search");
  form.addEventListener("submit", event => event.preventDefault());
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "private query" } });
  fireEvent.submit(form);
  expect(capture).toHaveBeenCalledExactlyOnceWith("site_search_submitted", { source_surface: "header" });
});

test("application supplies Next links and document navigation for Terms with bounded events", () => {
  render(
    <SiteSearchResults
      query="private query"
      response={{ outcome: "results", results: [
        { title: "Padaria", type: "business", path: "/negocio/b1/padaria", snippet: "" },
        { title: "Termos", type: "page", path: "/termos-e-condicoes", snippet: "" },
      ] }}
    />,
  );
  expect(screen.getByRole("link", { name: "Padaria" })).toHaveAttribute("data-router", "next");
  const terms = screen.getByRole("link", { name: "Termos" });
  expect(terms).not.toHaveAttribute("data-router");
  terms.addEventListener("click", event => event.preventDefault());
  fireEvent.click(terms);
  expect(capture).toHaveBeenCalledWith("site_search_result_clicked", { position: 2, result_type: "page", type_filter: "all" });
  expect(JSON.stringify(capture.mock.calls)).not.toMatch(/private|Padaria|termos/u);
});
