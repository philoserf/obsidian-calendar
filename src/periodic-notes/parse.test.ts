import { beforeAll, describe, expect, it, mock } from "bun:test";
import moment from "moment";

const DEFAULT_DAILY_FORMAT = "YYYY-MM-DD";
const DEFAULT_WEEKLY_FORMAT = "gggg-[W]ww";
const DEFAULT_MONTHLY_FORMAT = "YYYY-MM";

mock.module("./settings", () => ({
  getDailyNoteSettings: () => ({
    format: DEFAULT_DAILY_FORMAT,
    folder: "",
    template: "",
  }),
  getWeeklyNoteSettings: () => ({
    format: DEFAULT_WEEKLY_FORMAT,
    folder: "",
    template: "",
  }),
  getMonthlyNoteSettings: () => ({
    format: DEFAULT_MONTHLY_FORMAT,
    folder: "",
    template: "",
  }),
  getQuarterlyNoteSettings: () => ({
    format: "YYYY-[Q]Q",
    folder: "",
    template: "",
  }),
  getYearlyNoteSettings: () => ({ format: "YYYY", folder: "", template: "" }),
}));

beforeAll(() => {
  (globalThis as any).window = { moment };
  moment.locale("en");
});

const { getDateUID, getDateFromPath } = await import("./parse");

describe("getDateUID", () => {
  it("defaults to day granularity", () => {
    const date = moment("2024-02-26");
    const uid = getDateUID(date);
    expect(uid).toStartWith("day-");
  });

  it("includes granularity prefix", () => {
    const date = moment("2024-02-26");
    expect(getDateUID(date, "day")).toStartWith("day-");
    expect(getDateUID(date, "week")).toStartWith("week-");
    expect(getDateUID(date, "month")).toStartWith("month-");
  });

  it("is deterministic for the same date and granularity", () => {
    const a = moment("2024-02-26T10:00:00");
    const b = moment("2024-02-26T22:59:59");
    expect(getDateUID(a, "day")).toBe(getDateUID(b, "day"));
  });

  it("produces different UIDs for different dates", () => {
    const a = moment("2024-02-26");
    const b = moment("2024-02-27");
    expect(getDateUID(a, "day")).not.toBe(getDateUID(b, "day"));
  });

  it("produces different UIDs for same date but different granularities", () => {
    const date = moment("2024-02-26");
    expect(getDateUID(date, "day")).not.toBe(getDateUID(date, "week"));
    expect(getDateUID(date, "week")).not.toBe(getDateUID(date, "month"));
  });
});

describe("getDateFromPath", () => {
  it("extracts a daily note date from a full path", () => {
    const result = getDateFromPath("journals/daily/2024-02-26.md", "day");
    expect(result).not.toBeNull();
    expect(result!.format("YYYY-MM-DD")).toBe("2024-02-26");
  });

  it("extracts a weekly note date from a path", () => {
    const result = getDateFromPath("weekly/2024-W08.md", "week");
    expect(result).not.toBeNull();
    expect(result!.isValid()).toBe(true);
  });

  it("returns null for a path that does not match", () => {
    const result = getDateFromPath("notes/meeting-notes.md", "day");
    expect(result).toBeNull();
  });

  it("returns null for an empty path", () => {
    expect(getDateFromPath("", "day")).toBeNull();
  });

  it("handles paths without directory separators", () => {
    const result = getDateFromPath("2024-03-15.md", "day");
    expect(result).not.toBeNull();
    expect(result!.format("YYYY-MM-DD")).toBe("2024-03-15");
  });
});
