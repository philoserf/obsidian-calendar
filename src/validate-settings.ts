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
