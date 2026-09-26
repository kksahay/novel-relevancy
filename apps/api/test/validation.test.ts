import { describe, expect, it } from "bun:test";
import { wordCount, validateSubmission, validateArticle, STANCE_VALUES } from "../src/lib/validation";

describe("wordCount", () => {
  it("counts words correctly", () => {
    expect(wordCount("hello world")).toBe(2);
    expect(wordCount("")).toBe(0);
    expect(wordCount("  one   two   three  ")).toBe(3);
  });
});

describe("validateArticle", () => {
  it("passes for valid input", () => {
    expect(() => validateArticle({ title: "Test", content: "Body" })).not.toThrow();
  });

  it("throws for empty title", () => {
    expect(() => validateArticle({ title: "", content: "Body" })).toThrow("title");
  });

  it("throws for empty content", () => {
    expect(() => validateArticle({ title: "Test", content: "" })).toThrow("content");
  });
});

describe("validateSubmission", () => {
  it("passes for valid input with all stances", () => {
    for (const stance of STANCE_VALUES) {
      expect(() => validateSubmission({ headline: "Test", body: "Body", stance })).not.toThrow();
    }
  });

  it("throws for empty headline", () => {
    expect(() => validateSubmission({ headline: "", body: "Body", stance: "support" })).toThrow("Headline");
  });

  it("throws for empty body", () => {
    expect(() => validateSubmission({ headline: "Test", body: "", stance: "support" })).toThrow("Body");
  });

  it("throws for invalid stance", () => {
    expect(() => validateSubmission({ headline: "Test", body: "Body", stance: "neutral" as any })).toThrow();
  });

  it("throws when body exceeds 100 words", () => {
    const longBody = Array(101).fill("word").join(" ");
    expect(() => validateSubmission({ headline: "Test", body: longBody, stance: "support" })).toThrow("under 100 words");
  });

  it("allows exactly 99 words", () => {
    const exactBody = Array(99).fill("word").join(" ");
    expect(() => validateSubmission({ headline: "Test", body: exactBody, stance: "support" })).not.toThrow();
  });
});
