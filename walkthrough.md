# Calendar Plugin Walkthrough

*2026-03-12T06:32:26Z by Showboat 0.6.1*
<!-- showboat-id: 31c189e8-d0cb-49bf-8494-6c8b189b77e7 -->

## Overview

This is an Obsidian plugin that renders a calendar sidebar. Users click dates to open or create daily/weekly/monthly notes. Dots beneath each date indicate word count. The UI is built with Svelte 5 (runes mode) and bundled with Vite into a single CommonJS file that Obsidian loads at runtime.

The walkthrough follows the code from plugin entry point through to pixel output, covering:

1. **Build system** — how source becomes `main.js`
2. **Plugin lifecycle** — registration, commands, settings
3. **View layer** — mounting Svelte, handling user interaction
4. **Periodic notes abstraction** — settings resolution, file parsing, note creation
5. **Component tree** — Calendar → Nav → Month, PeriodicNoteCell → Dots → Dot
6. **Reactive data flow** — stores, caches, metadata sources
7. **Concerns** — known issues and community-standard adherence

## 1. Build System

Vite bundles the plugin. The entry point is `src/main.ts`, output is `./main.js` (CommonJS, default export). Obsidian, fs, os, and path are externalized — Obsidian provides them at runtime.

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

Key decisions: `emitCss: false` because Obsidian handles CSS via `styles.css` and Svelte's scoped styles are inlined. `runes: true` enables Svelte 5 reactivity (`$state`, `$derived`, `$effect`, `$props`). The `src` path alias lets imports use `src/settings` instead of relative `../settings`.

The build gate (`bun run check`) runs TypeScript, Biome, and svelte-check before every production build:

```bash
sed -n '8,22p' package.json
```

```output
  "scripts": {
    "audit": "bun audit --audit-level=critical",
    "dev": "vite build --watch --mode development",
    "build": "bun run check && vite build",
    "check": "bun run typecheck && biome check . && svelte-check",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "format:check": "biome format .",
    "validate": "bun run scripts/validate-plugin.ts",
    "version": "bun run version-bump.ts",
    "test": "bun test",
    "deploy": "cp main.js manifest.json styles.css ~/source/philoserf/notes/.obsidian/plugins/calendar/"
  },
```

## 2. Plugin Lifecycle — `src/main.ts`

`CalendarPlugin` extends Obsidian's `Plugin` class. This is the entry point Obsidian calls when enabling the plugin.

```bash
cat src/main.ts
```

```output
import { Plugin, type WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_CALENDAR } from "./constants";
import { tryToCreateWeeklyNote } from "./notes";
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
```

**Startup sequence (`onload`):**

1. Subscribe to the Svelte `settings` store so `this.options` always reflects current settings
2. Register the `"calendar"` view type — Obsidian calls the factory to create `CalendarView` when needed
3. Register three commands: open view, open weekly note, reveal active note
4. Load persisted settings from disk, validate them (strip unknown keys), merge into store
5. Add the settings tab UI
6. Create the sidebar leaf (immediately if layout is ready, or on `layout-ready` event)

**Shutdown (`onunload`):** detaches all calendar leaves.

**Settings flow:** `loadOptions` → `validateSettings` → merge into Svelte store → re-save if validation stripped keys. `writeOptions` merges changes into the store and persists. The validation is defensive — if a user manually edits `data.json`, invalid keys are silently dropped.

### Constants and Stores

Small supporting files that the plugin depends on:

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

```bash
cat src/stores.ts
```

```output
import type { TFile } from "obsidian";
import { defaultSettings, type ISettings } from "src/settings";
import { writable } from "svelte/store";
import { getDateUIDFromFile } from "./components/periodic-notes-cache";

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

Two global Svelte stores:

- **`settings`** — writable store of `ISettings`, initialized with defaults, updated when the plugin loads or when the user changes settings
- **`activeFile`** — custom store wrapping a `string | null` (a date UID). The `setFile` method converts a `TFile` to its date UID by trying each granularity (day, week, month). This powers the "active" highlight on the calendar.

## 3. View Layer — `src/view.ts`

`CalendarView` extends Obsidian's `ItemView`. It bridges between Obsidian's workspace API and the Svelte component tree.

```bash
cat src/view.ts
```

```output
import type { Moment } from "moment";
import { ItemView, type TFile, type WorkspaceLeaf } from "obsidian";
import { TRIGGER_ON_OPEN, VIEW_TYPE_CALENDAR } from "src/constants";
import { tryToCreateDailyNote, tryToCreateWeeklyNote } from "src/notes";
import type { ISettings } from "src/settings";
import { mount, unmount } from "svelte";
import Calendar from "./components/Calendar.svelte";
import PeriodicNotesCache from "./components/periodic-notes-cache";
import { showFileMenu } from "./fileMenu";
import {
  getDateFromFile,
  getWeeklyNoteSettings,
  type IGranularity,
} from "./periodic-notes";
import { activeFile, settings } from "./stores";
import { wordCountSource } from "./word-count-source";

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

**`onOpen` — mounting the Svelte app:**

