# obsidian-calendar: Code Walkthrough

*2026-03-09T03:36:55Z by Showboat 0.6.1*
<!-- showboat-id: d0823ec8-68f2-4fb8-bd6a-578824097fda -->

## Overview

obsidian-calendar is a calendar sidebar plugin for Obsidian. It renders a month-view grid, tracks daily/weekly/monthly notes via vault events, and displays word-count dots. The plugin is built with **Svelte 5** (runes mode) and **Vite**, targeting Obsidian's CommonJS plugin format.

This walkthrough follows the code path from plugin load → view mount → calendar render → user interaction → note creation.

---

## Project Structure

```bash
find src -type f | sort && echo "---" && echo "Other key files:" && ls manifest.json versions.json styles.css vite.config.ts biome.json tsconfig.json package.json
```

```output
src/components/Arrow.svelte
src/components/Calendar.svelte
src/components/context.ts
src/components/Day.svelte
src/components/Dot.svelte
src/components/Dots.svelte
src/components/fileStore.ts
src/components/MetadataResolver.svelte
src/components/Month.svelte
src/components/Nav.svelte
src/components/types.ts
src/components/utils.test.ts
src/components/utils.ts
src/components/WeekNum.svelte
src/constants.ts
src/fileMenu.ts
src/global.d.ts
src/io/notes.ts
src/main.ts
src/modal.ts
src/periodic-notes/index.ts
src/periodic-notes/parse.test.ts
src/periodic-notes/parse.ts
src/periodic-notes/settings.ts
src/periodic-notes/types.ts
src/periodic-notes/vault.ts
src/settings.ts
src/sources.ts
src/stores.ts
src/view.ts
---
Other key files:
biome.json
manifest.json
package.json
styles.css
tsconfig.json
versions.json
vite.config.ts
```

The source splits into four areas:

| Directory | Purpose |
|-----------|---------|
| `src/` (root) | Plugin entry, view, settings, stores, constants |
| `src/components/` | Svelte 5 components + file cache + utilities |
| `src/periodic-notes/` | Date parsing, vault operations, settings bridge |
| `src/io/` | Note creation with confirmation flow |

---

## 1. Plugin Entry — `src/main.ts`

The plugin lifecycle starts here. Obsidian calls `onload()` when the plugin activates.

```bash
sed -n "1,50p" src/main.ts
```

```output
import { Plugin, type WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_CALENDAR } from "./constants";
import { tryToCreateWeeklyNote } from "./io/notes";
import {
  appHasPeriodicNotesWeeklyEnabled,
  CalendarSettingsTab,
  type ISettings,
} from "./settings";
import { settings } from "./stores";
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
```

```bash
sed -n "51,109p" src/main.ts
```

```output
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
    const options = await this.loadData();
    settings.update((old) => {
      return {
        ...old,
        ...(options || {}),
      };
    });

    await this.saveData(this.options);
  }

  async writeOptions(
    changeOpts: (settings: ISettings) => Partial<ISettings>,
  ): Promise<void> {
    settings.update((old) => ({ ...old, ...changeOpts(old) }));
    await this.saveData(this.options);
  }
}
```

**Key points in `main.ts`:**

- **`onload()`** subscribes to the settings store so `this.options` always reflects current settings, registers the calendar view type, adds three commands (open view, open weekly note, reveal active note), loads persisted options, adds the settings tab, and opens the calendar leaf in the right sidebar.
- **`initLeaf()`** is guarded — it won't create a duplicate leaf if one already exists.
- **`loadOptions()`** merges persisted data into the Svelte store, then immediately saves back (to persist any new default fields added in updates).
- **`writeOptions()`** applies a partial update to the store and persists.

