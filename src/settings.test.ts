import { describe, expect, test } from "bun:test";
import { validateSettings } from "./validate-settings";

describe("validateSettings", () => {
  test("accepts valid settings", () => {
    const result = validateSettings({
      wordsPerDot: 100,
      shouldConfirmBeforeCreate: false,
      showWeeklyNote: true,
      weeklyNoteFormat: "gggg-[W]ww",
      weeklyNoteTemplate: "templates/weekly",
      weeklyNoteFolder: "weekly",
    });
    expect(result).toEqual({
      wordsPerDot: 100,
      shouldConfirmBeforeCreate: false,
      showWeeklyNote: true,
      weeklyNoteFormat: "gggg-[W]ww",
      weeklyNoteTemplate: "templates/weekly",
      weeklyNoteFolder: "weekly",
    });
  });

  test("rejects negative wordsPerDot", () => {
    const result = validateSettings({ wordsPerDot: -5 });
    expect(result.wordsPerDot).toBeUndefined();
  });

  test("rejects zero wordsPerDot", () => {
    const result = validateSettings({ wordsPerDot: 0 });
    expect(result.wordsPerDot).toBeUndefined();
  });

  test("rejects non-number wordsPerDot", () => {
    const result = validateSettings({ wordsPerDot: "abc" });
    expect(result.wordsPerDot).toBeUndefined();
  });

  test("rejects wrong types", () => {
    const result = validateSettings({
      shouldConfirmBeforeCreate: "yes",
      showWeeklyNote: 1,
      weeklyNoteFormat: 42,
    });
    expect(result).toEqual({});
  });

  test("strips unknown keys", () => {
    const result = validateSettings({
      wordsPerDot: 50,
      unknownKey: "value",
      anotherOne: true,
    });
    expect(result).toEqual({ wordsPerDot: 50 });
    expect("unknownKey" in result).toBe(false);
  });

  test("returns empty object for empty input", () => {
    const result = validateSettings({});
    expect(result).toEqual({});
  });
});
