import {
  getInternalPlugins,
  getPluginOptions,
  getPluginSettings,
} from "../obsidian-internals";
import type { IPeriodicNoteSettings } from "./types";

const DEFAULT_DAILY_NOTE_FORMAT = "YYYY-MM-DD";
const DEFAULT_WEEKLY_NOTE_FORMAT = "gggg-[W]ww";
const DEFAULT_MONTHLY_NOTE_FORMAT = "YYYY-MM";
const DEFAULT_QUARTERLY_NOTE_FORMAT = "YYYY-[Q]Q";
const DEFAULT_YEARLY_NOTE_FORMAT = "YYYY";

type Periodicity = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

function shouldUsePeriodicNotesSettings(periodicity: Periodicity): boolean {
  const periodicNotes = window.app.plugins.getPlugin("periodic-notes");
  const settings = getPluginSettings(periodicNotes);
  const periodicitySettings = settings?.[periodicity] as
    | Record<string, unknown>
    | undefined;
  return !!periodicitySettings?.enabled;
}

export function getDailyNoteSettings(): IPeriodicNoteSettings {
  try {
    const { app } = window;
    if (shouldUsePeriodicNotesSettings("daily")) {
      const periodicNotes = app.plugins.getPlugin("periodic-notes");
      const settings = getPluginSettings(periodicNotes);
      const daily = (settings?.daily ?? {}) as Record<string, unknown>;
      return {
        format: (daily.format as string) || DEFAULT_DAILY_NOTE_FORMAT,
        folder: (daily.folder as string)?.trim() || "",
        template: (daily.template as string)?.trim() || "",
      };
    }
    const internalPlugins = getInternalPlugins(app);
    const { folder, format, template } =
      internalPlugins.getPluginById("daily-notes")?.instance?.options || {};
    return {
      format: (format as string) || DEFAULT_DAILY_NOTE_FORMAT,
      folder: (folder as string)?.trim() || "",
      template: (template as string)?.trim() || "",
    };
  } catch (err) {
    console.info("No custom daily note settings found!", err);
  }
  return {
    format: DEFAULT_DAILY_NOTE_FORMAT,
    folder: "",
    template: "",
  };
}

export function getWeeklyNoteSettings(): IPeriodicNoteSettings {
  try {
    const pluginManager = window.app.plugins;
    const calendarSettings = getPluginOptions(
      pluginManager.getPlugin("calendar"),
    );
    const periodicNotesSettings = getPluginSettings(
      pluginManager.getPlugin("periodic-notes"),
    );
    const weekly = periodicNotesSettings?.weekly as
      | Record<string, unknown>
      | undefined;
    if (shouldUsePeriodicNotesSettings("weekly") && weekly) {
      return {
        format: (weekly.format as string) || DEFAULT_WEEKLY_NOTE_FORMAT,
        folder: (weekly.folder as string)?.trim() || "",
        template: (weekly.template as string)?.trim() || "",
      };
    }
    const settings = calendarSettings || {};
    return {
      format:
        (settings.weeklyNoteFormat as string) || DEFAULT_WEEKLY_NOTE_FORMAT,
      folder: (settings.weeklyNoteFolder as string)?.trim() || "",
      template: (settings.weeklyNoteTemplate as string)?.trim() || "",
    };
  } catch (err) {
    console.info("No custom weekly note settings found!", err);
  }
  return {
    format: DEFAULT_WEEKLY_NOTE_FORMAT,
    folder: "",
    template: "",
  };
}

function getPeriodicNoteSettings(
  periodicity: Periodicity,
  defaultFormat: string,
): IPeriodicNoteSettings {
  try {
    const periodicNotesSettings = getPluginSettings(
      window.app.plugins.getPlugin("periodic-notes"),
    );
    const settings =
      (shouldUsePeriodicNotesSettings(periodicity) &&
        (periodicNotesSettings?.[periodicity] as Record<string, unknown>)) ||
      {};
    return {
      format: (settings.format as string) || defaultFormat,
      folder: (settings.folder as string)?.trim() || "",
      template: (settings.template as string)?.trim() || "",
    };
  } catch (err) {
    console.info(`No custom ${periodicity} note settings found!`, err);
  }
  return {
    format: defaultFormat,
    folder: "",
    template: "",
  };
}

export function getMonthlyNoteSettings(): IPeriodicNoteSettings {
  return getPeriodicNoteSettings("monthly", DEFAULT_MONTHLY_NOTE_FORMAT);
}

export function getQuarterlyNoteSettings(): IPeriodicNoteSettings {
  return getPeriodicNoteSettings("quarterly", DEFAULT_QUARTERLY_NOTE_FORMAT);
}

export function getYearlyNoteSettings(): IPeriodicNoteSettings {
  return getPeriodicNoteSettings("yearly", DEFAULT_YEARLY_NOTE_FORMAT);
}

export function appHasDailyNotesPluginLoaded(): boolean {
  const { app } = window;
  const internalPlugins = getInternalPlugins(app);
  const dailyNotesPlugin = internalPlugins.plugins["daily-notes"];
  if (dailyNotesPlugin?.enabled) {
    return true;
  }
  const periodicNotes = app.plugins.getPlugin("periodic-notes");
  const settings = getPluginSettings(periodicNotes);
  const daily = settings?.daily as Record<string, unknown> | undefined;
  return !!daily?.enabled;
}

export function appHasWeeklyNotesPluginLoaded(): boolean {
  const { app } = window;
  const periodicNotes = app.plugins.getPlugin("periodic-notes");
  const settings = getPluginSettings(periodicNotes);
  const weekly = settings?.weekly as Record<string, unknown> | undefined;
  if (weekly?.enabled) {
    return true;
  }
  const calendar = app.plugins.getPlugin("calendar");
  const calendarOptions = getPluginOptions(calendar);
  return !!calendarOptions?.showWeeklyNote;
}

export function appHasMonthlyNotesPluginLoaded(): boolean {
  const { app } = window;
  const periodicNotes = app.plugins.getPlugin("periodic-notes");
  const settings = getPluginSettings(periodicNotes);
  const monthly = settings?.monthly as Record<string, unknown> | undefined;
  return !!monthly?.enabled;
}