**Concern:** `loadOptions()` does no schema validation. Corrupted plugin data merges directly into settings (see issue #28).

---

## 2. Constants — `src/constants.ts`

```bash
cat src/constants.ts
```

```output
export const DEFAULT_WEEK_FORMAT = "gggg-[W]ww";
export const DEFAULT_WORDS_PER_DOT = 250;
export const MAX_DOTS = 5;
export const PLUGIN_ID = "calendar";
export const VIEW_TYPE_CALENDAR = "calendar";

export const TRIGGER_ON_OPEN = "calendar:open";
```

`DEFAULT_WEEK_FORMAT` uses Moment's locale-aware week tokens (`gg` = locale week year, `ww` = locale week number). `MAX_DOTS` caps the visual indicator at 5 dots per day. `TRIGGER_ON_OPEN` is a workspace event fired when a note is opened from the calendar.

---

## 3. Stores — `src/stores.ts`

Global Svelte writable stores for cross-component state.

```bash
cat src/stores.ts
```

```output
import type { TFile } from "obsidian";
import { defaultSettings, type ISettings } from "src/settings";
import { writable } from "svelte/store";
import { getDateUIDFromFile } from "./components/fileStore";

export const settings = writable<ISettings>(defaultSettings);

function createSelectedFileStore() {
  const store = writable<string | null>(null);

  return {
    setFile: (file: TFile | null) => {
      const id = file ? getDateUIDFromFile(file) : null;
      store.set(id);
    },
    ...store,
  };
}

export const activeFile = createSelectedFileStore();
```

Two stores:

- **`settings`** — holds `ISettings`, initialized with defaults, updated by `loadOptions()` / `writeOptions()`.
- **`activeFile`** — wraps a string store (dateUID or null). The `setFile()` helper converts a `TFile` to its dateUID so components can highlight the active day without holding a file reference.

---

## 4. Settings — `src/settings.ts`

Defines the settings schema and renders the settings tab UI.

```bash
sed -n "1,50p" src/settings.ts
```

```output
import { type App, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_WEEK_FORMAT, DEFAULT_WORDS_PER_DOT } from "src/constants";
import type CalendarPlugin from "./main";
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
  // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
  const periodicNotes = (<any>window.app).plugins.getPlugin("periodic-notes");
  return !!periodicNotes?.settings?.weekly?.enabled;
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
```

```bash
sed -n "50,164p" src/settings.ts
```

```output
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
          const n = Number(value);
          this.plugin.writeOptions(() => ({
            wordsPerDot:
              Number.isFinite(n) && n > 0 ? n : DEFAULT_WORDS_PER_DOT,
          }));
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
          this.plugin.writeOptions(() => ({
            shouldConfirmBeforeCreate: value,
          }));
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
          this.plugin.writeOptions(() => ({ showWeeklyNote: value }));
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
          this.plugin.writeOptions(() => ({ weeklyNoteFormat: value }));
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
          this.plugin.writeOptions(() => ({ weeklyNoteTemplate: value }));
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
          this.plugin.writeOptions(() => ({ weeklyNoteFolder: value }));
        });
      });
  }
}
```

**Settings schema** has 5 fields: `wordsPerDot`, `shouldConfirmBeforeCreate`, `showWeeklyNote`, `weeklyNoteFormat/Template/Folder`. Weekly note settings only show if `showWeeklyNote` is on and the Periodic Notes plugin doesn't handle weekly notes itself.

**Concern:** Every `onChange` callback is `async` but never awaits `writeOptions()`. If the save fails, the user gets no feedback (issue #25). The `wordsPerDot` setter does validate for positive finite numbers — good defensive code.

---

## 5. The View — `src/view.ts`

`CalendarView` bridges Obsidian's `ItemView` API and the Svelte component tree.

```bash
cat src/view.ts
```

```output
import type { Moment } from "moment";
import { ItemView, type TFile, type WorkspaceLeaf } from "obsidian";
import { TRIGGER_ON_OPEN, VIEW_TYPE_CALENDAR } from "src/constants";
import { tryToCreateDailyNote, tryToCreateWeeklyNote } from "src/io/notes";
import type { ISettings } from "src/settings";
import { mount, unmount } from "svelte";
import Calendar from "./components/Calendar.svelte";
import PeriodicNotesCache from "./components/fileStore";
import { showFileMenu } from "./fileMenu";
import {
  getDateFromFile,
  getWeeklyNoteSettings,
  type IGranularity,
} from "./periodic-notes";
import { wordCountSource } from "./sources";
import { activeFile, settings } from "./stores";

interface CalendarExports {
  tick: () => void;
  setDisplayedMonth: (date: Moment) => void;
}

export default class CalendarView extends ItemView {
  private calendar!: CalendarExports;
  private settings!: ISettings;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);

    this.registerEvent(
      this.app.workspace.on("file-open", this.onFileOpen.bind(this)),
    );

    this.register(
      settings.subscribe((val) => {
        this.settings = val;
        if (this.calendar) {
          this.calendar.tick();
        }
      }),
    );
  }

  getViewType(): string {
    return VIEW_TYPE_CALENDAR;
  }

  getDisplayText(): string {
    return "Calendar";
  }

  getIcon(): string {
    return "calendar-with-checkmark";
  }

  onClose(): Promise<void> {
    if (this.calendar) {
      unmount(this.calendar);
    }
    return Promise.resolve();
  }

  async onOpen(): Promise<void> {
    const sources = [wordCountSource];
    this.app.workspace.trigger(TRIGGER_ON_OPEN, sources);

    const fileCache = new PeriodicNotesCache(this, sources);

    const cal = mount(Calendar, {
      target: this.contentEl,
      props: {
        fileCache,
        sources,
        onHover: this.onHover.bind(this),
        onClick: this.onClick.bind(this),
        onContextMenu: this.onContextMenu.bind(this),
      },
    });
    if (!("tick" in cal && "setDisplayedMonth" in cal)) {
      throw new Error("Calendar component missing expected exports");
    }
    this.calendar = cal as CalendarExports;
  }

  private onHover(
    granularity: IGranularity,
    date: Moment,
    file: TFile | null,
    targetEl: EventTarget,
    isMetaPressed: boolean,
  ): void {
    if (!isMetaPressed) {
      return;
    }
    const formattedDate = date.format(
      granularity === "day"
        ? "YYYY-MM-DD"
        : date.localeData().longDateFormat("L"),
    );
    this.app.workspace.trigger(
      "link-hover",
      this,
      targetEl,
      formattedDate,
      file?.path,
    );
  }

  private onClick(
    granularity: IGranularity,
    date: Moment,
    existingFile: TFile | null,
    inNewSplit: boolean,
  ): void {
    if (existingFile) {
      this.openFile(existingFile, inNewSplit);
      return;
    }

    if (granularity === "day") {
      tryToCreateDailyNote(date, inNewSplit, this.settings, (file) => {
        activeFile.setFile(file);
      });
    } else if (granularity === "week") {
      const startOfWeek = date.clone().startOf("week");
      tryToCreateWeeklyNote(startOfWeek, inNewSplit, this.settings, (file) => {
        activeFile.setFile(file);
      });
    }
  }

  private onContextMenu(
    _granularity: IGranularity,
    _date: Moment,
    file: TFile | null,
    event: MouseEvent,
  ): void {
    if (!file) {
      return;
    }
    showFileMenu(this.app, file, {
      x: event.pageX,
      y: event.pageY,
    });
  }

  private async openFile(file: TFile, inNewSplit: boolean): Promise<void> {
    const { workspace } = this.app;
    const leaf = workspace.getLeaf(inNewSplit ? "split" : false);
    await leaf.openFile(file, { active: true });
    activeFile.setFile(file);
  }

  public onFileOpen(_file: TFile | null): void {
    if (this.app.workspace.layoutReady) {
      this.updateActiveFile();
    }
  }

  private updateActiveFile(): void {
    const file = this.app.workspace.getActiveFile();
    activeFile.setFile(file);

    if (this.calendar) {
      this.calendar.tick();
    }
  }

  public revealActiveNote(): void {
    if (!this.calendar) return;
    const { moment } = window;
    const file = this.app.workspace.getActiveFile();
    if (!file) return;

    let date = getDateFromFile(file, "day");
    if (date) {
      this.calendar.setDisplayedMonth(date);
      return;
    }

    const { format } = getWeeklyNoteSettings();
    date = moment(file.basename, format, true);
    if (date.isValid()) {
      this.calendar.setDisplayedMonth(date);
    }
  }
}
```

**`CalendarView` acts as the controller:**

1. **`onOpen()`** creates the `PeriodicNotesCache` (file store), mounts the Svelte `Calendar` component with event handlers, and fires `TRIGGER_ON_OPEN` so other plugins can add metadata sources.
2. **`onClick()`** either opens an existing file or creates a new daily/weekly note. For weeks, it normalizes to start-of-week before creation.
3. **`onHover()`** triggers Obsidian's link-hover preview when the meta key (Cmd/Ctrl) is held.
4. **`onContextMenu()`** shows the file context menu (delete, etc.) if a note exists for that day.
5. **`revealActiveNote()`** parses the active file's basename to find its date, then navigates the calendar to that month.

The view subscribes to the settings store in the constructor. On every settings change, it calls `tick()` to re-render the calendar grid.

---

## 6. File Cache — `src/components/fileStore.ts`

The `PeriodicNotesCache` maps `dateUID → TFile` and keeps the map in sync with vault events.

```bash
cat src/components/fileStore.ts
```

```output
import type { Moment } from "moment";
import { type App, type Component, type TAbstractFile, TFile } from "obsidian";
import type { Writable } from "svelte/store";
import { get, writable } from "svelte/store";
import {
  getAllDailyNotes,
  getAllMonthlyNotes,
  getAllWeeklyNotes,
  getDateFromFile,
  getDateFromPath,
  getDateUID,
  type IGranularity,
} from "../periodic-notes";

import type { ICalendarSource, IDayMetadata, ISourceSettings } from "./types";

type PeriodicNoteID = string;

export function getDateUIDFromFile(file: TFile | null): string | null {
  if (!file) {
    return null;
  }
  for (const granularity of ["day", "week", "month"] as IGranularity[]) {
    const date = getDateFromFile(file, granularity);
    if (date) {
      return getDateUID(date, granularity);
    }
  }
  return null;
}

function getDateUIDFromPath(path: string | null): string | null {
  if (!path) {
    return null;
  }
  for (const granularity of ["day", "week", "month"] as IGranularity[]) {
    const date = getDateFromPath(path, granularity);
    if (date) {
      return getDateUID(date, granularity);
    }
  }
  return null;
}

export default class PeriodicNotesCache {
  private app: App;
  public store: Writable<Record<PeriodicNoteID, TFile>>;
  private sources: ICalendarSource[];

  constructor(component: Component & { app: App }, sources: ICalendarSource[]) {
    this.app = component.app;
    this.sources = sources;
    this.store = writable<Record<PeriodicNoteID, TFile>>({});

    this.app.workspace.onLayoutReady(() => {
      const { vault } = this.app;
      component.registerEvent(vault.on("create", this.onFileCreated, this));
      component.registerEvent(vault.on("delete", this.onFileDeleted, this));
      component.registerEvent(vault.on("rename", this.onFileRenamed, this));
      component.registerEvent(vault.on("modify", this.onFileModified, this));
      this.initialize();
    });

    // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
    const workspace = this.app.workspace as any;
    component.registerEvent(
      workspace.on("periodic-notes:settings-updated", this.initialize, this),
    );
    component.registerEvent(
      workspace.on("calendar:metadata-updated", this.initialize, this),
    );
  }

  public onFileCreated(file: TAbstractFile): void {
    if (file instanceof TFile && file.extension === "md") {
      const uid = getDateUIDFromFile(file);
      if (uid) {
        this.store.update((notes) => ({ ...notes, [uid]: file }));
      }
    }
  }

  public onFileDeleted(file: TAbstractFile): void {
    if (file instanceof TFile && file.extension === "md") {
      const uid = getDateUIDFromFile(file);
      if (uid) {
        this.store.update((notes) => {
          const updated = { ...notes };
          delete updated[uid];
          return updated;
        });
      }
    }
  }

  public onFileModified(file: TAbstractFile): void {
    if (file instanceof TFile && file.extension === "md") {
      const uid = getDateUIDFromFile(file);
      if (uid) {
        this.store.update((notes) => ({ ...notes, [uid]: file }));
      }
    }
  }

  public onFileRenamed(file: TAbstractFile, oldPath: string): void {
    const uid = getDateUIDFromPath(oldPath);
    if (uid) {
      this.store.update((notes) => {
        const updated = { ...notes };
        delete updated[uid];
        return updated;
      });
    }
    this.onFileCreated(file);
  }

  public initialize(): void {
    try {
      this.store.set({
        ...getAllDailyNotes(),
        ...getAllWeeklyNotes(),
        ...getAllMonthlyNotes(),
      });
    } catch (err) {
      console.error(
        "[Calendar] Failed to initialize periodic notes cache",
        err,
      );
    }
  }

  public getFile(date: Moment, granularity: IGranularity): TFile | null {
    const uid = getDateUID(date, granularity);
    return get(this.store)[uid] ?? null;
  }

  public getFileForPeriodicNote(id: PeriodicNoteID): TFile | null {
    return get(this.store)[id] ?? null;
  }

  public async getEvaluatedMetadata(
    granularity: IGranularity,
    date: Moment,
    getSourceSettings: (sourceId: string) => ISourceSettings,
  ): Promise<IDayMetadata[]> {
    const uid = getDateUID(date, granularity);
    const file = this.getFileForPeriodicNote(uid);

    const metadata = [];
    for (const source of this.sources) {
      const evaluatedMetadata = (await source.getMetadata?.(
        granularity,
        date,
        file,
      )) || { value: 0, dots: [] };
      const sourceSettings = getSourceSettings(source.id);

      metadata.push({
        ...evaluatedMetadata,
        ...source,
        ...sourceSettings,
      });
    }
    return metadata;
  }

  public onDragStart(event: DragEvent, file: TFile): void {
    // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
    const dragManager = (<any>this.app).dragManager;
    const dragData = dragManager.dragFile(event, file);
    dragManager.onDragStart(event, dragData);
  }
}
```

**How the cache works:**

1. **Initialization** — on layout ready, registers vault event listeners and calls `initialize()`, which bulk-loads all daily, weekly, and monthly notes into a `Record<dateUID, TFile>`.
2. **Create/Delete/Modify** — each handler checks `file.extension === "md"`, derives the dateUID, and updates the store. The store is a Svelte writable, so all subscribers re-render.
3. **Rename** — removes the old UID and then delegates to `onFileCreated` for the new path. This is non-atomic (issue #26): two separate store updates instead of one.
4. **Metadata resolution** — `getEvaluatedMetadata()` looks up the file for a date, runs each source's `getMetadata()`, merges source settings, and returns metadata for rendering dots.
5. **Drag support** — uses Obsidian's private `dragManager` API (cast to `any`).

Also listens to custom workspace events `periodic-notes:settings-updated` and `calendar:metadata-updated` to re-initialize when external plugins change config.

**Concern:** `initialize()` catches all errors silently — user sees empty calendar with no feedback (issue #29).

---

## 7. Type Definitions — `src/components/types.ts`

```bash
cat src/components/types.ts
```

```output
import type { Moment } from "moment";
import type { TFile } from "obsidian";
import type { IGranularity } from "../periodic-notes";

export interface IDot {
  isFilled: boolean;
  color?: string;
  className?: string;
}

export interface IWeek {
  days: Moment[];
  weekNum: number;
}

export type IMonth = IWeek[];

export type IHTMLAttributes = Record<string, string | number | boolean>;

export interface IEvaluatedMetadata {
  value: number | string;
  dots: IDot[];
  attrs?: IHTMLAttributes;
}

export interface ISourceSettings {
  color: string;
  display: "calendar-and-menu" | "menu" | "none";
  order: number;
}

export interface IDayMetadata
  extends ICalendarSource,
    ISourceSettings,
    IEvaluatedMetadata {}

export interface IEventHandlers {
  onHover: (
    periodicity: IGranularity,
    date: Moment,
    file: TFile | null,
    targetEl: EventTarget,
    isMetaPressed: boolean,
  ) => void;
  onClick: (
    granularity: IGranularity,
    date: Moment,
    existingFile: TFile | null,
    inNewSplit: boolean,
  ) => void;
  onContextMenu: (
    granularity: IGranularity,
    date: Moment,
    file: TFile | null,
    event: MouseEvent,
  ) => void;
}

export interface ICalendarSource {
  id: string;
  name: string;

  getMetadata?: (
    granularity: IGranularity,
    date: Moment,
    file: TFile | null,
  ) => Promise<IEvaluatedMetadata>;

  defaultSettings: Record<string, string | number>;
}
```

The type system defines the plugin's extension points:

- **`ICalendarSource`** — any metadata provider (word count, tasks, etc.) implements this. The `getMetadata` function is async and receives the granularity, date, and file reference.
- **`IDayMetadata`** — the merged result of source + settings + evaluated metadata, consumed by `Dots.svelte`.
- **`IEventHandlers`** — the three interaction callbacks passed from the view to all interactive components.

This is a well-designed extensibility pattern. Third-party plugins could add sources via the `TRIGGER_ON_OPEN` workspace event.

---

## 8. Word Count Source — `src/sources.ts`

The only built-in metadata source. Counts words and maps them to dots.

```bash
cat src/sources.ts
```

```output
import type { TFile } from "obsidian";
import { DEFAULT_WORDS_PER_DOT, MAX_DOTS } from "src/constants";
import { get } from "svelte/store";
import type {
  ICalendarSource,
  IDot,
  IEvaluatedMetadata,
} from "./components/types";

import { settings } from "./stores";

function clamp(num: number, lowerBound: number, upperBound: number): number {
  return Math.min(Math.max(lowerBound, num), upperBound);
}

function getWordCount(text: string): number {
  const spaceDelimitedChars =
    /A-Za-z\u00AA\u00B5\u00BA\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0-\u08B4\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16F1-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2183\u2184\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005\u3006\u3031-\u3035\u303B\u303C\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6E5\uA717-\uA71F\uA722-\uA788\uA78B-\uA7AD\uA7B0-\uA7B7\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB65\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC/
      .source;
  const nonSpaceDelimitedWords =
    /\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u4E00-\u9FD5/.source;

  const pattern = new RegExp(
    [
      `(?:[0-9]+(?:(?:,|\\.)[0-9]+)*|[\\-${spaceDelimitedChars}])+`,
      nonSpaceDelimitedWords,
    ].join("|"),
    "g",
  );
  return (text.match(pattern) || []).length;
}

async function getWordLengthAsDots(note: TFile): Promise<number> {
  const { wordsPerDot = DEFAULT_WORDS_PER_DOT } = get(settings);
  if (!note || wordsPerDot <= 0) {
    return 0;
  }
  const fileContents = await window.app.vault.cachedRead(note);

  const wordCount = getWordCount(fileContents);
  const numDots = wordCount / wordsPerDot;
  // Minimum of 1: a dot signals the note exists, regardless of word count
  return clamp(Math.floor(numDots), 1, MAX_DOTS);
}

async function getDotsForNote(note: TFile | null): Promise<IDot[]> {
  if (!note) {
    return [];
  }
  const numSolidDots = await getWordLengthAsDots(note);

  const dots: IDot[] = [];
  for (let i = 0; i < numSolidDots; i++) {
    dots.push({
      color: "default",
      isFilled: true,
    });
  }
  return dots;
}

export const wordCountSource: ICalendarSource = {
  id: "word-count",
  name: "Word Count",
  defaultSettings: {},
  getMetadata: async (
    _granularity,
    _date,
    file: TFile | null,
  ): Promise<IEvaluatedMetadata> => ({
    value: 0,
    dots: await getDotsForNote(file),
  }),
};
```

**Word counting pipeline:**

1. `getWordCount()` uses an extensive Unicode-aware regex to handle both space-delimited languages (Latin, Cyrillic, Arabic, etc.) and non-space-delimited languages (CJK characters). Each regex match = one word.
2. `getWordLengthAsDots()` divides word count by `wordsPerDot` (default 250), clamps to 1–5. The **minimum of 1** is intentional: any note with content gets at least one dot to signal existence.
3. `getDotsForNote()` builds an array of filled dot objects.
4. `wordCountSource` wraps this as an `ICalendarSource` — the dots appear on each day cell.

The regex is extensive but well-established (likely from a Unicode word segmentation reference). It handles most scripts correctly.

---

## 9. Periodic Notes — Date Parsing

`src/periodic-notes/parse.ts` maps file paths ↔ dates using format strings.

```bash
cat src/periodic-notes/parse.ts
```

```output
import type { Moment } from "moment";
import type { TFile } from "obsidian";
import {
  getDailyNoteSettings,
  getMonthlyNoteSettings,
  getQuarterlyNoteSettings,
  getWeeklyNoteSettings,
  getYearlyNoteSettings,
} from "./settings";
import type { IGranularity } from "./types";

export function getDateUID(
  date: Moment,
  granularity: IGranularity = "day",
): string {
  const ts = date.clone().startOf(granularity).format();
  return `${granularity}-${ts}`;
}

function removeEscapedCharacters(format: string): string {
  return format.replace(/\[[^\]]*\]/g, "");
}

function isFormatAmbiguous(format: string, granularity: IGranularity): boolean {
  if (granularity === "week") {
    const cleanFormat = removeEscapedCharacters(format);
    return (
      /w{1,2}/i.test(cleanFormat) &&
      (/M{1,4}/.test(cleanFormat) || /D{1,4}/.test(cleanFormat))
    );
  }
  return false;
}

function basename(fullPath: string): string {
  let base = fullPath.substring(fullPath.lastIndexOf("/") + 1);
  if (base.lastIndexOf(".") !== -1) {
    base = base.substring(0, base.lastIndexOf("."));
  }
  return base;
}

function getDateFromFilename(
  filename: string,
  granularity: IGranularity,
): Moment | null {
  const getSettings = {
    day: getDailyNoteSettings,
    week: getWeeklyNoteSettings,
    month: getMonthlyNoteSettings,
    quarter: getQuarterlyNoteSettings,
    year: getYearlyNoteSettings,
  };
  const format = getSettings[granularity]().format?.split("/").pop() ?? "";
  const noteDate = window.moment(filename, format, true);
  if (!noteDate.isValid()) {
    return null;
  }
  if (isFormatAmbiguous(format, granularity)) {
    if (granularity === "week") {
      const cleanFormat = removeEscapedCharacters(format);
      if (/w{1,2}/i.test(cleanFormat)) {
        return window.moment(
          filename,
          format.replace(/M{1,4}/g, "").replace(/D{1,4}/g, ""),
          false,
        );
      }
    }
  }
  return noteDate;
}

export function getDateFromFile(
  file: TFile,
  granularity: IGranularity,
): Moment | null {
  return getDateFromFilename(file.basename, granularity);
}

export function getDateFromPath(
  path: string,
  granularity: IGranularity,
): Moment | null {
  return getDateFromFilename(basename(path), granularity);
}
```

**Date UID generation:** `getDateUID("2024-03-08", "day")` → `"day-2024-03-08T00:00:00-05:00"`. The date is normalized to start-of-granularity so different times on the same day map to the same UID.

**File → Date parsing:** The file's basename is matched against the configured format string using `moment(filename, format, true)` (strict mode). The `isFormatAmbiguous()` check handles a tricky edge case: weekly note formats that include both week numbers *and* month/day tokens (e.g., `gggg-[W]ww-MM`). In this case, the month/day tokens are stripped so Moment doesn't get confused.

**`basename()` is reimplemented** rather than using Node's `path.basename` — this avoids importing Node modules in a browser context.

---

## 10. Periodic Notes — Settings Bridge

`src/periodic-notes/settings.ts` reads config from either the Periodic Notes community plugin or Obsidian's built-in Daily Notes plugin.

```bash
cat src/periodic-notes/settings.ts
```

```output
import type { IPeriodicNoteSettings } from "./types";

const DEFAULT_DAILY_NOTE_FORMAT = "YYYY-MM-DD";
const DEFAULT_WEEKLY_NOTE_FORMAT = "gggg-[W]ww";
const DEFAULT_MONTHLY_NOTE_FORMAT = "YYYY-MM";
const DEFAULT_QUARTERLY_NOTE_FORMAT = "YYYY-[Q]Q";
const DEFAULT_YEARLY_NOTE_FORMAT = "YYYY";

type Periodicity = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

function shouldUsePeriodicNotesSettings(periodicity: Periodicity): boolean {
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
```

**Settings priority chain:**

1. **Periodic Notes plugin** (community) — if installed and the relevant periodicity is enabled, its settings win.
2. **Built-in Daily Notes plugin** — fallback for daily notes.
3. **Calendar plugin's own settings** — fallback for weekly notes.
4. **Hardcoded defaults** — `YYYY-MM-DD`, `gggg-[W]ww`, `YYYY-MM`, etc.

Every getter catches errors and falls back to defaults — the calendar always has a valid format string. The `appHas*Loaded()` helpers determine what note types are available, controlling UI visibility (e.g., the weekly note column).

**Concern:** The heavy `as any` casting (13 instances) is necessary because Obsidian doesn't export types for `internalPlugins`, `plugins.getPlugin()` return values, or their settings objects (issue #30). A utility type could centralize these casts.

---

## 11. Periodic Notes — Vault Operations

`src/periodic-notes/vault.ts` creates notes with template support and collects existing notes.

```bash
cat src/periodic-notes/vault.ts
```

```output
import type { Moment } from "moment";
import { Notice, normalizePath, TFile, TFolder, Vault } from "obsidian";
import { getDateFromFile, getDateUID } from "./parse";
import {
  appHasMonthlyNotesPluginLoaded,
  appHasWeeklyNotesPluginLoaded,
  getDailyNoteSettings,
  getMonthlyNoteSettings,
  getWeeklyNoteSettings,
} from "./settings";
import type { IGranularity } from "./types";

function join(...partSegments: string[]): string {
  let parts: string[] = [];
  for (let i = 0, l = partSegments.length; i < l; i++) {
    parts = parts.concat(partSegments[i].split("/"));
  }
  const newParts: string[] = [];
  for (let i = 0, l = parts.length; i < l; i++) {
    const part = parts[i];
    if (!part || part === ".") continue;
    newParts.push(part);
  }
  if (parts[0] === "") newParts.unshift("");
  return newParts.join("/");
}

async function ensureFolderExists(path: string): Promise<void> {
  const dirs = path.replace(/\\/g, "/").split("/");
  dirs.pop();
  let current = "";
  for (const segment of dirs) {
    if (!segment) continue;
    current = current ? `${current}/${segment}` : segment;
    if (!window.app.vault.getAbstractFileByPath(current)) {
      await window.app.vault.createFolder(current);
    }
  }
}

async function getNotePath(
  directory: string,
  filename: string,
): Promise<string> {
  let fname = filename;
  if (!fname.endsWith(".md")) {
    fname += ".md";
  }
  const path = normalizePath(join(directory, fname));
  await ensureFolderExists(path);
  return path;
}

async function getTemplateInfo(
  template: string,
  noteType = "daily",
): Promise<[string, Record<string, unknown> | null]> {
  const { metadataCache, vault } = window.app;
  const templatePath = normalizePath(template);
  if (templatePath === "/") {
    return ["", null];
  }
  try {
    const templateFile = metadataCache.getFirstLinkpathDest(templatePath, "");
    if (!templateFile) {
      throw new Error(`Template not found: ${templatePath}`);
    }
    const contents = await vault.cachedRead(templateFile);
    // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
    const foldInfo = (window.app as any).foldManager.load(templateFile);
    return [contents, foldInfo];
  } catch (err) {
    console.error(
      `Failed to read the ${noteType} note template '${templatePath}'`,
      err,
    );
    new Notice(`Failed to read the ${noteType} note template`);
    return ["", null];
  }
}

export async function createDailyNote(date: Moment): Promise<TFile> {
  const { vault } = window.app;
  const { moment } = window;
  const { template, format, folder } = getDailyNoteSettings();
  const [templateContents, foldInfo] = await getTemplateInfo(
    template ?? "",
    "daily",
  );
  const fmt = format || "YYYY-MM-DD";
  const filename = date.format(fmt);
  const normalizedPath = await getNotePath(folder ?? "", filename);
  try {
    const createdFile = await vault.create(
      normalizedPath,
      templateContents
        .replace(/{{\s*date\s*}}/gi, filename)
        .replace(/{{\s*time\s*}}/gi, moment().format("HH:mm"))
        .replace(/{{\s*title\s*}}/gi, filename)
        .replace(
          /{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi,
          (_, _timeOrDate, calc, timeDelta, unit, momentFormat) => {
            const now = moment();
            const currentDate = date.clone().set({
              hour: now.get("hour"),
              minute: now.get("minute"),
              second: now.get("second"),
            });
            if (calc) {
              currentDate.add(parseInt(timeDelta, 10), unit);
            }
            if (momentFormat) {
              return currentDate.format(momentFormat.substring(1).trim());
            }
            return currentDate.format(fmt);
          },
        )
        .replace(
          /{{\s*yesterday\s*}}/gi,
          date.clone().subtract(1, "day").format(fmt),
        )
        .replace(/{{\s*tomorrow\s*}}/gi, date.clone().add(1, "d").format(fmt)),
    );
    if (foldInfo) {
      // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
      (window.app as any).foldManager.save(createdFile, foldInfo);
    }
    return createdFile;
  } catch (err) {
    console.error(`Failed to create file: '${normalizedPath}'`, err);
    new Notice("Unable to create new file.");
    throw err;
  }
}

function getDaysOfWeek(): string[] {
  const { moment } = window;
  // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
  let weekStart = (moment.localeData() as any)._week.dow;
  const daysOfWeek = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  while (weekStart) {
    // biome-ignore lint/style/noNonNullAssertion: array is guaranteed non-empty
    daysOfWeek.push(daysOfWeek.shift()!);
    weekStart--;
  }
  return daysOfWeek;
}

function getDayOfWeekNumericalValue(dayOfWeekName: string): number {
  return getDaysOfWeek().indexOf(dayOfWeekName.toLowerCase());
}

export async function createWeeklyNote(date: Moment): Promise<TFile> {
  const { vault } = window.app;
  const { template, format, folder } = getWeeklyNoteSettings();
  const [templateContents, foldInfo] = await getTemplateInfo(
    template ?? "",
    "weekly",
  );
  const fmt = format || "gggg-[W]ww";
  const filename = date.format(fmt);
  const normalizedPath = await getNotePath(folder ?? "", filename);
  try {
    const createdFile = await vault.create(
      normalizedPath,
      templateContents
        .replace(
          /{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi,
          (_, _timeOrDate, calc, timeDelta, unit, momentFormat) => {
            const now = window.moment();
            const currentDate = date.clone().set({
              hour: now.get("hour"),
              minute: now.get("minute"),
              second: now.get("second"),
            });
            if (calc) {
              currentDate.add(parseInt(timeDelta, 10), unit);
            }
            if (momentFormat) {
              return currentDate.format(momentFormat.substring(1).trim());
            }
            return currentDate.format(fmt);
          },
        )
        .replace(/{{\s*title\s*}}/gi, filename)
        .replace(/{{\s*time\s*}}/gi, window.moment().format("HH:mm"))
        .replace(
          /{{\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s*:(.*?)}}/gi,
          (_, dayOfWeek, momentFormat) => {
            const day = getDayOfWeekNumericalValue(dayOfWeek);
            return date.weekday(day).format(momentFormat.trim());
          },
        ),
    );
    if (foldInfo) {
      // biome-ignore lint/suspicious/noExplicitAny: Obsidian API lacks type
      (window.app as any).foldManager.save(createdFile, foldInfo);
    }
    return createdFile;
  } catch (err) {
    console.error(`Failed to create file: '${normalizedPath}'`, err);
    new Notice("Unable to create new file.");
    throw err;
  }
}

function collectNotes(
  folder: string,
  granularity: IGranularity,
): Record<string, TFile> {
  const { vault } = window.app;
  const normalizedPath = normalizePath(folder);
  const notesFolder = normalizedPath
    ? vault.getAbstractFileByPath(normalizedPath)
    : vault.getRoot();
  if (!(notesFolder instanceof TFolder)) {
    return {};
  }
  const notes: Record<string, TFile> = {};
  Vault.recurseChildren(notesFolder, (note) => {
    if (note instanceof TFile) {
      const date = getDateFromFile(note, granularity);
      if (date) {
        notes[getDateUID(date, granularity)] = note;
      }
    }
  });
  return notes;
}

export function getAllDailyNotes(): Record<string, TFile> {
  const { folder } = getDailyNoteSettings();
  return collectNotes(folder ?? "", "day");
}

export function getAllWeeklyNotes(): Record<string, TFile> {
  if (!appHasWeeklyNotesPluginLoaded()) {
    return {};
  }
  const { folder } = getWeeklyNoteSettings();
  return collectNotes(folder ?? "", "week");
}

export function getAllMonthlyNotes(): Record<string, TFile> {
  if (!appHasMonthlyNotesPluginLoaded()) {
    return {};
  }
  const { folder } = getMonthlyNoteSettings();
  return collectNotes(folder ?? "", "month");
}
```

**Template variable expansion** supports:

| Variable | Example | Description |
|----------|---------|-------------|
| `{{date}}` | `2024-03-08` | Current date in note format |
| `{{time}}` | `14:30` | Current time HH:mm |
| `{{title}}` | `2024-03-08` | Same as date (filename) |
| `{{date±Xd:fmt}}` | `{{date+1d:YYYY-MM-DD}}` | Relative date with custom format |
| `{{yesterday}}` | `2024-03-07` | Previous day |
| `{{tomorrow}}` | `2024-03-09` | Next day |
| `{{monday:fmt}}` | (weekly only) | Day of week in custom format |

**`collectNotes()`** recursively walks a folder, parses each `.md` file's basename against the format string, and builds the `dateUID → TFile` map. This is called once at initialization and on settings changes.

**Concerns:**
- `ensureFolderExists()` has a check-then-act race (issue #27) — between checking and creating, another process could create the folder.
- `createDailyNote()` and `createWeeklyNote()` share substantial template logic. A shared function could reduce duplication.

---

## 12. Note Creation Flow — `src/io/notes.ts`

Wraps vault operations with optional confirmation modal.

```bash
cat src/io/notes.ts
```

```output
import type { Moment } from "moment";
import { Notice, type TFile } from "obsidian";
import { createConfirmationDialog } from "src/modal";
import type { ISettings } from "src/settings";
import {
  createDailyNote,
  createWeeklyNote,
  getDailyNoteSettings,
  getWeeklyNoteSettings,
} from "../periodic-notes";

async function tryToCreateNote(
  date: Moment,
  inNewSplit: boolean,
  settings: ISettings,
  createNote: (date: Moment) => Promise<TFile>,
  getSettings: () => { format?: string },
  title: string,
  cb?: (file: TFile) => void,
): Promise<void> {
  const { workspace } = window.app;
  const { format = "YYYY-MM-DD" } = getSettings();
  const filename = date.format(format);

  const createFile = async () => {
    try {
      const note = await createNote(date);
      const leaf = workspace.getLeaf(inNewSplit ? "split" : false);
      await leaf.openFile(note, { active: true });
      cb?.(note);
    } catch (err) {
      console.error(`[Calendar] Failed to create ${title}`, err);
      new Notice(`Failed to create note: ${filename}`);
    }
  };

  if (settings.shouldConfirmBeforeCreate) {
    createConfirmationDialog({
      cta: "Create",
      onAccept: createFile,
      text: `File ${filename} does not exist. Would you like to create it?`,
      title,
    });
  } else {
    await createFile();
  }
}

export async function tryToCreateDailyNote(
  date: Moment,
  inNewSplit: boolean,
  settings: ISettings,
  cb?: (newFile: TFile) => void,
): Promise<void> {
  return tryToCreateNote(
    date,
    inNewSplit,
    settings,
    createDailyNote,
    getDailyNoteSettings,
    "New Daily Note",
    cb,
  );
}

export async function tryToCreateWeeklyNote(
  date: Moment,
  inNewSplit: boolean,
  settings: ISettings,
  cb?: (file: TFile) => void,
): Promise<void> {
  return tryToCreateNote(
    date,
    inNewSplit,
    settings,
    createWeeklyNote,
    getWeeklyNoteSettings,
    "New Weekly Note",
    cb,
  );
}
```

**Note creation flow:**

1. Format the date → filename.
2. If `shouldConfirmBeforeCreate` is on, show a modal asking "File X does not exist. Would you like to create it?"
3. On accept (or if confirmation is off), call `createDailyNote()`/`createWeeklyNote()`, open the new file in the current or split leaf, and call the callback to update `activeFile`.

Error handling catches failures and shows a Notice. The `tryToCreateNote()` shared function eliminates duplication between daily and weekly creation.

---

## 13. Confirmation Modal — `src/modal.ts`

```bash
cat src/modal.ts
```

```output
import { type App, Modal } from "obsidian";

interface IConfirmationDialogParams {
  cta: string;
  // biome-ignore lint/suspicious/noExplicitAny: generic callback signature
  onAccept: (...args: any[]) => Promise<void>;
  text: string;
  title: string;
}

class ConfirmationModal extends Modal {
  constructor(app: App, config: IConfirmationDialogParams) {
    super(app);

    const { cta, onAccept, text, title } = config;

    this.contentEl.createEl("h2", { text: title });
    this.contentEl.createEl("p", { text });

    this.contentEl.createDiv("modal-button-container", (buttonsEl) => {
      buttonsEl
        .createEl("button", { text: "Never mind" })
        .addEventListener("click", () => this.close());

      buttonsEl
        .createEl("button", {
          cls: "mod-cta",
          text: cta,
        })
        .addEventListener("click", async (e) => {
          try {
            await onAccept(e);
          } finally {
            this.close();
          }
        });
    });
  }
}

export function createConfirmationDialog({
  cta,
  onAccept,
  text,
  title,
}: IConfirmationDialogParams): void {
  new ConfirmationModal(window.app, { cta, onAccept, text, title }).open();
}
```

Simple modal with two buttons: "Never mind" (close) and the CTA ("Create"). The `try/finally` ensures the modal closes even if `onAccept` throws, though there's no `catch` block (issue #33).

---

## 14. File Context Menu — `src/fileMenu.ts`

```bash
cat src/fileMenu.ts
```

```output
import { type App, Menu, type Point, type TFile } from "obsidian";

export function showFileMenu(app: App, file: TFile, position: Point): void {
  const fileMenu = new Menu();
  fileMenu.addItem((item) =>
    item
      .setTitle("Delete")
      .setIcon("trash")
      .onClick(() => {
        app.vault.trash(file, true);
      }),
  );

  app.workspace.trigger(
    "file-menu",
    fileMenu,
    file,
    "calendar-context-menu",
    null,
  );
  fileMenu.showAtPosition(position);
}
```

The context menu adds a "Delete" action (moves to trash, not permanent delete — safe). It also triggers the `file-menu` workspace event so other plugins can add their own menu items to the calendar's context menu. Good community integration.

---

## 15. Svelte Components — The UI Layer

Now we walk through the component tree from root to leaf.

### Calendar.svelte — Root Component

```bash
cat src/components/Calendar.svelte
```

```output
<script lang="ts">
  import type { Moment } from "moment";
  import { onDestroy, setContext } from "svelte";
  import { get, writable } from "svelte/store";

  import type { ISettings } from "src/settings";
  import { activeFile, settings } from "../stores";
  import { DISPLAYED_MONTH } from "./context";
  import Day from "./Day.svelte";
  import type PeriodicNotesCache from "./fileStore";
  import Nav from "./Nav.svelte";
  import type { ICalendarSource, IEventHandlers, IMonth, ISourceSettings } from "./types";
  import { getDaysOfWeek, getMonth, isWeekend } from "./utils";
  import WeekNum from "./WeekNum.svelte";

  // Props from view.ts
  let {
    fileCache,
    sources = [],
    onHover,
    onClick,
    onContextMenu,
  }: {
    fileCache: PeriodicNotesCache;
    sources?: ICalendarSource[];
    onHover: IEventHandlers["onHover"];
    onClick: IEventHandlers["onClick"];
    onContextMenu: IEventHandlers["onContextMenu"];
  } = $props();

  // Internal state — today is both derived from settings (locale change) and
  // imperatively mutated by tick(), so it needs $state.raw + $effect.
  let today: Moment = $state.raw(window.moment());

  $effect(() => {
    today = getToday($settings);
  });

  // Initialise store and context before any $derived blocks that read $displayedMonthStore
  let displayedMonthStore = writable<Moment>(window.moment());
  setContext(DISPLAYED_MONTH, displayedMonthStore);

  let showWeekNums = $derived($settings.showWeeklyNote);
  let selectedId = $derived($activeFile);
  let eventHandlers: IEventHandlers = $derived({ onHover, onClick, onContextMenu });

  // Pass `today` explicitly so the derived blocks re-evaluate when locale changes
  let month: IMonth = $derived.by(() => getMonth($displayedMonthStore, today));
  let daysOfWeek: string[] = $derived.by(() => getDaysOfWeek(today));

  // Public API for view.ts
  export function tick() {
    today = window.moment();
  }

  export function setDisplayedMonth(date: Moment) {
    displayedMonthStore.set(date);
  }

  function getToday(_s: ISettings) {
    return window.moment();
  }

  // sourceId-based settings not yet persisted; all sources share defaults for now
  function getSourceSettings(_sourceId: string): ISourceSettings {
    return {
      color: "default",
      display: "calendar-and-menu",
      order: 0,
    };
  }

  // Heartbeat: update today every 60s; auto-advance displayed month if the user
  // was viewing the current month when the month boundary crossed.
  const heartbeat = setInterval(() => {
    const prevToday = today;
    tick();
    if (!prevToday.isSame(today, "month")) {
      if (get(displayedMonthStore).isSame(prevToday, "month")) {
        displayedMonthStore.set(today);
      }
    }
  }, 1000 * 60);

  onDestroy(() => {
    clearInterval(heartbeat);
  });
</script>

<div id="calendar-container" class="container">
  <Nav
    {fileCache}
    {today}
    {getSourceSettings}
    {eventHandlers}
  />
  <table class="calendar">
    <colgroup>
      {#if showWeekNums}
        <col />
      {/if}
      {#each month[1].days as date}
        <col class:weekend={isWeekend(date)} />
      {/each}
    </colgroup>
    <thead>
      <tr>
        {#if showWeekNums}
          <th>W</th>
        {/if}
        {#each daysOfWeek as dayOfWeek}
          <th>{dayOfWeek}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each month as week (week.weekNum)}
        <tr>
          {#if showWeekNums}
            <WeekNum
              {fileCache}
              {selectedId}
              {getSourceSettings}
              {...week}
              {...eventHandlers}
            />
          {/if}
          {#each week.days as day (day.format())}
            <Day
              date={day}
              {fileCache}
              {getSourceSettings}
              {today}
              {selectedId}
              {...eventHandlers}
            />
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .container {
    --color-background-heading: transparent;
    --color-background-day: transparent;
    --color-background-weeknum: transparent;
    --color-background-weekend: transparent;

    --color-dot: var(--text-muted);
    --color-arrow: var(--text-muted);
    --color-button: var(--text-muted);

    --color-text-title: var(--text-normal);
    --color-text-heading: var(--text-muted);
    --color-text-day: var(--text-normal);
    --color-text-today: var(--interactive-accent);
    --color-text-weeknum: var(--text-muted);
  }

  .container {
    padding: 0 8px;
  }

  .weekend {
    background-color: var(--color-background-weekend);
  }

  .calendar {
    border-collapse: collapse;
    width: 100%;
  }

  th {
    background-color: var(--color-background-heading);
    color: var(--color-text-heading);
    font-size: 0.6em;
    letter-spacing: 1px;
    padding: 4px;
    text-align: center;
    text-transform: uppercase;
  }
</style>
```

**Calendar.svelte is the Svelte 5 root:**

- **State**: `today` uses `$state.raw` + `$effect` for both reactive locale changes and imperative `tick()` calls. `month` and `daysOfWeek` are `$derived` from `displayedMonthStore` and `today`.
- **Context**: `DISPLAYED_MONTH` store is set via `setContext()` so `Nav` and `Month` can read/write the displayed month.
- **Heartbeat**: A 60-second interval auto-advances the displayed month when midnight crosses a month boundary while the user is viewing the current month.
- **Exported API**: `tick()` and `setDisplayedMonth()` are called by the view to refresh state.
- **CSS Variables**: All colors use Obsidian's CSS custom properties — the plugin inherits the user's theme.

The table structure uses `<colgroup>` to apply weekend styling to entire columns.

### Nav.svelte — Month Navigation

```bash
cat src/components/Nav.svelte
```

```output
<script lang="ts">
  import { getContext } from "svelte";
  import type { Writable } from "svelte/store";
  import type { Moment } from "moment";

  import Arrow from "./Arrow.svelte";
  import type PeriodicNotesCache from "./fileStore";
  import { DISPLAYED_MONTH } from "./context";
  import Dot from "./Dot.svelte";
  import Month from "./Month.svelte";
  import type { IEventHandlers, ISourceSettings } from "./types";

  let {
    getSourceSettings,
    fileCache,
    today,
    eventHandlers,
  }: {
    getSourceSettings: (sourceId: string) => ISourceSettings;
    fileCache: PeriodicNotesCache;
    today: Moment;
    eventHandlers: IEventHandlers;
  } = $props();

  let displayedMonth = getContext<Writable<Moment>>(DISPLAYED_MONTH);

  function incrementDisplayedMonth() {
    displayedMonth.update((month) => month.clone().add(1, "month"));
  }

  function decrementDisplayedMonth() {
    displayedMonth.update((month) => month.clone().subtract(1, "month"));
  }

  function resetDisplayedMonth() {
    displayedMonth.set(today.clone());
  }

  let showingCurrentMonth = $derived($displayedMonth.isSame(today, "month"));
</script>

<div class="nav">
  <Month
    {fileCache}
    {getSourceSettings}
    {resetDisplayedMonth}
    {...eventHandlers}
  />
  <div class="right-nav">
    <Arrow
      direction="left"
      onClick={decrementDisplayedMonth}
      tooltip="Previous Month"
    />
    <button
      type="button"
      aria-label={showingCurrentMonth ? 'Current month' : 'Reset to current month'}
      class="reset-button"
      class:active={!showingCurrentMonth}
      onclick={resetDisplayedMonth}
    >
      <Dot isFilled />
    </button>
    <Arrow
      direction="right"
      onClick={incrementDisplayedMonth}
      tooltip="Next Month"
    />
  </div>
</div>

<style>
  .nav {
    align-items: baseline;
    display: flex;
    margin: 0.6em 0 1em;
    padding: 0 8px;
    width: 100%;
  }

  .right-nav {
    align-items: center;
    display: flex;
    justify-content: center;
    margin-left: auto;
  }

  .reset-button {
    align-items: center;
    appearance: none;
    background: none;
    border: none;
    color: var(--color-arrow);
    cursor: default;
    display: flex;
    opacity: 0.4;
    padding: 0.5em;
  }

  .reset-button.active {
    cursor: pointer;
    opacity: 1;
  }
</style>
```

Nav reads the `DISPLAYED_MONTH` context store. Left/right arrows clone the date and add/subtract a month (cloning prevents mutating Moment objects). The center dot acts as a "today" button — it resets to the current month and dims when already showing it.

### Day.svelte — Individual Day Cell

```bash
cat src/components/Day.svelte
```

```output
<script lang="ts">
  import type { Moment } from "moment";
  import type { TFile } from "obsidian";
  import { type IGranularity, getDateUID } from "../periodic-notes";
  import { getContext } from "svelte";
  import type { Writable } from "svelte/store";

  import Dots from "./Dots.svelte";
  import MetadataResolver from "./MetadataResolver.svelte";
  import { DISPLAYED_MONTH } from "./context";
  import type PeriodicNotesCache from "./fileStore";
  import type {
    IDayMetadata,
    IHTMLAttributes,
    ISourceSettings,
  } from "./types";
  import { isMetaPressed } from "./utils";

  let {
    date,
    fileCache,
    getSourceSettings,
    onHover,
    onClick,
    onContextMenu,
    today,
    selectedId = null,
  }: {
    date: Moment;
    fileCache: PeriodicNotesCache;
    getSourceSettings: (sourceId: string) => ISourceSettings;
    onHover: (
      periodicity: IGranularity,
      date: Moment,
      file: TFile | null,
      targetEl: EventTarget,
      isMetaPressed: boolean,
    ) => void;
    onClick: (
      granularity: IGranularity,
      date: Moment,
      existingFile: TFile | null,
      inNewSplit: boolean,
    ) => void;
    onContextMenu: (
      granularity: IGranularity,
      date: Moment,
      file: TFile | null,
      event: MouseEvent,
    ) => void;
    today: Moment;
    selectedId: string | null;
  } = $props();

  const displayedMonth = getContext<Writable<Moment>>(DISPLAYED_MONTH);

  let file: TFile | null = $state(null);
  let metadata: Promise<IDayMetadata[]> | null = $state(null);

  $effect(() => {
    return fileCache.store.subscribe(() => {
      file = fileCache.getFile(date, "day");
      metadata = fileCache.getEvaluatedMetadata("day", date, getSourceSettings);
    });
  });

  function handleClick(event: MouseEvent) {
    onClick?.("day", date, file, isMetaPressed(event));
  }

  function handleHover(event: PointerEvent) {
    if (event.target) {
      onHover?.("day", date, file, event.target, isMetaPressed(event));
    }
  }

  function handleContextmenu(event: MouseEvent) {
    onContextMenu?.("day", date, file, event);
  }

  function getAttributes(metadata: IDayMetadata[]): IHTMLAttributes {
    if (!metadata) {
      return {};
    }
    return metadata
      .filter((meta) => meta.display === "calendar-and-menu")
      .reduce((acc, meta) => {
        return {
          ...acc,
          ...meta.attrs,
        };
      }, {});
  }
</script>

<td>
  <MetadataResolver {metadata}>
    {#snippet children(metadata)}
      <div
        class="day"
        class:active={selectedId === getDateUID(date, 'day')}
        class:adjacent-month={!date.isSame($displayedMonth, 'month')}
        class:has-note={!!file}
        class:today={date.isSame(today, 'day')}
        draggable={!!file}
        {...getAttributes(metadata ?? [])}
        onclick={handleClick}
        oncontextmenu={handleContextmenu}
        onpointerenter={handleHover}
        ondragstart={(event) => { if (file) fileCache.onDragStart(event, file); }}
      >
        {date.format("D")}
        <Dots metadata={metadata ?? []} />
      </div>
    {/snippet}
  </MetadataResolver>
</td>

<style>
  .day {
    background-color: var(--color-background-day);
    border-radius: 4px;
    color: var(--color-text-day);
    cursor: pointer;
    font-size: 0.8em;
    height: 100%;
    padding: 4px;
    position: relative;
    text-align: center;
    transition: background-color 0.1s ease-in, color 0.1s ease-in;
    vertical-align: baseline;
  }
  .day:hover {
    background-color: var(--interactive-hover);
  }

  .day.active:hover {
    background-color: var(--interactive-accent-hover);
  }

  .adjacent-month {
    opacity: 0.25;
  }

  .today {
    color: var(--color-text-today);
  }

  .day:active,
  .active,
  .active.today {
    color: var(--text-on-accent);
    background-color: var(--interactive-accent);
  }
</style>
```

**Day.svelte reactive pipeline:**

1. A `$effect` subscribes to `fileCache.store`. On every cache update, it looks up the file and metadata for this day's date.
2. `MetadataResolver` handles the async metadata promise — rendering dots only after resolution.
3. CSS classes toggle: `today` (accent color), `active` (currently selected file), `adjacent-month` (faded for overflow days), `has-note` (has a file).
4. Click → create or open note. Drag → `fileCache.onDragStart()`. Context menu → file menu. Hover with meta → link preview.

The `getAttributes()` function merges source-provided HTML attributes onto the day div — an extension point for custom styling from metadata sources.

### WeekNum.svelte — Week Number Column

```bash
cat src/components/WeekNum.svelte
```

```output
<script lang="ts">
  import type { Moment } from "moment";
  import type { TFile } from "obsidian";
  import { type IGranularity, getDateUID } from "../periodic-notes";
  import Dots from "./Dots.svelte";
  import type PeriodicNotesCache from "./fileStore";
  import MetadataResolver from "./MetadataResolver.svelte";
  import type { IDayMetadata, ISourceSettings } from "./types";
  import { getStartOfWeek, isMetaPressed } from "./utils";

  let {
    weekNum,
    days,
    getSourceSettings,
    onHover,
    onClick,
    onContextMenu,
    fileCache,
    selectedId = null,
  }: {
    weekNum: number;
    days: Moment[];
    getSourceSettings: (sourceId: string) => ISourceSettings;
    onHover: (
      periodicity: IGranularity,
      date: Moment,
      file: TFile | null,
      targetEl: EventTarget,
      isMetaPressed: boolean,
    ) => void;
    onClick: (
      granularity: IGranularity,
      date: Moment,
      existingFile: TFile | null,
      inNewSplit: boolean,
    ) => void;
    onContextMenu: (
      granularity: IGranularity,
      date: Moment,
      file: TFile | null,
      event: MouseEvent,
    ) => void;
    fileCache: PeriodicNotesCache;
    selectedId: string | null;
  } = $props();

  let file: TFile | null = $state(null);
  let metadata: Promise<IDayMetadata[]> | null = $state(null);
  let startOfWeek = $derived(getStartOfWeek(days));

  $effect(() => {
    return fileCache.store.subscribe(() => {
      file = fileCache.getFile(startOfWeek, "week");
      metadata = fileCache.getEvaluatedMetadata(
        "week",
        startOfWeek,
        getSourceSettings,
      );
    });
  });

  function handleHover(event: PointerEvent) {
    if (event.target) {
      onHover?.("week", startOfWeek, file, event.target, isMetaPressed(event));
    }
  }
</script>

<td>
  <MetadataResolver {metadata}>
    {#snippet children(metadata)}
      <div
        role="button"
        tabindex="0"
        class="week-num"
        class:active={selectedId === getDateUID(startOfWeek, 'week')}
        draggable={!!file}
        onclick={onClick &&
          ((e) => onClick('week', startOfWeek, file, isMetaPressed(e)))}
        onkeydown={onClick &&
          ((e) => (e.key === 'Enter' || e.key === ' ') && onClick('week', startOfWeek, file, false))}
        oncontextmenu={onContextMenu &&
          ((e) => onContextMenu('week', startOfWeek, file, e))}
        ondragstart={(event) => { if (file) fileCache.onDragStart(event, file); }}
        onpointerenter={handleHover}
      >
        {weekNum}
        <Dots metadata={metadata ?? []} />
      </div>
    {/snippet}
  </MetadataResolver>
</td>

<style>
  td {
    border-right: 1px solid var(--background-modifier-border);
  }

  .week-num {
    background-color: var(--color-background-weeknum);
    border-radius: 4px;
    color: var(--color-text-weeknum);
    cursor: pointer;
    font-size: 0.65em;
    height: 100%;
    padding: 4px;
    text-align: center;
    transition: background-color 0.1s ease-in, color 0.1s ease-in;
    vertical-align: baseline;
  }

  .week-num:hover {
    background-color: var(--interactive-hover);
  }

  .week-num.active:hover {
    background-color: var(--interactive-accent-hover);
  }

  .active {
    color: var(--text-on-accent);
    background-color: var(--interactive-accent);
  }
</style>
```

WeekNum mirrors Day's pattern but for weekly notes. It derives `startOfWeek` from the week's days array. Notable accessibility: uses `role="button"` with `tabindex="0"` and `onkeydown` for keyboard navigation (Enter/Space to activate).

### Supporting Components

```bash
echo "=== Month.svelte ===" && cat src/components/Month.svelte && echo "" && echo "=== Dots.svelte ===" && cat src/components/Dots.svelte && echo "" && echo "=== Dot.svelte ===" && cat src/components/Dot.svelte && echo "" && echo "=== Arrow.svelte ===" && cat src/components/Arrow.svelte && echo "" && echo "=== MetadataResolver.svelte ===" && cat src/components/MetadataResolver.svelte
```

```output
=== Month.svelte ===
<script lang="ts">
  import type { Moment } from "moment";
  import type { TFile } from "obsidian";
  import { getContext } from "svelte";
  import type { Writable } from "svelte/store";
  import {
    appHasMonthlyNotesPluginLoaded,
    type IGranularity,
  } from "../periodic-notes";

  import { DISPLAYED_MONTH } from "./context";
  import Dots from "./Dots.svelte";
  import type PeriodicNotesCache from "./fileStore";
  import MetadataResolver from "./MetadataResolver.svelte";
  import { isMetaPressed } from "./utils";
  import type { IDayMetadata, ISourceSettings } from "./types";

  let {
    fileCache,
    getSourceSettings,
    onHover,
    onClick,
    onContextMenu,
    resetDisplayedMonth,
  }: {
    fileCache: PeriodicNotesCache;
    getSourceSettings: (sourceId: string) => ISourceSettings;
    onHover: (
      periodicity: IGranularity,
      date: Moment,
      file: TFile | null,
      targetEl: EventTarget,
      isMetaPressed: boolean,
    ) => void;
    onClick: (
      granularity: IGranularity,
      date: Moment,
      existingFile: TFile | null,
      inNewSplit: boolean,
    ) => void;
    onContextMenu: (
      granularity: IGranularity,
      date: Moment,
      file: TFile | null,
      event: MouseEvent,
    ) => void;
    resetDisplayedMonth: () => void;
  } = $props();

  let displayedMonth = getContext<Writable<Moment>>(DISPLAYED_MONTH);
  let metadata: Promise<IDayMetadata[]> | null = $state(null);
  let file: TFile | null = $state(null);

  function refresh() {
    file = fileCache.getFile($displayedMonth, "month");
    metadata = fileCache.getEvaluatedMetadata(
      "month",
      $displayedMonth,
      getSourceSettings,
    );
  }

  $effect(() => {
    // Reading $displayedMonth here makes Svelte re-run the effect on month changes
    $displayedMonth;
    return fileCache.store.subscribe(() => refresh());
  });

  function handleHover(event: PointerEvent) {
    if (!appHasMonthlyNotesPluginLoaded()) {
      return;
    }

    const date = $displayedMonth;
    if (event.target) {
      onHover?.("month", date, file, event.target, isMetaPressed(event));
    }
  }

  function handleClick(event: MouseEvent) {
    if (appHasMonthlyNotesPluginLoaded()) {
      onClick?.("month", $displayedMonth, file, isMetaPressed(event));
    } else {
      resetDisplayedMonth();
    }
  }
</script>

<MetadataResolver {metadata}>
  {#snippet children(metadata)}
    <div
      role="button"
      tabindex="0"
      draggable={!!file}
      onclick={handleClick}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (appHasMonthlyNotesPluginLoaded()) {
            onClick?.('month', $displayedMonth, file, false);
          } else {
            resetDisplayedMonth();
          }
        }
      }}
      oncontextmenu={metadata &&
        onContextMenu &&
        ((e) => onContextMenu('month', $displayedMonth, file, e))}
      ondragstart={(event) => { if (file) fileCache.onDragStart(event, file); }}
      onpointerenter={handleHover}
    >
      <span class="title">
        <span class="month">
          {$displayedMonth.format("MMM")}
        </span>
        <span class="year">
          {$displayedMonth.format("YYYY")}
        </span>
      </span>
      {#if metadata}
        <Dots {metadata} centered={false} />
      {/if}
    </div>
  {/snippet}
</MetadataResolver>

<style>
  .title {
    color: var(--color-text-title);
    cursor: pointer;
    display: flex;
    font-size: 1.4em;
    gap: 0.3em;
    margin: 0;
  }

  .month {
    font-weight: 500;
  }

  .year {
    color: var(--interactive-accent);
  }
</style>

=== Dots.svelte ===
<script lang="ts">
  import { MAX_DOTS } from "src/constants";
  import type { IDayMetadata } from "./types";

  import Dot from "./Dot.svelte";

  let {
    centered = true,
    metadata,
  }: { centered?: boolean; metadata: IDayMetadata[] } = $props();

  let sortedMeta = $derived(
    metadata && [...metadata].sort((a, b) => a.order - b.order),
  );
</script>

<div class="dot-container" class:centered>
  {#if metadata}
    {#each sortedMeta as { color, display, dots = [] }}
      {#if display === "calendar-and-menu"}
        {#each dots.slice(0, MAX_DOTS) as dot}
          <Dot {...dot} color={color} />
        {/each}
      {/if}
    {/each}
  {/if}
</div>

<style>
  .dot-container {
    display: flex;
    flex-wrap: wrap;
    line-height: 6px;
    min-height: 6px;
  }

  .centered {
    justify-content: center;
  }
</style>

=== Dot.svelte ===
<script lang="ts">
  let { color = undefined, isFilled }: { color?: string; isFilled: boolean } =
    $props();
</script>

<svg
  class="dot"
  style={color ? `color:${color}` : undefined}
  viewBox="0 0 6 6"
  xmlns="http://www.w3.org/2000/svg"
>
  <circle
    stroke="{!isFilled ? 'currentColor' : 'none'}"
    fill="{isFilled ? 'currentColor' : 'none'}"
    cx="3"
    cy="3"
    r="2"></circle>
</svg>

<style>
  .dot {
    display: inline-block;
    height: 6px;
    width: 6px;
    margin: 0 1px;
  }
</style>

=== Arrow.svelte ===
<script lang="ts">
  let {
    onClick,
    tooltip,
    direction,
  }: {
    onClick: () => void;
    tooltip: string;
    direction: "left" | "right";
  } = $props();

  let isMobile = (window.app as any).isMobile;
</script>

<button
  type="button"
  class="arrow"
  class:is-mobile="{isMobile}"
  class:right="{direction === 'right'}"
  onclick="{onClick}"
  aria-label="{tooltip}"
>
  <svg
    focusable="false"
    role="img"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 320 512"
    ><path
      fill="currentColor"
      d="M34.52 239.03L228.87 44.69c9.37-9.37 24.57-9.37 33.94 0l22.67 22.67c9.36 9.36 9.37 24.52.04 33.9L131.49 256l154.02 154.75c9.34 9.38 9.32 24.54-.04 33.9l-22.67 22.67c-9.37 9.37-24.57 9.37-33.94 0L34.52 272.97c-9.37-9.37-9.37-24.57 0-33.94z"
    ></path></svg
  >
</button>

<style>
  .arrow {
    align-items: center;
    appearance: none;
    background: none;
    border: none;
    cursor: pointer;
    display: flex;
    justify-content: center;
    padding: 0;
    width: 24px;
  }

  .arrow.is-mobile {
    width: 32px;
  }

  .right {
    transform: rotate(180deg);
  }

  .arrow svg {
    color: var(--color-arrow);
    height: 16px;
    width: 16px;
  }
</style>

=== MetadataResolver.svelte ===
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { IDayMetadata } from "./types";

  let {
    metadata,
    children,
  }: {
    metadata: Promise<IDayMetadata[]> | null;
    children: Snippet<[IDayMetadata[] | null]>;
  } = $props();
</script>

{#if metadata}
  {#await metadata}
    {@render children(null)}
  {:then resolvedMeta}
    {@render children(resolvedMeta)}
  {:catch}
    {@render children(null)}
  {/await}
{:else}
  {@render children(null)}
{/if}
```

**Month.svelte** — Displays "Mar 2026" title with optional dots for monthly notes. If the Periodic Notes monthly plugin is loaded, clicking opens/creates a monthly note; otherwise it resets to current month. Has the same double subscription pattern as Day (context store + fileCache store).

**Dots.svelte** — Sorts metadata by `order`, filters to `"calendar-and-menu"` display mode, and renders up to `MAX_DOTS` (5) per source.

**Dot.svelte** — A 6×6px SVG circle. `isFilled` controls solid vs. outline. Clean, minimal component.

**Arrow.svelte** — Navigation arrow with mobile size detection. Reuses a single left-pointing SVG; `rotate(180deg)` flips it for the right arrow.

**MetadataResolver.svelte** — Svelte `{#await}` wrapper that renders `children(null)` while loading or on error, `children(resolvedMeta)` on success. Uses Svelte 5's snippet API.

---

## 16. Utility Functions — `src/components/utils.ts`

```bash
cat src/components/utils.ts
```

```output
import type { Moment } from "moment";

import type { IMonth, IWeek } from "./types";

function isMacOS() {
  return navigator.userAgent.includes("Mac");
}

export function isMetaPressed(e: MouseEvent): boolean {
  return isMacOS() ? e.metaKey : e.ctrlKey;
}

export function getDaysOfWeek(_today?: Moment): string[] {
  return window.moment.weekdaysShort(true);
}

export function isWeekend(date: Moment): boolean {
  return date.isoWeekday() === 6 || date.isoWeekday() === 7;
}

export function getStartOfWeek(days: Moment[]): Moment {
  return days[0].clone().weekday(0);
}

/**
 * Generate a 2D array of daily information to power
 * the calendar view.
 */
export function getMonth(displayedMonth: Moment, _today?: Moment): IMonth {
  const locale = window.moment().locale();
  const month = [];
  let week!: IWeek;

  const startOfMonth = displayedMonth.clone().locale(locale).date(1);
  const startOffset = startOfMonth.weekday();
  let date: Moment = startOfMonth.clone().subtract(startOffset, "days");

  for (let _day = 0; _day < 42; _day++) {
    if (_day % 7 === 0) {
      week = {
        days: [],
        weekNum: date.week(),
      };
      month.push(week);
    }

    week.days.push(date);
    date = date.clone().add(1, "days");
  }

  return month;
}
```

**Key utilities:**

- **`isMetaPressed()`** — platform-aware: `Cmd` on macOS, `Ctrl` elsewhere. Used for "open in new split" and "show link preview" behaviors.
- **`getDaysOfWeek()`** — uses `moment.weekdaysShort(true)` for locale-aware abbreviated day names. The `_today` parameter exists so Calendar.svelte can pass `today` as a reactive dependency, forcing re-derivation when locale changes.
- **`getMonth()`** — generates the 6×7 grid (42 days). Starts from the first day of the month, backs up by `weekday()` offset to fill the first row, then fills forward. Each week carries its `weekNum`. Uses `clone()` throughout to avoid Moment mutation.

---

## 17. Build Configuration

```bash
cat vite.config.ts
```

```output
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [svelte({ emitCss: false, compilerOptions: { runes: true } })],
  resolve: {
    alias: {
      src: path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: ".",
    emptyOutDir: false,
    lib: {
      entry: "src/main.ts",
      formats: ["cjs"],
      fileName: () => "main.js",
    },
    sourcemap: mode === "development" ? "inline" : false,
    rollupOptions: {
      external: ["obsidian", "fs", "os", "path"],
      output: {
        exports: "default",
      },
    },
  },
}));
```

**Build configuration:**

- **Svelte compiler**: runes mode enabled, CSS not emitted (Obsidian loads `styles.css` separately).
- **Library mode**: entry `src/main.ts`, output `main.js` as CommonJS (Obsidian's plugin format requires `module.exports = default`).
- **Externals**: `obsidian`, `fs`, `os`, `path` — provided by the host environment.
- **Output to root**: `outDir: "."` places `main.js` alongside `manifest.json` and `styles.css` for easy packaging. `emptyOutDir: false` prevents wiping the project root.
- **Source maps**: inline in development for debugging, disabled in production.

---

## 18. CI/CD Workflows

```bash
echo "=== CI ===" && cat .github/workflows/main.yml && echo "" && echo "=== Release ===" && cat .github/workflows/release.yml
```

```output
=== CI ===
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Check
        run: bun run check

=== Release ===
name: Release

on:
  push:
    tags:
      - "*"

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - run: |
          bun install
          bun run build

      - name: Create release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            main.js
            manifest.json
          fail_on_unmatched_files: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**CI** runs on push to main and PRs: installs deps, runs `bun run check` (typecheck + biome + svelte-check).

**Release** triggers on any tag push: builds and creates a GitHub release with `main.js` and `manifest.json` attached.

**Concern:** CI does not run `bun test` (issue #22). Release does not run `bun run check` before building (issue #23). These are the highest-priority gaps — broken code can pass CI and be released.

---

## 19. Tests

```bash
echo "=== utils.test.ts ===" && cat src/components/utils.test.ts && echo "" && echo "=== parse.test.ts ===" && cat src/periodic-notes/parse.test.ts
```

```output
=== utils.test.ts ===
import { beforeAll, describe, expect, it } from "bun:test";
import moment from "moment";
import { getDaysOfWeek, getMonth, getStartOfWeek, isWeekend } from "./utils";

beforeAll(() => {
  (globalThis as any).window = { moment };
  moment.locale("en");
  moment.updateLocale("en", { week: { dow: 0, doy: 6 } });
});

describe("getMonth", () => {
  it("always returns exactly 6 weeks (42 days)", () => {
    const months = [
      moment("2024-01-01"),
      moment("2024-02-01"),
      moment("2024-03-01"),
      moment("2024-12-01"),
    ];
    for (const m of months) {
      const grid = getMonth(m);
      expect(grid).toHaveLength(6);
      let total = 0;
      for (const week of grid) {
        total += week.days.length;
      }
      expect(total).toBe(42);
    }
  });

  it("first day of first week is on or before the 1st of the month", () => {
    const displayed = moment("2024-03-01");
    const grid = getMonth(displayed);
    const firstDay = grid[0].days[0];
    expect(firstDay.isSameOrBefore(displayed.clone().startOf("month"))).toBe(
      true,
    );
  });

  it("days within grid are in chronological order", () => {
    const grid = getMonth(moment("2024-06-01"));
    const days = grid.flatMap((w) => w.days);
    for (let i = 1; i < days.length; i++) {
      expect(days[i].valueOf()).toBeGreaterThan(days[i - 1].valueOf());
    }
  });

  it("each week has exactly 7 days", () => {
    const grid = getMonth(moment("2024-02-01"));
    for (const week of grid) {
      expect(week.days).toHaveLength(7);
    }
  });

  it("weekNum matches moment week number for each row", () => {
    const grid = getMonth(moment("2024-01-01"));
    for (const week of grid) {
      expect(week.weekNum).toBe(week.days[0].week());
    }
  });
});

describe("isWeekend", () => {
  it("returns true for Saturday (isoWeekday 6)", () => {
    expect(isWeekend(moment("2024-02-24"))).toBe(true);
  });

  it("returns true for Sunday (isoWeekday 7)", () => {
    expect(isWeekend(moment("2024-02-25"))).toBe(true);
  });

  it("returns false for a weekday", () => {
    expect(isWeekend(moment("2024-02-26"))).toBe(false);
    expect(isWeekend(moment("2024-02-22"))).toBe(false);
  });
});

describe("getStartOfWeek", () => {
  it("returns weekday(0) of the week containing the provided days", () => {
    const days = [moment("2024-02-28"), moment("2024-02-29")];
    const start = getStartOfWeek(days);
    expect(start.weekday()).toBe(0);
  });
});

describe("getDaysOfWeek", () => {
  it("returns 7 abbreviated day names", () => {
    const names = getDaysOfWeek();
    expect(names).toHaveLength(7);
    for (const name of names) {
      expect(typeof name).toBe("string");
      expect(name.length).toBeGreaterThan(0);
    }
  });
});

=== parse.test.ts ===
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
```

**Test coverage summary:**

| Module | Tests | What's Covered |
|--------|-------|----------------|
| `utils.ts` | 10 tests | `getMonth()` grid generation, `isWeekend()`, `getStartOfWeek()`, `getDaysOfWeek()` |
| `parse.ts` | 9 tests | `getDateUID()` determinism/uniqueness, `getDateFromPath()` extraction |

**What's NOT tested:**
- `fileStore.ts` — event handlers, cache ops, race conditions
- `sources.ts` — word counting, dot mapping
- `vault.ts` — note creation, template expansion
- `settings.ts` — load/save round-trip
- All Svelte components
- `io/notes.ts` — creation flow with modal

The tests use `mock.module()` to stub `settings.ts` (avoiding Obsidian API dependencies) and `globalThis.window` to provide `moment`. This is a clean pattern for testing Obsidian plugins.

---

## 20. Global Type Declarations — `src/global.d.ts`

```bash
cat src/global.d.ts
```

```output
import type { App, EventRef, Plugin, TFile } from "obsidian";

declare global {
  interface Window {
    app: App;
  }
}

declare module "obsidian" {
  interface App {
    plugins: {
      getPlugin(id: string): Plugin | null;
    };
  }
  interface Workspace {
    on(name: "file-open", callback: (file: TFile | null) => void): EventRef;
    on(name: "layout-ready", callback: () => void): EventRef;
  }
}
```

Augments Obsidian's types with `window.app`, `app.plugins.getPlugin()`, and workspace events that aren't in the official type definitions. This reduces some `as any` casts but doesn't cover `internalPlugins`, `dragManager`, or `foldManager` — hence the remaining casts throughout the codebase (issue #30).

---

## Summary of Concerns

### Issues Filed

| Issue | Severity | Summary |
|-------|----------|---------|
| [#22](../../issues/22) | HIGH | CI doesn't run tests |
| [#23](../../issues/23) | HIGH | Release builds without checks |
| [#24](../../issues/24) | HIGH | ~7% test coverage |
| [#25](../../issues/25) | MEDIUM | Unhandled promises in settings callbacks |
| [#26](../../issues/26) | MEDIUM | Race condition in `onFileRenamed` |
| [#27](../../issues/27) | MEDIUM | Check-then-act race in `ensureFolderExists` |
| [#28](../../issues/28) | MEDIUM | Settings not validated on load |
| [#29](../../issues/29) | MEDIUM | Broad error suppression in cache init |
| [#30](../../issues/30) | MEDIUM | Heavy `as any` for Obsidian private APIs |
| [#31](../../issues/31) | LOW | No error boundary in heartbeat interval |
| [#32](../../issues/32) | LOW | Moment.js is legacy (platform constraint) |
| [#33](../../issues/33) | LOW | Missing catch block in confirmation modal |

### Community Standards Adherence

**Follows well:**
- Obsidian plugin manifest structure (`manifest.json`, `versions.json`)
- Single-file CJS output with correct externals
- Uses Obsidian's CSS variables for theme compatibility
- Proper `registerEvent()` for lifecycle-aware event listeners
- `vault.trash()` instead of permanent delete
- Triggers `file-menu` event for plugin interop
- Uses `normalizePath()` for cross-platform paths

**Could improve:**
- No `FUNDING.md` or sponsor links (optional)
- No CHANGELOG (release notes only via GitHub)
- Plugin description in `manifest.json` is minimal
- No contribution guide
- `styles.css` not included in release workflow assets (only `main.js` + `manifest.json`)

### Architecture Strengths

- Clean Svelte 5 runes usage with proper reactivity patterns
- Extensible source system via `ICalendarSource` interface
- Good separation: view (controller) / components (UI) / periodic-notes (data) / io (side effects)
- Workspace event integration for cross-plugin communication
- Template variable expansion is thorough and well-structured

