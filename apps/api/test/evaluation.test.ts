import { describe, expect, it } from "bun:test";
import { resetNoveltyCache } from "../src/services/evaluation";

describe("resetNoveltyCache", () => {
  it("is safe to call with no cached articles", () => {
    expect(() => resetNoveltyCache()).not.toThrow();
  });

  it("is safe to call repeatedly", () => {
    resetNoveltyCache();
    expect(() => resetNoveltyCache()).not.toThrow();
    expect(() => resetNoveltyCache("00000000-0000-0000-0000-000000000000")).not.toThrow();
  });
});