1. Creates a `sources` array containing `wordCountSource` and fires `calendar:open` so other plugins can inject additional sources
2. Creates `PeriodicNotesCache` which loads all daily/weekly/monthly notes from the vault into a reactive store
3. Calls `svelte.mount(Calendar, ...)` targeting the view's content element, passing the cache and event handler callbacks
4. Captures the component's exported `tick()` and `setDisplayedMonth()` functions for imperative control

**Event handlers** live in the view, not in Svelte components — this keeps Obsidian API calls (workspace triggers, file opening, context menus) out of the UI layer:

- **`onHover`** — triggers Obsidian's link-hover preview (only when meta key is held)
- **`onClick`** — opens existing file or creates a new daily/weekly note
- **`onContextMenu`** — shows Obsidian's file context menu at click position
- **`revealActiveNote`** — scrolls calendar to show the currently open file's date

## 4. Note Creation — `src/notes.ts`

When clicking a date that has no note, the view delegates to `tryToCreateDailyNote` or `tryToCreateWeeklyNote`:

```bash
cat src/notes.ts
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
} from "./periodic-notes";

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

The shared `tryToCreateNote` function handles:

1. Format the date to get the expected filename
2. If `shouldConfirmBeforeCreate` is enabled, show a confirmation modal first
3. Create the note file (via `periodic-notes/vault.ts`), open it in a leaf, and call the callback

The actual file creation — template variable replacement, folder creation, fold state preservation — happens in `periodic-notes/vault.ts` (covered in section 5).

## 5. Periodic Notes Abstraction — `src/periodic-notes/`

This module abstracts daily, weekly, and monthly note management. It detects whether the user has the Periodic Notes community plugin or falls back to Obsidian's built-in Daily Notes plugin or Calendar's own settings.

### Types

```bash
cat src/periodic-notes/types.ts
```

```output
export type IGranularity = "day" | "week" | "month" | "quarter" | "year";

export interface IPeriodicNoteSettings {
  folder?: string;
  format?: string;
  template?: string;
}
```

`IGranularity` is the union type threaded through the entire codebase — every function that deals with periodic notes takes a granularity parameter so the same code path handles daily, weekly, and monthly notes.

### Settings Resolution — `src/periodic-notes/settings.ts`

The settings cascade has three tiers:

1. **Periodic Notes plugin** — if installed and the specific periodicity is enabled, use its settings
2. **Built-in Daily Notes** (daily only) or **Calendar plugin** (weekly only) — fallback
3. **Hardcoded defaults** — `YYYY-MM-DD` for daily, `gggg-[W]ww` for weekly, etc.

```bash
sed -n '1,54p' src/periodic-notes/settings.ts
```

```output
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
```

`getDailyNoteSettings` demonstrates the cascade: check Periodic Notes first, fall back to Obsidian's internal `daily-notes` plugin, or return defaults. `getWeeklyNoteSettings` similarly falls back to Calendar's own weekly settings. Monthly/quarterly/yearly all use the generic `getPeriodicNoteSettings` helper since they only exist in Periodic Notes.

The `appHas*Loaded()` functions determine which granularities are available to the UI — they're used to show/hide the week number column and enable monthly note clicking.

### File Parsing — `src/periodic-notes/parse.ts`

Matches vault filenames against date formats to determine which files are periodic notes:

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

Key functions:

- **`getDateUID`** — creates a unique identifier like `day-2024-03-15T00:00:00-04:00` by normalizing to the start of the granularity period. This is the key used in the cache store.
- **`getDateFromFile`** — parses a file's basename against the configured format. Uses Moment's strict parsing (`true` third arg) so `2024-03` doesn't accidentally match `YYYY-MM-DD`.
- **`isFormatAmbiguous`** — handles the edge case where a weekly format contains both week tokens (`w`/`W`) and month/day tokens (`M`/`D`). In that case, month/day tokens are stripped before re-parsing.

### Note Creation — `src/periodic-notes/vault.ts`

The vault module handles actual file creation with template variable replacement:

```bash
sed -n '70,121p' src/periodic-notes/vault.ts
```

```output
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
      getFoldManager(window.app).save(createdFile, foldInfo);
    }
    return createdFile;
  } catch (err) {
    console.error(`Failed to create file: '${normalizedPath}'`, err);
    new Notice("Unable to create new file.");
    throw err;
  }
}
```

Template variables supported:

| Variable | Replacement |
|---|---|
| `{{date}}` | Formatted date |
| `{{time}}` | Current time (HH:mm) |
| `{{title}}` | Filename (same as date) |
| `{{date+2d}}` | Date with arithmetic (+/- years, quarters, months, weeks, days, hours, seconds) |
| `{{date:YYYY}}` | Date with custom format |
| `{{yesterday}}` / `{{tomorrow}}` | Adjacent dates |
| `{{monday}}` through `{{saturday}}` | Day-of-week dates (weekly notes only) |

The `createWeeklyNote` function adds day-of-week template variables (`{{monday:YYYY-MM-DD}}`, etc.) which resolve relative to the week start. Fold state from the template is preserved onto the new file.

### Collecting Existing Notes

```bash
sed -n '179,222p' src/periodic-notes/vault.ts
```

```output
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

