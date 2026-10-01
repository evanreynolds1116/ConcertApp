import { describe, expect, it } from "vitest";
import { displayNameSchema, signInSchema, signUpSchema, usernameSchema } from "./schemas";

describe("usernameSchema", () => {
  it.each(["pat", "Pat_Public_99", "a".repeat(30)])("accepts %s", (name) => {
    expect(usernameSchema.safeParse(name).success).toBe(true);
  });

  it.each(["ab", "a".repeat(31), "has space", "dash-ed", "émile", ""])("rejects %j", (name) => {
    expect(usernameSchema.safeParse(name).success).toBe(false);
  });

  it("trims surrounding whitespace", () => {
    expect(usernameSchema.parse("  pat_public ")).toBe("pat_public");
  });
});

describe("displayNameSchema", () => {
  it("rejects blank and over-long names", () => {
    expect(displayNameSchema.safeParse("   ").success).toBe(false);
    expect(displayNameSchema.safeParse("x".repeat(51)).success).toBe(false);
    expect(displayNameSchema.parse(" Pat Public ")).toBe("Pat Public");
  });
});

describe("signUpSchema", () => {
  const valid = {
    email: "pat@example.com",
    password: "longenough",
    username: "pat_public",
    displayName: "Pat",
  };

  it("accepts a valid sign-up", () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true);
  });

  it("reports each invalid field", () => {
    const result = signUpSchema.safeParse({
      email: "nope",
      password: "short",
      username: "x",
      displayName: "",
    });
    expect(result.success).toBe(false);
    const fields = result.error?.issues.map((i) => i.path[0]).sort();
    expect(fields).toEqual(["displayName", "email", "password", "username"]);
  });
});

describe("signInSchema", () => {
  it("only needs an email and a non-empty password", () => {
    expect(signInSchema.safeParse({ email: "pat@example.com", password: "x" }).success).toBe(true);
    expect(signInSchema.safeParse({ email: "pat@example.com", password: "" }).success).toBe(false);
  });
});
