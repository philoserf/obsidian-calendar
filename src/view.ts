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