`collectNotes` recursively walks a folder, parses each `.md` file against the configured format, and builds a `dateUID → TFile` map. This is called once during initialization and re-called when periodic-notes settings change.

### Obsidian Internals — `src/obsidian-internals.ts`

All access to Obsidian's private/undocumented APIs is centralized in one file. This means when Obsidian updates break internal APIs, the damage is contained:

```bash
cat src/obsidian-internals.ts
```

```output
/**
 * Typed accessors for Obsidian private/internal APIs.
 *
 * Centralizes all `as any` casts so that breakage from Obsidian updates
 * surfaces in one place instead of scattered across the codebase.
 */

import type { App, Plugin, TFile, Workspace } from "obsidian";

// -- Internal plugin manager --

interface InternalPluginEntry {
  enabled: boolean;
  instance?: { options?: Record<string, unknown> };
}

interface InternalPlugins {
  plugins: Record<string, InternalPluginEntry | undefined>;
  getPluginById(id: string): InternalPluginEntry | undefined;
}

export function getInternalPlugins(app: App): InternalPlugins {
  // biome-ignore lint/suspicious/noExplicitAny: Obsidian private API
  return (app as any).internalPlugins;
}

// -- Plugin settings / options --

export function getPluginSettings(
  plugin: Plugin | null,
): Record<string, unknown> | undefined {
  if (!plugin) return undefined;
  // biome-ignore lint/suspicious/noExplicitAny: Obsidian private API
  return (plugin as any).settings;
}

export function getPluginOptions(
  plugin: Plugin | null,
): Record<string, unknown> | undefined {
  if (!plugin) return undefined;
  // biome-ignore lint/suspicious/noExplicitAny: Obsidian private API
  return (plugin as any).options;
}

// -- Fold manager --

interface FoldManager {
  load(file: TFile): Record<string, unknown> | null;
  save(file: TFile, foldInfo: Record<string, unknown>): void;
}

export function getFoldManager(app: App): FoldManager {
  // biome-ignore lint/suspicious/noExplicitAny: Obsidian private API
  return (app as any).foldManager;
}

// -- Drag manager --

interface DragManager {
  dragFile(event: DragEvent, file: TFile): unknown;
  onDragStart(event: DragEvent, dragData: unknown): void;
}

export function getDragManager(app: App): DragManager {
  // biome-ignore lint/suspicious/noExplicitAny: Obsidian private API
  return (app as any).dragManager;
}

// -- Workspace with custom events --

interface CustomWorkspaceEvents {
  on(
    name: "periodic-notes:settings-updated",
    callback: () => void,
    ctx?: unknown,
  ): ReturnType<Workspace["on"]>;
  on(
    name: "calendar:metadata-updated",
    callback: () => void,
    ctx?: unknown,
  ): ReturnType<Workspace["on"]>;
}

export type CalendarWorkspace = Workspace & CustomWorkspaceEvents;

export function asEventWorkspace(workspace: Workspace): CalendarWorkspace {
  // biome-ignore lint/suspicious/noExplicitAny: Obsidian private API
  return workspace as any as CalendarWorkspace;
}

// -- App properties --

export function isMobile(app: App): boolean {
  // biome-ignore lint/suspicious/noExplicitAny: Obsidian private API
  return !!(app as any).isMobile;
}

// -- Moment locale internals --

export function getWeekStartDay(): number {
  const { moment } = window;
  // biome-ignore lint/suspicious/noExplicitAny: Moment private API
  return (moment.localeData() as any)._week.dow;
}
```

Each private API access is wrapped in a typed function with a `biome-ignore` comment. The typed interfaces (`InternalPlugins`, `FoldManager`, `DragManager`) document the expected shape. If Obsidian changes the internal structure, TypeScript won't catch it (the casts bypass that), but at least the breakage is localized.

## 6. Reactive Cache — `src/components/periodic-notes-cache.ts`

The `PeriodicNotesCache` class maintains a reactive `uid → TFile` map. It's the bridge between the vault's file system and the Svelte component tree.

```bash
cat src/components/periodic-notes-cache.ts
```

```output
import type { Moment } from "moment";
import {
  type App,
  type Component,
  Notice,
  type TAbstractFile,
  TFile,
} from "obsidian";
import type { Writable } from "svelte/store";
import { get, writable } from "svelte/store";
import { asEventWorkspace, getDragManager } from "../obsidian-internals";
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

    const workspace = asEventWorkspace(this.app.workspace);
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
    const notes: Record<string, TFile> = {};
    const failures: string[] = [];

    for (const [label, loader] of [
      ["daily", getAllDailyNotes],
      ["weekly", getAllWeeklyNotes],
      ["monthly", getAllMonthlyNotes],
    ] as const) {
      try {
        Object.assign(notes, loader());
      } catch (err) {
        failures.push(label);
        console.error(`[Calendar] Failed to load ${label} notes`, err);
      }
    }

    this.store.set(notes);

    if (failures.length > 0) {
      new Notice(
        `Calendar: failed to load ${failures.join(", ")} notes. Check the console for details.`,
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
    const dragManager = getDragManager(this.app);
    const dragData = dragManager.dragFile(event, file);
    dragManager.onDragStart(event, dragData);
  }
}
```

