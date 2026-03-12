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

  .week-num-td {
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

  .week-num.active {
    color: var(--text-on-accent);
    background-color: var(--interactive-accent);
  }
</style>
