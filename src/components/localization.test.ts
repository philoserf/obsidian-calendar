import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import moment from "moment";
import { configureGlobalMomentLocale } from "./localization";

beforeAll(() => {
  (globalThis as any).window = {
    moment,
    _bundledLocaleWeekSpec: undefined as any,
  };
  (globalThis as any).localStorage = {
    getItem: (_key: string) => null,
  };
  (globalThis as any).navigator = {
    language: "en-US",
  };
  moment.locale("en");
});

beforeEach(() => {
  (globalThis as any).window._bundledLocaleWeekSpec = undefined;
  moment.locale("en");
  moment.updateLocale("en", { week: { dow: 0, doy: 6 } });
});

describe("configureGlobalMomentLocale", () => {
  it("returns a locale string", () => {
    const locale = configureGlobalMomentLocale();
    expect(typeof locale).toBe("string");
    expect(locale.length).toBeGreaterThan(0);
  });

  it("initialises window._bundledLocaleWeekSpec on first call", () => {
    (globalThis as any).window._bundledLocaleWeekSpec = undefined;
    configureGlobalMomentLocale("system-default", "locale");
    expect((globalThis as any).window._bundledLocaleWeekSpec).toBeDefined();
  });

  it("does not overwrite _bundledLocaleWeekSpec on subsequent calls", () => {
    configureGlobalMomentLocale("system-default", "locale");
    const first = (globalThis as any).window._bundledLocaleWeekSpec;
    configureGlobalMomentLocale("system-default", "monday");
    configureGlobalMomentLocale("system-default", "locale");
    expect((globalThis as any).window._bundledLocaleWeekSpec).toEqual(first);
  });

  it("sets week start to Monday when weekStart is 'monday'", () => {
    configureGlobalMomentLocale("system-default", "monday");
    const dow = (moment.localeData() as any)._week.dow;
    expect(dow).toBe(1);
  });

  it("sets week start to Sunday when weekStart is 'sunday'", () => {
    configureGlobalMomentLocale("system-default", "sunday");
    const dow = (moment.localeData() as any)._week.dow;
    expect(dow).toBe(0);
  });

  it("sets week start to Saturday when weekStart is 'saturday'", () => {
    configureGlobalMomentLocale("system-default", "saturday");
    const dow = (moment.localeData() as any)._week.dow;
    expect(dow).toBe(6);
  });

  it("restores locale week spec when weekStart is 'locale'", () => {
    configureGlobalMomentLocale("system-default", "locale");
    const localeSpec = (globalThis as any).window._bundledLocaleWeekSpec;
    const dow = (moment.localeData() as any)._week.dow;
    expect(dow).toBe(localeSpec.dow);
  });
});