**Initialization:** On layout ready, registers vault event listeners and calls `initialize()` which bulk-loads all daily, weekly, and monthly notes into the store. It also listens for `periodic-notes:settings-updated` and `calendar:metadata-updated` to re-initialize when external settings change.

**Incremental updates:** Each vault event (`create`, `delete`, `rename`, `modify`) does a targeted store update rather than re-scanning everything. The rename handler is careful to remove the old path's UID and re-add under the new path.

**Metadata evaluation:** `getEvaluatedMetadata` runs each source's `getMetadata` function (e.g., word count) for a given date and merges it with source settings. This produces the `IDayMetadata[]` array that components use to render dots.

**Drag support:** `onDragStart` uses Obsidian's private drag manager to enable dragging calendar cells into the editor (creates a link to the note).

## 7. Word Count Source — `src/word-count-source.ts`

The plugin's built-in metadata source. Other plugins can add sources via the `calendar:open` event.

```bash
cat src/word-count-source.ts
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
import { clamp, getWordCount } from "./word-count";

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

The pipeline: read file via `cachedRead` → count words → divide by `wordsPerDot` setting → clamp to 1–5 → produce that many filled dots. The minimum of 1 is intentional: if a note exists, it always gets at least one dot, signaling its presence regardless of content.

The word counter itself handles both space-delimited languages and CJK characters:

```bash
sed -n '1,7p' src/word-count.ts && echo '// ... (large Unicode character class regex) ...' && sed -n '15,25p' src/word-count.ts
```

```output
export function clamp(
  num: number,
  lowerBound: number,
  upperBound: number,
): number {
  return Math.min(Math.max(lowerBound, num), upperBound);
}
// ... (large Unicode character class regex) ...
const WORD_PATTERN = new RegExp(
  [
    `(?:[0-9]+(?:(?:,|\\.)[0-9]+)*|[\\-${spaceDelimitedChars}])+`,
    nonSpaceDelimitedWords,
  ].join("|"),
  "g",
);

export function getWordCount(text: string): number {
  return (text.match(WORD_PATTERN) || []).length;
}
```

The `WORD_PATTERN` regex is compiled once at module level. It matches runs of space-delimited characters (Latin, Arabic, Hebrew, Devanagari, etc.) and individual CJK characters. The CJK pattern has a known bug: it uses a bare character sequence instead of a character class (`[...]`), so it matches the sequence as a literal string rather than individual characters.

## 8. Component Tree

The Svelte component hierarchy:

```bash
cat <<'TREE'
Calendar.svelte                     ← root, mounted by CalendarView
├── Nav.svelte                      ← navigation bar
│   ├── Month.svelte                ← "Mar 2026" header, monthly note support
│   │   └── MetadataResolver
│   │       └── Dots → Dot          ← monthly note dots
│   ├── Arrow (left)                ← previous month
│   ├── reset-button → Dot          ← return to today
│   └── Arrow (right)               ← next month
└── <table>                         ← calendar grid
    ├── <thead> day-of-week labels
    └── <tbody>
        └── <tr> × 6 weeks
            ├── PeriodicNoteCell (week)   ← optional week number column
            └── PeriodicNoteCell (day) × 7
                └── MetadataResolver
                    └── Dots → Dot   ← word count dots
TREE
```

```output
Calendar.svelte                     ← root, mounted by CalendarView
├── Nav.svelte                      ← navigation bar
│   ├── Month.svelte                ← "Mar 2026" header, monthly note support
│   │   └── MetadataResolver
│   │       └── Dots → Dot          ← monthly note dots
│   ├── Arrow (left)                ← previous month
│   ├── reset-button → Dot          ← return to today
│   └── Arrow (right)               ← next month
└── <table>                         ← calendar grid
    ├── <thead> day-of-week labels
    └── <tbody>
        └── <tr> × 6 weeks
            ├── PeriodicNoteCell (week)   ← optional week number column
            └── PeriodicNoteCell (day) × 7
                └── MetadataResolver
                    └── Dots → Dot   ← word count dots
