import type { IPeriodicNoteSettings } from "./types";

const DEFAULT_DAILY_NOTE_FORMAT = "YYYY-MM-DD";
const DEFAULT_WEEKLY_NOTE_FORMAT = "gggg-[W]ww";
const DEFAULT_MONTHLY_NOTE_FORMAT = "YYYY-MM";
const DEFAULT_QUARTERLY_NOTE_FORMAT = "YYYY-[Q]Q";
const DEFAULT_YEARLY_NOTE_FORMAT = "YYYY";

function shouldUsePeriodicNotesSettings(periodicity: string): boolean {
  const periodicNotes = window.app.plugins.getPlugin("periodic-notes");
  return !!(
    // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
    (periodicNotes && (periodicNotes as any).settings?.[periodicity]?.enabled)
  );
}

export function getDailyNoteSettings(): IPeriodicNoteSettings {
  try {
    // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
    const { internalPlugins, plugins } = window.app as any;
    if (shouldUsePeriodicNotesSettings("daily")) {
      const { format, folder, template } =
        // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
        (plugins.getPlugin("periodic-notes") as any)?.settings?.daily || {};
      return {
        format: format || DEFAULT_DAILY_NOTE_FORMAT,
        folder: folder?.trim() || "",
        template: template?.trim() || "",
      };
    }
    const { folder, format, template } =
      internalPlugins.getPluginById("daily-notes")?.instance?.options || {};
    return {
      format: format || DEFAULT_DAILY_NOTE_FORMAT,
      folder: folder?.trim() || "",
      template: template?.trim() || "",
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
    // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
    const calendarSettings = (pluginManager.getPlugin("calendar") as any)
      ?.options;
    const periodicNotesSettings =
      // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
      (pluginManager.getPlugin("periodic-notes") as any)?.settings?.weekly;
    if (shouldUsePeriodicNotesSettings("weekly")) {
      return {
        format: periodicNotesSettings.format || DEFAULT_WEEKLY_NOTE_FORMAT,
        folder: periodicNotesSettings.folder?.trim() || "",
        template: periodicNotesSettings.template?.trim() || "",
      };
    }
    const settings = calendarSettings || {};
    return {
      format: settings.weeklyNoteFormat || DEFAULT_WEEKLY_NOTE_FORMAT,
      folder: settings.weeklyNoteFolder?.trim() || "",
      template: settings.weeklyNoteTemplate?.trim() || "",
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

export function getMonthlyNoteSettings(): IPeriodicNoteSettings {
  try {
    const pluginManager = window.app.plugins;
    const settings =
      (shouldUsePeriodicNotesSettings("monthly") &&
        // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
        (pluginManager.getPlugin("periodic-notes") as any)?.settings
          ?.monthly) ||
      {};
    return {
      format: settings.format || DEFAULT_MONTHLY_NOTE_FORMAT,
      folder: settings.folder?.trim() || "",
      template: settings.template?.trim() || "",
    };
  } catch (err) {
    console.info("No custom monthly note settings found!", err);
  }
  return {
    format: DEFAULT_MONTHLY_NOTE_FORMAT,
    folder: "",
    template: "",
  };
}

export function getQuarterlyNoteSettings(): IPeriodicNoteSettings {
  try {
    const pluginManager = window.app.plugins;
    const settings =
      (shouldUsePeriodicNotesSettings("quarterly") &&
        // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
        (pluginManager.getPlugin("periodic-notes") as any)?.settings
          ?.quarterly) ||
      {};
    return {
      format: settings.format || DEFAULT_QUARTERLY_NOTE_FORMAT,
      folder: settings.folder?.trim() || "",
      template: settings.template?.trim() || "",
    };
  } catch (err) {
    console.info("No custom quarterly note settings found!", err);
  }
  return {
    format: DEFAULT_QUARTERLY_NOTE_FORMAT,
    folder: "",
    template: "",
  };
}

export function getYearlyNoteSettings(): IPeriodicNoteSettings {
  try {
    const pluginManager = window.app.plugins;
    const settings =
      (shouldUsePeriodicNotesSettings("yearly") &&
        // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
        (pluginManager.getPlugin("periodic-notes") as any)?.settings?.yearly) ||
      {};
    return {
      format: settings.format || DEFAULT_YEARLY_NOTE_FORMAT,
      folder: settings.folder?.trim() || "",
      template: settings.template?.trim() || "",
    };
  } catch (err) {
    console.info("No custom yearly note settings found!", err);
  }
  return {
    format: DEFAULT_YEARLY_NOTE_FORMAT,
    folder: "",
    template: "",
  };
}

export function appHasDailyNotesPluginLoaded(): boolean {
  const { app } = window;
  // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
  const dailyNotesPlugin = (app as any).internalPlugins.plugins["daily-notes"];
  if (dailyNotesPlugin?.enabled) {
    return true;
  }
  const periodicNotes = app.plugins.getPlugin("periodic-notes");
  // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
  return !!(periodicNotes && (periodicNotes as any).settings?.daily?.enabled);
}

export function appHasWeeklyNotesPluginLoaded(): boolean {
  const { app } = window;
  const periodicNotes = app.plugins.getPlugin("periodic-notes");
  // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
  if (periodicNotes && (periodicNotes as any).settings?.weekly?.enabled) {
    return true;
  }
  const calendar = app.plugins.getPlugin("calendar");
  // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
  return !!(calendar as any)?.options?.showWeeklyNote;
}

export function appHasMonthlyNotesPluginLoaded(): boolean {
  const { app } = window;
  const periodicNotes = app.plugins.getPlugin("periodic-notes");
  // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
  return !!(periodicNotes && (periodicNotes as any).settings?.monthly?.enabled);
}
