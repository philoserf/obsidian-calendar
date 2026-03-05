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