```

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
  import { appHasMonthlyNotesPluginLoaded } from "../periodic-notes";
  import { activeFile, settings } from "../stores";
  import { DISPLAYED_MONTH } from "./context";
  import type PeriodicNotesCache from "./periodic-notes-cache";
  import Nav from "./Nav.svelte";
  import PeriodicNoteCell from "./PeriodicNoteCell.svelte";
  import type { ICalendarSource, IEventHandlers, IMonth, ISourceSettings } from "./types";
  import { getDaysOfWeek, getMonth, getStartOfWeek, isWeekend } from "./utils";

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
  let monthlyNotesEnabled = $derived(appHasMonthlyNotesPluginLoaded());
  let selectedId = $derived($activeFile);
  let eventHandlers: IEventHandlers = $derived({ onHover, onClick, onContextMenu });

  // Pass `today` explicitly so the derived blocks re-evaluate when locale changes
  let month: IMonth = $derived.by(() => getMonth($displayedMonthStore));
  let daysOfWeek: string[] = $derived.by(() => getDaysOfWeek());

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
    try {
      const prevToday = today;
      tick();
      if (!prevToday.isSame(today, "month")) {
        if (get(displayedMonthStore).isSame(prevToday, "month")) {
          displayedMonthStore.set(today);
        }
      }
    } catch (err) {
      console.error("[Calendar] Heartbeat failed", err);
    }
  }, 1000 * 60);

  onDestroy(() => {
    clearInterval(heartbeat);
  });
</script>

<div id="calendar-container" class="container">
  <Nav
    {fileCache}
    {monthlyNotesEnabled}
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
            <PeriodicNoteCell
              granularity="week"
              date={getStartOfWeek(week.days)}
              label={String(week.weekNum)}
              {fileCache}
              {selectedId}
              {getSourceSettings}
              {...eventHandlers}
            />
          {/if}
          {#each week.days as day (day.format())}
            <PeriodicNoteCell
              granularity="day"
              date={day}
              label={day.format("D")}
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

Key patterns:

- **`$state.raw` for `today`** — Moment objects are mutable, so `$state` (which uses proxies) would break them. `$state.raw` stores the value without proxying.
- **`displayedMonthStore` as Svelte store + context** — shared via `setContext(DISPLAYED_MONTH, store)` so child components can read it without prop drilling. The store wraps a Moment and is updated by Nav arrows, the heartbeat, and `setDisplayedMonth()`.
- **`getToday(_s: ISettings)`** — takes the settings parameter solely to create a reactive dependency. When settings change (e.g., locale), the `$effect` re-evaluates `today`.
- **Heartbeat** — 60s interval updates `today` and auto-advances the displayed month when midnight crosses a month boundary (only if the user is currently viewing the current month).
- **CSS custom properties** — the container defines all color variables, mapping to Obsidian's theme variables (`--text-normal`, `--interactive-accent`, etc.). This makes the calendar theme-aware.

### PeriodicNoteCell.svelte — Day and Week Cells

A single component handles both day cells and week number cells, parameterized by `granularity`:

```bash
cat src/components/PeriodicNoteCell.svelte
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
  import type PeriodicNotesCache from "./periodic-notes-cache";
  import type {
    IDayMetadata,
    ISourceSettings,
  } from "./types";
  import { getAttributes, isMetaPressed } from "./utils";

  let {
    granularity,
    date,
    label,
    fileCache,
    getSourceSettings,
    onHover,
    onClick,
    onContextMenu,
    today = undefined,
    selectedId = null,
  }: {
    granularity: IGranularity;
    date: Moment;
    label: string;
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
    today?: Moment;
    selectedId: string | null;
  } = $props();

  const displayedMonth = getContext<Writable<Moment>>(DISPLAYED_MONTH);

  let file: TFile | null = $state(null);
  let metadata: Promise<IDayMetadata[]> | null = $state(null);

  $effect(() => {
    return fileCache.store.subscribe(() => {
      file = fileCache.getFile(date, granularity);
      metadata = fileCache.getEvaluatedMetadata(granularity, date, getSourceSettings);
    });
  });

  function handleClick(event: MouseEvent) {
    onClick?.(granularity, date, file, isMetaPressed(event));
  }

  function handleHover(event: PointerEvent) {
    if (event.target) {
      onHover?.(granularity, date, file, event.target, isMetaPressed(event));
    }
  }

  function handleContextmenu(event: MouseEvent) {
    onContextMenu?.(granularity, date, file, event);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      onClick?.(granularity, date, file, false);
    }
  }

  let isDay = $derived(granularity === "day");
  let cellClass = $derived(isDay ? "day" : "week-num");
</script>

