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
