import { describe, expect, it } from "vitest";
import { formatShare, marginClass, marginText, signedPct, signedUsd } from "./format";

describe("margin wording and colour agree", () => {
  it.each([
    [1.58, "+$1.58 margin", "is-profit"],
    [-1.9, "−$1.90 loss", "is-loss"],
    [0.004, "$0.00, break-even", ""],
    [-0.0049, "$0.00, break-even", ""],
    [0.005, "+$0.01 margin", "is-profit"],
    [-0.005, "−$0.01 loss", "is-loss"],
  ])("%s", (m, text, cls) => {
    expect(marginText(m)).toBe(text);
    expect(marginClass(m)).toBe(cls);
  });
});

describe("signed money and percent", () => {
  it.each([
    [1.234, "+$1.23"],
    [-1.235, "−$1.24"],
    [0.004, "$0.00"],
    [-0.004, "$0.00"],
  ])("signedUsd(%s)", (n, text) => expect(signedUsd(n)).toBe(text));

  it.each([
    [4.06, 1, "+4.1%"],
    [-2, 1, "−2.0%"],
    [0.04, 1, "0.0%"],
    [12.345, 0, "+12%"],
  ])("signedPct(%s, %s)", (n, digits, text) => expect(signedPct(n, digits)).toBe(text));

  it("formats shares as whole percents", () => {
    expect(formatShare(0.7133)).toBe("71%");
    expect(formatShare(1)).toBe("100%");
  });
});
