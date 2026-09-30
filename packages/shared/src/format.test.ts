import { describe, expect, it } from "vitest";
import { formatCityState } from "./format";

describe("formatCityState", () => {
  it("formats as City, ST", () => {
    expect(formatCityState("Nashville", "TN")).toBe("Nashville, TN");
  });

  it("uppercases the state code and trims whitespace", () => {
    expect(formatCityState(" Portland ", "me")).toBe("Portland, ME");
  });
});
