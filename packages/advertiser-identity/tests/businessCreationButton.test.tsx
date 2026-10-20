// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { BusinessCreationButton, businessCreationSurface } from "../discovery";
import { IdentityProvider, type IdentityIntegrations } from "../ui";

function setup(signedIn: boolean, loading = false) {
  const navigate = vi.fn();
  const requestSignIn = vi.fn();
  const capture = vi.fn();
  const integrations: IdentityIntegrations = {
    Link: props => <a {...props} />, Image: () => null, origin: "https://example.test",
    capture, readBusinesses: async () => ({ items: [] }), readPublicOfferings: async () => null,
    creationCta: { signedIn, loading, navigate, requestSignIn },
  };
  render(<IdentityProvider integrations={integrations}><BusinessCreationButton sourceSurface="home" /></IdentityProvider>);
  return { navigate, requestSignIn, capture, button: screen.getByRole("button", { name: "Cadastre seu negócio ou serviço" }) };
}

test("a visitor retains the creation destination through sign-in and can retry", async () => {
  const { button, navigate, requestSignIn, capture } = setup(false);
  const user = userEvent.setup();
  await user.click(button);
  expect(navigate).not.toHaveBeenCalled();
  await user.click(button);
  expect(requestSignIn).toHaveBeenCalledTimes(2);
  requestSignIn.mock.calls[1][0]();
  expect(navigate).toHaveBeenCalledExactlyOnceWith("/minha-conta/perfis/novo?origem=catalogo&entrada=home");
  expect(capture).toHaveBeenCalledWith("business_creation_cta_clicked", { source_surface: "home", cta_variant: "create_business", authentication_state: "visitor" });
});

test("an authenticated visitor proceeds directly", async () => {
  const { button, navigate, requestSignIn } = setup(true);
  await userEvent.click(button);
  expect(navigate).toHaveBeenCalledExactlyOnceWith("/minha-conta/perfis/novo?origem=catalogo&entrada=home");
  expect(requestSignIn).not.toHaveBeenCalled();
});

test("session loading prevents a premature sign-in or navigation", async () => {
  const { button, navigate, requestSignIn } = setup(false, true);
  expect(button).toBeDisabled();
  await userEvent.click(button);
  expect(requestSignIn).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});

test.each([undefined, "private-value", ["home"], {}])("does not forward unknown entry data to telemetry (%s)", (value) => {
  expect(businessCreationSurface(value)).toBe("catalog");
});
