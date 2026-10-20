import { render as renderComponent } from "@testing-library/react";
import type { ReactNode } from "react";
import { MediaProvider, type MediaIntegrations } from "@tudomacae/media/ui";
import { vi } from "vitest";

export const reportFailure = vi.fn();
const integrations: MediaIntegrations = {
  // eslint-disable-next-line @next/next/no-img-element -- Consumer adapter for portable React tests.
  Image: ({ fill: _fill, ...props }) => <img {...props} alt={props.alt} />,
  Link: props => <a {...props} />,
  create: async () => ({ success: true, mediaId: "created" }),
  update: async () => ({ success: true }),
  resolve: async () => null,
  capture: vi.fn(),
  reportFailure,
};
export function render(node: ReactNode) {
  return renderComponent(<MediaProvider integrations={integrations}>{node}</MediaProvider>);
}
