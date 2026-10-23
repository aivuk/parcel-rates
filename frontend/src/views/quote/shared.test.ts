import { describe, expect, it } from "vitest";
import { marginClass, marginText } from "./shared";

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
