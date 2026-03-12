import { Plugin, type WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_CALENDAR } from "./constants";
import { tryToCreateWeeklyNote } from "./io/notes";
import {
  appHasPeriodicNotesWeeklyEnabled,
  CalendarSettingsTab,
  type ISettings,
} from "./settings";
import { settings } from "./stores";
import { validateSettings } from "./validate-settings";
import CalendarView from "./view";

export default class CalendarPlugin extends Plugin {
  public options!: ISettings;
  private view!: CalendarView;

  onunload(): void {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR).forEach((leaf) => {
      leaf.detach();
    });
  }

  async onload(): Promise<void> {
    this.register(
      settings.subscribe((value) => {
        this.options = value;
      }),
    );

    this.registerView(
      VIEW_TYPE_CALENDAR,
      (leaf: WorkspaceLeaf) => (this.view = new CalendarView(leaf)),
    );

    this.addCommand({
      id: "show-calendar-view",
      name: "Open view",
      checkCallback: (checking: boolean) => {
        if (checking) {
          return (
            this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR).length === 0
          );
        }
        this.initLeaf();
      },
    });

    this.addCommand({
      id: "open-weekly-note",
      name: "Open Weekly Note",
      checkCallback: (checking) => {
        if (checking) {
          return appHasPeriodicNotesWeeklyEnabled();
        }
        tryToCreateWeeklyNote(window.moment(), false, this.options);
      },
    });

    this.addCommand({
      id: "reveal-active-note",
      name: "Reveal active note",
      checkCallback: (checking: boolean) => {
        if (!this.view) return false;
        if (!checking) this.view.revealActiveNote();
        return true;
      },
    });

    await this.loadOptions();

    this.addSettingTab(new CalendarSettingsTab(this.app, this));

    if (this.app.workspace.layoutReady) {
      this.initLeaf();
    } else {
      this.registerEvent(
        this.app.workspace.on("layout-ready", this.initLeaf.bind(this)),
      );
    }
  }

  initLeaf(): void {
    if (this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR).length) {
      return;
    }
    this.app.workspace.getRightLeaf(false)?.setViewState({
      type: VIEW_TYPE_CALENDAR,
    });
  }

  async loadOptions(): Promise<void> {
    const raw = await this.loadData();
    const validated = raw ? validateSettings(raw) : {};
    settings.update((old) => ({ ...old, ...validated }));

    // Re-save only if validation stripped invalid keys
    const validatedKeyCount = Object.keys(validated).length;
    const rawKeyCount = raw ? Object.keys(raw).length : 0;
    if (validatedKeyCount !== rawKeyCount) {
      await this.saveData(this.options);
    }
  }

  async writeOptions(
    changeOpts: (settings: ISettings) => Partial<ISettings>,
  ): Promise<void> {
    settings.update((old) => ({ ...old, ...changeOpts(old) }));
    await this.saveData(this.options);
  }
}
