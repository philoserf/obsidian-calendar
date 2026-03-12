import { describe, expect, test } from "bun:test";
import { getDayOfWeekNumericalValue, getWeekdayOrder, join } from "./path";

describe("join", () => {
  test("joins simple segments", () => {
    expect(join("foo", "bar")).toBe("foo/bar");
  });

  test("handles segments with slashes", () => {
    expect(join("foo/bar", "baz")).toBe("foo/bar/baz");
  });

  test("removes empty segments", () => {
    expect(join("foo", "", "bar")).toBe("foo/bar");
  });

  test("removes dot segments", () => {
    expect(join("foo", ".", "bar")).toBe("foo/bar");
  });

  test("preserves leading slash", () => {
    expect(join("/foo", "bar")).toBe("/foo/bar");
  });

  test("returns empty string for empty input", () => {
    expect(join("")).toBe("");
  });

  test("handles single segment", () => {
    expect(join("foo")).toBe("foo");
  });

  test("handles multiple slashes in segment", () => {
    expect(join("a/b/c")).toBe("a/b/c");
  });
});

describe("getWeekdayOrder", () => {
  test("returns Sunday-first for weekStart=0", () => {
    const days = getWeekdayOrder(0);
    expect(days[0]).toBe("sunday");
    expect(days[6]).toBe("saturday");
  });

  test("returns Monday-first for weekStart=1", () => {
    const days = getWeekdayOrder(1);
    expect(days[0]).toBe("monday");
    expect(days[6]).toBe("sunday");
  });

  test("returns Saturday-first for weekStart=6", () => {
    const days = getWeekdayOrder(6);
    expect(days[0]).toBe("saturday");
    expect(days[6]).toBe("friday");
  });

  test("always returns 7 days", () => {
    for (let i = 0; i < 7; i++) {
      expect(getWeekdayOrder(i)).toHaveLength(7);
    }
  });

  test("contains all 7 days regardless of start", () => {
    const allDays = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    for (let i = 0; i < 7; i++) {
      const order = getWeekdayOrder(i);
      expect(order.sort()).toEqual(allDays.sort());
    }
  });
});

describe("getDayOfWeekNumericalValue", () => {
  test("returns 0 for first day (Sunday-start)", () => {
    expect(getDayOfWeekNumericalValue("sunday", 0)).toBe(0);
  });

  test("returns 6 for last day (Sunday-start)", () => {
    expect(getDayOfWeekNumericalValue("saturday", 0)).toBe(6);
  });

  test("returns 0 for Monday with Monday-start", () => {
    expect(getDayOfWeekNumericalValue("monday", 1)).toBe(0);
  });

  test("returns 6 for Sunday with Monday-start", () => {
    expect(getDayOfWeekNumericalValue("sunday", 1)).toBe(6);
  });

  test("is case-insensitive", () => {
    expect(getDayOfWeekNumericalValue("MONDAY", 0)).toBe(1);
    expect(getDayOfWeekNumericalValue("Monday", 0)).toBe(1);
  });

  test("returns -1 for invalid day name", () => {
    expect(getDayOfWeekNumericalValue("notaday", 0)).toBe(-1);
  });
});
