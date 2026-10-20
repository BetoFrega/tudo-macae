// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AccountReminder } from "./AccountReminder";
import { ACCOUNT_REMINDER_CHANGED_EVENT } from "../accountReminderEvents";

const mocks = vi.hoisted(() => ({
  user: { uid: "first-account", emailVerified: true } as { uid: string; emailVerified: boolean } | null,
  getReminder: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/minha-conta/anuncios",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../AuthContext", () => ({
  useAuth: () => ({ user: mocks.user, verificationError: null }),
}));
vi.mock("../readAccountStatus", () => ({
  readAccountReminderFromBrowser: mocks.getReminder,
}));

const profileReminder = {
  text: "Há anúncios aguardando você completar o perfil.",
  label: "Ver anúncios",
  href: "/minha-conta/anuncios?filter=profile",
};
const publicationReminder = {
  text: "1 anúncio com publicação pendente.",
  label: "Ver anúncios",
  href: "/minha-conta/anuncios?filter=pending",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { uid: "first-account", emailVerified: true };
});

it("does not show a previous account reminder while the next account loads", async () => {
  mocks.getReminder.mockResolvedValueOnce(profileReminder).mockReturnValueOnce(new Promise(() => undefined));
  const view = render(<AccountReminder />);
  expect(await screen.findByText(profileReminder.text)).toBeVisible();

  mocks.user = { uid: "second-account", emailVerified: true };
  view.rerender(<AccountReminder />);

  expect(screen.queryByRole("complementary", { name: "Pendência da conta" })).not.toBeInTheDocument();
});

it("keeps the latest successful refresh when an older request finishes later", async () => {
  const older = deferred<typeof profileReminder>();
  const latest = deferred<typeof publicationReminder>();
  mocks.getReminder
    .mockResolvedValueOnce(profileReminder)
    .mockReturnValueOnce(older.promise)
    .mockReturnValueOnce(latest.promise);
  render(<AccountReminder />);
  expect(await screen.findByText(profileReminder.text)).toBeVisible();

  act(() => window.dispatchEvent(new Event(ACCOUNT_REMINDER_CHANGED_EVENT)));
  act(() => window.dispatchEvent(new Event(ACCOUNT_REMINDER_CHANGED_EVENT)));
  await act(async () => latest.resolve(publicationReminder));
  expect(await screen.findByText(publicationReminder.text)).toBeVisible();

  await act(async () => older.resolve(profileReminder));
  await waitFor(() => expect(screen.getByText(publicationReminder.text)).toBeVisible());
});

it("does not treat a failed refresh as proof that a reminder was resolved", async () => {
  mocks.getReminder.mockResolvedValueOnce(profileReminder).mockRejectedValueOnce(new Error("network"));
  render(<AccountReminder />);
  expect(await screen.findByText(profileReminder.text)).toBeVisible();

  act(() => window.dispatchEvent(new Event(ACCOUNT_REMINDER_CHANGED_EVENT)));

  await waitFor(() => expect(mocks.getReminder).toHaveBeenCalledTimes(2));
  expect(screen.getByText(profileReminder.text)).toBeVisible();
});
