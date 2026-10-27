// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AuthContext } from "@/features/authentication/AuthContext";
import { canManageAd } from "../actions/canManageAd";
import { AdManagementControls } from "./AdManagementControls";
import { useAdManagementPermission } from "./useAdManagementPermission";

vi.mock("../actions/canManageAd", () => ({ canManageAd: vi.fn() }));
vi.mock("./EditAdButton", () => ({ EditAdButton: () => <button>Editar Anúncio</button> }));
vi.mock("./DeleteAdButton", () => ({ DeleteAdButton: () => <button>Excluir</button> }));

function Probe({ adId }: { adId: string }) {
  const { allowed } = useAdManagementPermission(adId);
  return <output>{allowed ? "allowed" : "hidden"}</output>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("does not carry permission to another ad for the same signed-in user", async () => {
  let resolveFirst!: (allowed: { status: "allowed" | "denied" | "unavailable" }) => void;
  vi.mocked(canManageAd)
    .mockImplementationOnce(() => new Promise((resolve) => {
      resolveFirst = resolve;
    }))
    .mockResolvedValueOnce({ status: "denied" });
  const auth = {
    user: { uid: "holder", email: "holder@example.com" },
    isAdmin: false,
    isEditor: false,
    loading: false,
    logout: async () => {},
    login: async () => ({ success: true }),
  };
  const view = render(
    <AuthContext.Provider value={auth}>
      <Probe adId="owned-ad" />
    </AuthContext.Provider>,
  );
  await act(async () => resolveFirst({ status: "allowed" }));
  expect(screen.getByText("allowed")).toBeInTheDocument();

  view.rerender(
    <AuthContext.Provider value={auth}>
      <Probe adId="other-ad" />
    </AuthContext.Provider>,
  );
  expect(screen.getByText("hidden")).toBeInTheDocument();
  await act(async () => {});
  expect(canManageAd).toHaveBeenLastCalledWith("other-ad");
  expect(screen.getByText("hidden")).toBeInTheDocument();
});

test("rechecks a same-UID login and revoked administrator role before exposing a grant", async () => {
  let resolve!: (allowed: { status: "allowed" | "denied" | "unavailable" }) => void;
  vi.mocked(canManageAd).mockResolvedValueOnce({ status: "allowed" }).mockImplementation(() => new Promise((done) => {
    resolve = done;
  }));
  const auth = { user: { uid: "holder", email: "holder@example.com" }, isAdmin: true, isEditor: false, loading: false, logout: async () => {}, login: async () => ({ success: true }) };
  const renderProbe = (value: typeof auth | (Omit<typeof auth, "user"> & { user: null })) => <AuthContext.Provider value={value}><Probe adId="ad" /></AuthContext.Provider>;
  const view = render(renderProbe(auth));
  await act(async () => {});
  expect(screen.getByText("allowed")).toBeInTheDocument();
  view.rerender(renderProbe({ ...auth, isAdmin: false }));
  expect(screen.getByText("hidden")).toBeInTheDocument();
  await act(async () => resolve({ status: "allowed" }));
  expect(screen.getByText("allowed")).toBeInTheDocument();
  view.rerender(renderProbe({ ...auth, user: null }));
  expect(screen.getByText("hidden")).toBeInTheDocument();
  view.rerender(renderProbe({ ...auth, user: { ...auth.user }, isAdmin: false }));
  expect(screen.getByText("hidden")).toBeInTheDocument();
  await act(async () => resolve({ status: "denied" }));
  expect(screen.getByText("hidden")).toBeInTheDocument();
});

test("reports a rejected permission check as unavailable and recovers on retry", async () => {
  vi.mocked(canManageAd).mockRejectedValueOnce(new Error("network unavailable")).mockResolvedValueOnce({ status: "allowed" });
  const auth = { user: { uid: "owner", email: "owner@example.com" }, isAdmin: false, isEditor: false, loading: false, logout: async () => {}, login: async () => ({ success: true }) };
  function StatusProbe() {
    const { allowed, unavailable, retry } = useAdManagementPermission("ad");
    return <button onClick={retry}>{unavailable ? "unavailable" : allowed ? "allowed" : "hidden"}</button>;
  }
  render(<AuthContext.Provider value={auth}><StatusProbe /></AuthContext.Provider>);
  await act(async () => {});
  expect(screen.getByRole("button")).toHaveTextContent("unavailable");
  fireEvent.click(screen.getByRole("button"));
  await act(async () => {});
  expect(screen.getByRole("button")).toHaveTextContent("allowed");
  expect(canManageAd).toHaveBeenCalledTimes(2);
});

test("preserves controls through background refresh and exposes an accessible retry after failure", async () => {
  const auth = { user: { uid: "owner", email: "owner@example.com" }, isAdmin: false, isEditor: false, loading: false, logout: async () => {}, login: async () => ({ success: true }) };
  vi.mocked(canManageAd).mockResolvedValueOnce({ status: "allowed" }).mockResolvedValueOnce({ status: "unavailable" }).mockResolvedValueOnce({ status: "allowed" });
  const view = render(<AuthContext.Provider value={auth}><AdManagementControls adId="ad" /></AuthContext.Provider>);
  await act(async () => {});
  expect(screen.getByRole("button", { name: "Editar Anúncio" })).toBeInTheDocument();
  view.rerender(<AuthContext.Provider value={{ ...auth, loading: true }}><AdManagementControls adId="ad" /></AuthContext.Provider>);
  expect(screen.getByRole("button", { name: "Editar Anúncio" })).toBeInTheDocument();
  view.rerender(<AuthContext.Provider value={{ ...auth, user: { ...auth.user } }}><AdManagementControls adId="ad" /></AuthContext.Provider>);
  expect(screen.getByRole("button", { name: "Editar Anúncio" })).toBeInTheDocument();
  await act(async () => {});
  expect(screen.getByRole("status")).toHaveTextContent("Não foi possível confirmar suas permissões.");
  expect(screen.queryByRole("button", { name: "Editar Anúncio" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  await act(async () => {});
  expect(screen.getByRole("button", { name: "Editar Anúncio" })).toBeInTheDocument();
});
