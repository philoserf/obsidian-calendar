import type { Moment } from "moment";
import { Notice, normalizePath, TFile, TFolder, Vault } from "obsidian";
import { getFoldManager, getWeekStartDay } from "../obsidian-internals";
import { getDateFromFile, getDateUID } from "./parse";
import { getDayOfWeekNumericalValue, join } from "./path";
import {
  appHasMonthlyNotesPluginLoaded,
  appHasWeeklyNotesPluginLoaded,
  getDailyNoteSettings,
  getMonthlyNoteSettings,
  getWeeklyNoteSettings,
} from "./settings";
import type { IGranularity } from "./types";

async function ensureFolderExists(path: string): Promise<void> {
  const dirs = path.replace(/\\/g, "/").split("/");
  dirs.pop();
  let current = "";
  for (const segment of dirs) {
    if (!segment) continue;
    current = current ? `${current}/${segment}` : segment;
    try {
      await window.app.vault.createFolder(current);
    } catch {
      // Folder already exists — expected when another process created it first
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
    const foldInfo = getFoldManager(window.app).load(templateFile);
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
      getFoldManager(window.app).save(createdFile, foldInfo);
    }
    return createdFile;
  } catch (err) {
    console.error(`Failed to create file: '${normalizedPath}'`, err);
    new Notice("Unable to create new file.");
    throw err;
  }
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
            const day = getDayOfWeekNumericalValue(
              dayOfWeek,
              getWeekStartDay(),
            );
            return date.weekday(day).format(momentFormat.trim());
          },
        ),
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
