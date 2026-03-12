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
