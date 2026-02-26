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
        ondragstart={file ? (event) => fileCache.onDragStart(event, file!) : undefined}
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
