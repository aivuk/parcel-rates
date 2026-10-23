import { useReducer } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockMeta } from "../../api/mocks";
import { FALLBACK_CONTROLS, reducer, type AppState } from "../../state/urlState";
import { ControlRail, assumptionsLine } from "./ControlRail";

let latest: AppState;

function Harness({ initial }: { initial?: AppState }) {
  const [state, dispatch] = useReducer(reducer, initial ?? { controls: FALLBACK_CONTROLS, view: "quote" });
  latest = state;
  return <ControlRail state={state} dispatch={dispatch} meta={mockMeta} metaStatus="ok" onRetryMeta={() => {}} />;
}

describe("ControlRail", () => {
  it("shows the year's fuel default and no reset until the slider moves", () => {
    render(<Harness />);
    const ground = screen.getByRole("slider", { name: "Ground" });
    expect(ground).toHaveValue("26.25");
    expect(screen.getByText(/Year default 26\.25%, ground services/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reset ground/i })).not.toBeInTheDocument();
  });

  it("changing the fuel slider updates state and offers a reset that restores the default", async () => {
    render(<Harness />);
    const ground = screen.getByRole("slider", { name: "Ground" });
    fireEvent.change(ground, { target: { value: "31.5" } });
    expect(latest.controls.fuel_override_percent).toEqual({ ground: 31.5 });
    expect(ground).toHaveValue("31.5");
    const reset = screen.getByRole("button", { name: /reset ground fuel/i });
    await userEvent.click(reset);
    expect(latest.controls.fuel_override_percent).toBeUndefined();
    expect(ground).toHaveValue("26.25");
    expect(screen.queryByRole("button", { name: /reset ground fuel/i })).not.toBeInTheDocument();
  });

  it("switches the USPS rate card", async () => {
    render(<Harness />);
    const group = screen.getByRole("group", { name: "USPS prices" });
    const retail = within(group).getByRole("radio", { name: /retail/i });
    expect(within(group).getByRole("radio", { name: /commercial/i })).toBeChecked();
    await userEvent.click(retail);
    expect(retail).toBeChecked();
    expect(latest.controls.usps_rate_card).toBe("retail");
  });

  it("lists every year and says which carriers are missing", async () => {
    render(<Harness />);
    const year = screen.getByRole("combobox", { name: "Price list year" });
    expect(within(year).getByRole("option", { name: "2027 (no USPS, UPS)" })).toBeInTheDocument();
    await userEvent.selectOptions(year, "2024");
    expect(latest.controls.year).toBe(2024);
    expect(screen.getByRole("slider", { name: "Ground" })).toHaveValue("16.25");
  });

  it("toggles peak and validates the flat price", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("switch", { name: /peak season/i }));
    expect(latest.controls.peak).toBe(true);

    const price = screen.getByRole("textbox", { name: /flat price/i });
    await userEvent.clear(price);
    await userEvent.type(price, "12.4{Enter}");
    expect(latest.controls.flat_price).toBe(12.4);

    await userEvent.clear(price);
    await userEvent.type(price, "abc{Enter}");
    expect(price).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/enter a price between/i)).toBeInTheDocument();
    expect(latest.controls.flat_price).toBe(12.4);
  });

  it("shows an error with a retry when the price lists fail to load", async () => {
    let retried = 0;
    render(
      <ControlRail
        state={{ controls: FALLBACK_CONTROLS, view: "quote" }}
        dispatch={() => {}}
        meta={null}
        metaStatus="error"
        onRetryMeta={() => (retried += 1)}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/price lists did not load/i);
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retried).toBe(1);
  });

  it("summarises the assumptions in one line for the mobile bar", () => {
    expect(assumptionsLine({ controls: FALLBACK_CONTROLS, view: "quote" })).toBe(
      "2026 · USPS commercial · fuel default · $9.99 charged",
    );
    expect(
      assumptionsLine({
        controls: { ...FALLBACK_CONTROLS, peak: true, fuel_override_percent: { express: 30 } },
        view: "quote",
      }),
    ).toBe("2026 · USPS commercial · fuel default / 30% · peak · $9.99 charged");
  });
});