<td class:week-num-td={!isDay}>
  <MetadataResolver {metadata}>
    {#snippet children(metadata)}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        role={isDay ? undefined : "button"}
        tabindex={isDay ? undefined : 0}
        class={cellClass}
        class:active={selectedId === getDateUID(date, granularity)}
        class:adjacent-month={isDay && !date.isSame($displayedMonth, 'month')}
        class:has-note={!!file}
        class:today={isDay && today != null && date.isSame(today, 'day')}
        draggable={!!file}
        {...isDay ? getAttributes(metadata ?? []) : {}}
        onclick={handleClick}
        onkeydown={isDay ? undefined : handleKeydown}
        oncontextmenu={handleContextmenu}
        onpointerenter={handleHover}
        ondragstart={(event) => { if (file) fileCache.onDragStart(event, file); }}
      >
        {label}
        <Dots metadata={metadata ?? []} />
      </div>
    {/snippet}
  </MetadataResolver>
</td>

<style>
  .day,
  .week-num {
    border-radius: 4px;
    cursor: pointer;
    height: 100%;
    padding: 4px;
    text-align: center;
    transition: background-color 0.1s ease-in, color 0.1s ease-in;
    vertical-align: baseline;
  }

  .day {
    background-color: var(--color-background-day);
    color: var(--color-text-day);
    font-size: 0.8em;
    position: relative;
  }

  .week-num {
    background-color: var(--color-background-weeknum);
    color: var(--color-text-weeknum);
    font-size: 0.65em;
  }

  .day:hover,
  .week-num:hover {
    background-color: var(--interactive-hover);
  }

  .day.active:hover,
  .week-num.active:hover {
    background-color: var(--interactive-accent-hover);
  }

  .day:active,
  .active,
  .active.today {
    color: var(--text-on-accent);
    background-color: var(--interactive-accent);
  }

  .adjacent-month {
    opacity: 0.25;
  }

  .today {
    color: var(--color-text-today);
  }

  .week-num-td {
    border-right: 1px solid var(--background-modifier-border);
  }
</style>
```

The `$effect` subscribes to the file cache store. Whenever a note is created, deleted, renamed, or modified, the subscription fires and re-evaluates `file` and `metadata` for this cell's date.

Conditional behavior based on `granularity`:

| Feature | Day cell | Week cell |
|---|---|---|
| `role` | none (implicit) | `"button"` |
| `tabindex` | none | `0` |
| `today` highlight | yes | no |
| `adjacent-month` fading | yes | no |
| `getAttributes()` spread | yes (from sources) | no |
| `onkeydown` | none | Enter/Space handler |
| Font size | 0.8em | 0.65em |

### Nav.svelte — Navigation Bar

```bash
cat src/components/Nav.svelte
```

```output
<script lang="ts">
  import { getContext } from "svelte";
  import type { Writable } from "svelte/store";
  import type { Moment } from "moment";

  import Arrow from "./Arrow.svelte";
  import type PeriodicNotesCache from "./periodic-notes-cache";
  import { DISPLAYED_MONTH } from "./context";
  import Dot from "./Dot.svelte";
  import Month from "./Month.svelte";
  import type { IEventHandlers, ISourceSettings } from "./types";

  let {
    getSourceSettings,
    fileCache,
    monthlyNotesEnabled,
    today,
    eventHandlers,
  }: {
    getSourceSettings: (sourceId: string) => ISourceSettings;
    fileCache: PeriodicNotesCache;
    monthlyNotesEnabled: boolean;
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
    {monthlyNotesEnabled}
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

Nav reads `displayedMonth` from context and provides three navigation actions: increment month, decrement month, reset to today. The reset button shows as dimmed (opacity 0.4) when already viewing the current month and brightens when navigated away.

### Month.svelte — Monthly Note Header

```bash
cat src/components/Month.svelte
```

```output
<script lang="ts">
  import type { Moment } from "moment";
  import type { TFile } from "obsidian";
  import { getContext } from "svelte";
  import type { Writable } from "svelte/store";
  import type { IGranularity } from "../periodic-notes";

  import { DISPLAYED_MONTH } from "./context";
  import Dots from "./Dots.svelte";
  import type PeriodicNotesCache from "./periodic-notes-cache";
  import MetadataResolver from "./MetadataResolver.svelte";
  import { isMetaPressed } from "./utils";
  import type { IDayMetadata, ISourceSettings } from "./types";

  let {
    fileCache,
    getSourceSettings,
    monthlyNotesEnabled,
    onHover,
    onClick,
    onContextMenu,
    resetDisplayedMonth,
  }: {
    fileCache: PeriodicNotesCache;
    getSourceSettings: (sourceId: string) => ISourceSettings;
    monthlyNotesEnabled: boolean;
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
    if (!monthlyNotesEnabled) {
      return;
    }

    const date = $displayedMonth;
    if (event.target) {
      onHover?.("month", date, file, event.target, isMetaPressed(event));
    }
  }

  function activateMonth(inNewSplit: boolean) {
    if (monthlyNotesEnabled) {
      onClick?.("month", $displayedMonth, file, inNewSplit);
    } else {
      resetDisplayedMonth();
    }
  }

  function handleClick(event: MouseEvent) {
    activateMonth(isMetaPressed(event));
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
          activateMonth(false);
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
```

Month.svelte has dual behavior:

- **If monthly notes are enabled** (Periodic Notes plugin): clicking the header opens/creates the monthly note, hover shows a preview, dots render word count
- **If monthly notes are disabled**: clicking resets the calendar to the current month (same as the reset button)

The `$effect` creates a subscription that refreshes whenever either the displayed month changes or the file cache updates.

### MetadataResolver.svelte — Async Wrapper

```bash
cat src/components/MetadataResolver.svelte
```

```output
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

MetadataResolver is a snippet-based component that handles the async metadata promise. It renders children with `null` while pending or on error, and with the resolved metadata array on success. This means the calendar grid renders immediately with empty dots, then fills in as word counts resolve.

### Dots and Dot — Visual Indicators

```bash
cat src/components/Dots.svelte && echo "---" && cat src/components/Dot.svelte
```

```output
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
---
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
```

Dots sorts metadata sources by `order`, filters to `calendar-and-menu` display mode, then renders up to `MAX_DOTS` (5) SVG circles per source. Each Dot is a 6×6 SVG — filled for content, outlined for empty. The `color` prop allows different sources to use different colors (currently all "default").

### Utility Functions — `src/components/utils.ts`

```bash
cat src/components/utils.ts
```

```output
import type { Moment } from "moment";

import type { IDayMetadata, IHTMLAttributes, IMonth, IWeek } from "./types";

function isMacOS() {
  return navigator.userAgent.includes("Mac");
}

export function isMetaPressed(e: MouseEvent): boolean {
  return isMacOS() ? e.metaKey : e.ctrlKey;
}

export function getDaysOfWeek(): string[] {
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
export function getMonth(displayedMonth: Moment): IMonth {
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

export function getAttributes(metadata: IDayMetadata[]): IHTMLAttributes {
  const result: IHTMLAttributes = {};
  for (const meta of metadata) {
    if (meta.display === "calendar-and-menu" && meta.attrs) {
      Object.assign(result, meta.attrs);
    }
  }
  return result;
}
```

`getMonth` generates the 42-cell grid (6 weeks × 7 days) that powers the calendar table. It starts from the first visible day (which may be in the previous month), respects locale-based week start, and groups days into weeks with week numbers.

`getAttributes` merges HTML attributes from all metadata sources into a single object. Sources can inject custom data attributes onto day cells.

## 9. Type System — `src/components/types.ts`

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

The type hierarchy:

- **`ICalendarSource`** — the plugin extension point. Any plugin can provide a source with `getMetadata` that returns dots and attributes for a given date.
- **`IEvaluatedMetadata`** — what a source returns: a value, dots, and optional HTML attributes.
- **`ISourceSettings`** — per-source display configuration (color, visibility, sort order).
- **`IDayMetadata`** — the merged result that reaches components: source identity + settings + evaluated metadata.
- **`IEventHandlers`** — typed callback signatures passed from the view through the component tree.

## 10. Supporting Files

### Settings UI — `src/settings.ts`

The `CalendarSettingsTab` renders Obsidian's native settings UI. It conditionally shows weekly note settings only when weekly notes are enabled and the Periodic Notes plugin isn't managing them. The `appHasPeriodicNotesWeeklyEnabled` function checks if the Periodic Notes plugin has weekly notes turned on.

### Settings Validation — `src/validate-settings.ts`

```bash
cat src/validate-settings.ts
```

```output
import type { ISettings } from "./settings";

export function validateSettings(
  raw: Record<string, unknown>,
): Partial<ISettings> {
  const validated: Partial<ISettings> = {};

  if (typeof raw.wordsPerDot === "number" && raw.wordsPerDot > 0) {
    validated.wordsPerDot = raw.wordsPerDot;
  }
  if (typeof raw.shouldConfirmBeforeCreate === "boolean") {
    validated.shouldConfirmBeforeCreate = raw.shouldConfirmBeforeCreate;
  }
  if (typeof raw.showWeeklyNote === "boolean") {
    validated.showWeeklyNote = raw.showWeeklyNote;
  }
  if (typeof raw.weeklyNoteFormat === "string") {
    validated.weeklyNoteFormat = raw.weeklyNoteFormat;
  }
  if (typeof raw.weeklyNoteTemplate === "string") {
    validated.weeklyNoteTemplate = raw.weeklyNoteTemplate;
  }
  if (typeof raw.weeklyNoteFolder === "string") {
    validated.weeklyNoteFolder = raw.weeklyNoteFolder;
  }

  return validated;
}
```

Validation is allowlist-based: only recognized keys with correct types pass through. Unknown keys (from older versions or manual edits) are silently dropped. The plugin re-saves if any keys were stripped.

### Confirmation Modal — `src/modal.ts`

```bash
cat src/modal.ts
```

```output
import { type App, Modal, Notice } from "obsidian";

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
          } catch (err) {
            console.error("[Calendar] Confirmation action failed", err);
            new Notice("Something went wrong. Check the console for details.");
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

Standard Obsidian modal with two buttons. The accept handler has try/catch/finally to ensure the modal always closes, even on error.

### Context Menu — `src/fileMenu.ts`

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

The file menu adds a Delete item and triggers `file-menu` so other plugins can add their own items to the context menu. The `"calendar-context-menu"` source string identifies where the menu was triggered.

### Global Type Declarations — `src/global.d.ts`

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

Augments the global `Window` type with `app` (Obsidian injects this at runtime) and extends Obsidian's module declarations to include event signatures that aren't in the public API types.

### Path Utilities — `src/periodic-notes/path.ts`

```bash
cat src/periodic-notes/path.ts
```

```output
export function join(...partSegments: string[]): string {
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

export function getWeekdayOrder(weekStart: number): string[] {
  let start = weekStart;
  const daysOfWeek = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  while (start) {
    // biome-ignore lint/style/noNonNullAssertion: array is guaranteed non-empty
    daysOfWeek.push(daysOfWeek.shift()!);
    start--;
  }
  return daysOfWeek;
}

export function getDayOfWeekNumericalValue(
  dayOfWeekName: string,
  weekStart: number,
): number {
  return getWeekdayOrder(weekStart).indexOf(dayOfWeekName.toLowerCase());
}
```

`join` is a simple path joiner (no Node.js `path` dependency — this runs in the browser). `getWeekdayOrder` rotates the weekday array to respect locale-based week start (Sunday=0, Monday=1, etc.), used for weekly template `{{monday:YYYY-MM-DD}}` variable resolution.

### Barrel Export — `src/periodic-notes/index.ts`

```bash
cat src/periodic-notes/index.ts
```

```output
export { getDateFromFile, getDateFromPath, getDateUID } from "./parse";
export {
  appHasDailyNotesPluginLoaded,
  appHasMonthlyNotesPluginLoaded,
  appHasWeeklyNotesPluginLoaded,
  getDailyNoteSettings,
  getWeeklyNoteSettings,
} from "./settings";
export type { IGranularity } from "./types";
export {
  createDailyNote,
  createWeeklyNote,
  getAllDailyNotes,
  getAllMonthlyNotes,
  getAllWeeklyNotes,
} from "./vault";
```

Clean barrel — re-exports only the public API. Internal helpers like `getPeriodicNoteSettings`, `isFormatAmbiguous`, and `ensureFolderExists` remain private.

## 11. File Structure Summary

```bash
find src -type f -name '*.ts' -o -name '*.svelte' | sort
```

```output
src/components/Arrow.svelte
src/components/Calendar.svelte
src/components/context.ts
src/components/Dot.svelte
src/components/Dots.svelte
src/components/MetadataResolver.svelte
src/components/Month.svelte
src/components/Nav.svelte
src/components/periodic-notes-cache.ts
src/components/PeriodicNoteCell.svelte
src/components/types.ts
src/components/utils.test.ts
src/components/utils.ts
src/constants.ts
src/fileMenu.ts
src/global.d.ts
src/main.ts
src/modal.ts
src/notes.ts
src/obsidian-internals.ts
src/periodic-notes/index.ts
src/periodic-notes/parse.test.ts
src/periodic-notes/parse.ts
src/periodic-notes/path.test.ts
src/periodic-notes/path.ts
src/periodic-notes/settings.ts
src/periodic-notes/types.ts
src/periodic-notes/vault.ts
src/settings.test.ts
src/settings.ts
src/stores.ts
src/validate-settings.ts
src/view.ts
src/word-count-source.ts
src/word-count.test.ts
src/word-count.ts
```

```bash
wc -l src/**/*.ts src/**/*.svelte src/periodic-notes/*.ts 2>/dev/null | tail -1
```

```output
    2669 total
```

36 source files, ~2,700 lines total (including tests). The codebase is organized into three layers:

| Layer | Directory | Purpose |
|---|---|---|
| Plugin shell | `src/` (root files) | Obsidian integration: plugin lifecycle, view, settings, stores, notes, modals |
| Periodic notes | `src/periodic-notes/` | Date abstraction: settings resolution, file parsing, note creation, vault operations |
| Components | `src/components/` | Svelte UI: calendar grid, navigation, cells, dots, metadata resolution |

## 12. Concerns and Community Standards

### Positive patterns

- **Private API centralization** — `obsidian-internals.ts` isolates all `as any` casts behind typed wrappers
- **Settings validation** — allowlist-based, strips unknown keys, re-saves cleaned data
- **Event cleanup** — vault listeners registered via `component.registerEvent` (auto-unregistered on component destroy), heartbeat cleared in `onDestroy`
- **Defensive metadata** — `MetadataResolver` handles null, pending, and error states without crashing the grid
- **Pure utility functions** — `utils.ts`, `word-count.ts`, `path.ts` are pure functions testable without Obsidian runtime
- **Svelte 5 runes** — uses modern `$state`, `$derived`, `$props`, `$effect` instead of legacy `$:` syntax
- **Theme integration** — all colors reference Obsidian CSS custom properties, respecting user themes

### Known issues

1. **CJK word counting bug** — The `nonSpaceDelimitedWords` regex in `word-count.ts` uses a bare character sequence instead of a character class (`[...]`), so it matches the literal string `\u3041-\u3096...` rather than any character in that range. CJK-only text returns 0 words.

2. **Template variable ordering in `createDailyNote`** — The simple `{{date}}` replacement runs before the pattern-based `{{date+2d:YYYY}}` replacement. Since both use `/gi`, the simple replacement will consume `{{date}}` inside `{{date+2d:YYYY}}`, leaving `+2d:YYYY}}` as literal text. The workaround is that the pattern-based regex also matches plain `{{date}}`, but the ordering is fragile.

3. **Store spread on every vault event** — `onFileCreated`, `onFileModified`, and `onFileDeleted` create a new object via `{ ...notes, [uid]: file }` on every file change. For vaults with thousands of notes, rapid file modifications (e.g., during sync) could cause GC pressure. A change-detection guard (skip update if the file reference hasn't changed) would reduce unnecessary store notifications.

4. **`getSourceSettings` is hardcoded** — Returns the same defaults for every source. The `ICalendarSource.defaultSettings` field and per-source persistence aren't implemented yet.

5. **No `month` granularity in `onClick`** — The view's `onClick` handler creates daily and weekly notes but silently ignores monthly note creation. Month.svelte can trigger `onClick("month", ...)` when monthly notes are enabled, but the view only handles `"day"` and `"week"`.

6. **Test coverage** — Unit tests exist for pure functions (word count, path utilities, parse, settings validation, calendar grid utils) but components, the cache, and the view layer are untested. Integration testing Svelte 5 components with Obsidian's runtime is non-trivial.

