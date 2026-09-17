import { describe, expect, it } from "vitest";
import { isEmailLike } from "./validators";

describe("isEmailLike", () => {
  it("accepts a well-formed email", () => {
    expect(isEmailLike("member@example.com")).toBe(true);
  });

  it("rejects a string with no @", () => {
    expect(isEmailLike("member.example.com")).toBe(false);
  });

  it("rejects a string with no domain suffix", () => {
    expect(isEmailLike("member@example")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isEmailLike("")).toBe(false);
  });
});
