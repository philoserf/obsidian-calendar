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
