// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { formatSaoPauloDateTime } from "@tudomacae/civil-time";
import { CorrectionsList } from "./CorrectionsList";

describe("CorrectionsList", () => {
  test("renders nothing for an article that was never corrected", () => {
    const { container } = render(<CorrectionsList corrections={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  test("shows every correction, with its date and what changed, in order", () => {
    render(
      <CorrectionsList
        corrections={[
          {
            correctedAt: Date.parse("2026-08-21T00:00:00.000Z"),
            summary: "O nome do bairro foi corrigido.",
          },
          {
            correctedAt: Date.parse("2026-08-26T00:00:00.000Z"),
            summary: "A data de início foi corrigida para outubro.",
          },
        ]}
      />,
    );

    const items = screen.getAllByTestId("news-article-correction");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(
      `${formatSaoPauloDateTime(Date.parse("2026-08-21T00:00:00.000Z"))}: O nome do bairro foi corrigido.`,
    );
    expect(items[1]).toHaveTextContent(
      `${formatSaoPauloDateTime(Date.parse("2026-08-26T00:00:00.000Z"))}: A data de início foi corrigida para outubro.`,
    );
  });
});
