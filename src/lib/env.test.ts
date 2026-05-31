import { describe, it, expect, afterEach } from "vitest";
import { requireEnv } from "@/lib/env";

describe("requireEnv", () => {
  const KEY = "BOLAO_TEST_ENV_KEY";

  afterEach(() => {
    delete process.env[KEY];
  });

  it("returns the value when the variable is set", () => {
    process.env[KEY] = "hello";
    expect(requireEnv(KEY)).toBe("hello");
  });

  it("throws a descriptive error when the variable is missing", () => {
    delete process.env[KEY];
    expect(() => requireEnv(KEY)).toThrowError(
      `Missing required environment variable: ${KEY}`
    );
  });

  it("throws when the variable is an empty string", () => {
    process.env[KEY] = "";
    expect(() => requireEnv(KEY)).toThrowError(
      `Missing required environment variable: ${KEY}`
    );
  });
});
