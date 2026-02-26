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
    return get(this.store)[uid];
  }

  public getFileForPeriodicNote(id: PeriodicNoteID): TFile | null {
    return get(this.store)[id];
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
