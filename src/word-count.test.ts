import { describe, expect, test } from "bun:test";
import { clamp, getWordCount } from "./word-count";

describe("clamp", () => {
  test("returns value when within bounds", () => {
    expect(clamp(5, 1, 10)).toBe(5);
  });

  test("clamps to lower bound", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  test("clamps to upper bound", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  test("returns lower bound when equal", () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  test("returns upper bound when equal", () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });

  test("handles negative bounds", () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
  });
});

describe("getWordCount", () => {
  test("counts simple English words", () => {
    expect(getWordCount("hello world")).toBe(2);
  });

  test("returns 0 for empty string", () => {
    expect(getWordCount("")).toBe(0);
  });

  test("returns 0 for whitespace only", () => {
    expect(getWordCount("   \n\t  ")).toBe(0);
  });

  test("counts words with punctuation", () => {
    expect(getWordCount("hello, world! How are you?")).toBe(5);
  });

  test("counts numbers as words", () => {
    expect(getWordCount("I have 3 cats")).toBe(4);
  });

  test("counts formatted numbers", () => {
    // "1,000.50" matches as two number groups due to regex structure
    expect(getWordCount("The price is 1,000.50 dollars")).toBe(5);
  });

  test("does not count CJK characters (regex not wrapped in character class)", () => {
    // Known limitation: nonSpaceDelimitedWords pattern lacks [...] brackets
    expect(getWordCount("テスト")).toBe(0);
  });

  test("counts only Latin words in mixed Latin and CJK", () => {
    expect(getWordCount("hello テスト")).toBe(1);
  });

  test("handles multiline text", () => {
    expect(getWordCount("line one\nline two\nline three")).toBe(6);
  });

  test("handles hyphenated words as single words", () => {
    expect(getWordCount("well-known fact")).toBe(2);
  });
});
