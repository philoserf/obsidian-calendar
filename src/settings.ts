import { type App, Notice, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_WEEK_FORMAT, DEFAULT_WORDS_PER_DOT } from "src/constants";
import type CalendarPlugin from "./main";
import { getPluginSettings } from "./obsidian-internals";
import { appHasDailyNotesPluginLoaded } from "./periodic-notes";

export interface ISettings {
  wordsPerDot: number;
  shouldConfirmBeforeCreate: boolean;

  // Weekly Note settings
  showWeeklyNote: boolean;
  weeklyNoteFormat: string;
  weeklyNoteTemplate: string;
  weeklyNoteFolder: string;
}

export const defaultSettings = Object.freeze({
  shouldConfirmBeforeCreate: true,
  wordsPerDot: DEFAULT_WORDS_PER_DOT,

  showWeeklyNote: false,
  weeklyNoteFormat: "",
  weeklyNoteTemplate: "",
  weeklyNoteFolder: "",
});

export function appHasPeriodicNotesWeeklyEnabled(): boolean {
  const periodicNotes = window.app.plugins.getPlugin("periodic-notes");
  const settings = getPluginSettings(periodicNotes);
  const weekly = settings?.weekly as Record<string, unknown> | undefined;
  return !!weekly?.enabled;
}

export class CalendarSettingsTab extends PluginSettingTab {
  private plugin: CalendarPlugin;

  constructor(app: App, plugin: CalendarPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();

    if (!appHasDailyNotesPluginLoaded()) {
      this.containerEl.createDiv("settings-banner", (banner) => {
        banner.createEl("h3", {
          text: "⚠️ Daily Notes plugin not enabled",
        });
        banner.createEl("p", {
          cls: "setting-item-description",
          text: "The calendar is best used in conjunction with either the Daily Notes plugin or the Periodic Notes plugin (available in the Community Plugins catalog).",
        });
      });
    }

    this.containerEl.createEl("h3", {
      text: "General Settings",
    });
    this.addDotThresholdSetting();
    this.addConfirmCreateSetting();
    this.addShowWeeklyNoteSetting();

    if (
      this.plugin.options.showWeeklyNote &&
      !appHasPeriodicNotesWeeklyEnabled()
    ) {
      this.containerEl.createEl("h3", {
        text: "Weekly Note Settings",
      });
      this.containerEl.createEl("p", {
        cls: "setting-item-description",
        text: "Note: Weekly Note settings are moving. You are encouraged to install the 'Periodic Notes' plugin to keep the functionality in the future.",
      });
      this.addWeeklyNoteFormatSetting();
      this.addWeeklyNoteTemplateSetting();
      this.addWeeklyNoteFolderSetting();
    }
  }

  addDotThresholdSetting(): void {
    new Setting(this.containerEl)
      .setName("Words per dot")
      .setDesc("How many words should be represented by a single dot?")
      .addText((textfield) => {
        textfield.setPlaceholder(String(DEFAULT_WORDS_PER_DOT));
        textfield.inputEl.type = "number";
        textfield.setValue(String(this.plugin.options.wordsPerDot));
        textfield.onChange(async (value) => {
          try {
            const n = Number(value);
            await this.plugin.writeOptions(() => ({
              wordsPerDot:
                Number.isFinite(n) && n > 0 ? n : DEFAULT_WORDS_PER_DOT,
            }));
          } catch (err) {
            console.error("[Calendar] Failed to save settings", err);
            new Notice("Calendar: failed to save settings.");
          }
        });
      });
  }

  addConfirmCreateSetting(): void {
    new Setting(this.containerEl)
      .setName("Confirm before creating new note")
      .setDesc("Show a confirmation modal before creating a new note")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.shouldConfirmBeforeCreate);
        toggle.onChange(async (value) => {
          try {
            await this.plugin.writeOptions(() => ({
              shouldConfirmBeforeCreate: value,
            }));
          } catch (err) {
            console.error("[Calendar] Failed to save settings", err);
            new Notice("Calendar: failed to save settings.");
          }
        });
      });
  }

  addShowWeeklyNoteSetting(): void {
    new Setting(this.containerEl)
      .setName("Show week number")
      .setDesc("Enable this to add a column with the week number")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.showWeeklyNote);
        toggle.onChange(async (value) => {
          try {
            await this.plugin.writeOptions(() => ({ showWeeklyNote: value }));
          } catch (err) {
            console.error("[Calendar] Failed to save settings", err);
            new Notice("Calendar: failed to save settings.");
          }
          this.display(); // show/hide weekly settings
        });
      });
  }

  addWeeklyNoteFormatSetting(): void {
    new Setting(this.containerEl)
      .setName("Weekly note format")
      .setDesc("For more syntax help, refer to format reference")
      .addText((textfield) => {
        textfield.setValue(this.plugin.options.weeklyNoteFormat);
        textfield.setPlaceholder(DEFAULT_WEEK_FORMAT);
        textfield.onChange(async (value) => {
          try {
            await this.plugin.writeOptions(() => ({ weeklyNoteFormat: value }));
          } catch (err) {
            console.error("[Calendar] Failed to save settings", err);
            new Notice("Calendar: failed to save settings.");
          }
        });
      });
  }

  addWeeklyNoteTemplateSetting(): void {
    new Setting(this.containerEl)
      .setName("Weekly note template")
      .setDesc(
        "Choose the file you want to use as the template for your weekly notes",
      )
      .addText((textfield) => {
        textfield.setValue(this.plugin.options.weeklyNoteTemplate);
        textfield.onChange(async (value) => {
          try {
            await this.plugin.writeOptions(() => ({
              weeklyNoteTemplate: value,
            }));
          } catch (err) {
            console.error("[Calendar] Failed to save settings", err);
            new Notice("Calendar: failed to save settings.");
          }
        });
      });
  }

  addWeeklyNoteFolderSetting(): void {
    new Setting(this.containerEl)
      .setName("Weekly note folder")
      .setDesc("New weekly notes will be placed here")
      .addText((textfield) => {
        textfield.setValue(this.plugin.options.weeklyNoteFolder);
        textfield.onChange(async (value) => {
          try {
            await this.plugin.writeOptions(() => ({ weeklyNoteFolder: value }));
          } catch (err) {
            console.error("[Calendar] Failed to save settings", err);
            new Notice("Calendar: failed to save settings.");
          }
        });
      });
  }
}
