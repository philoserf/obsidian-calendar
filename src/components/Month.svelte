<script lang="ts">
  import type { Moment } from "moment";
  import type { TFile } from "obsidian";
  import { getContext } from "svelte";
  import type { Writable } from "svelte/store";
  import {
    appHasMonthlyNotesPluginLoaded,
    type IGranularity,
  } from "../periodic-notes";

  import { DISPLAYED_MONTH } from "./context";
  import Dots from "./Dots.svelte";
  import type PeriodicNotesCache from "./fileStore";
  import MetadataResolver from "./MetadataResolver.svelte";
  import { isMetaPressed } from "./utils";
  import type { IDayMetadata, ISourceSettings } from "./types";

  let {
    fileCache,
    getSourceSettings,
    onHover,
    onClick,
    onContextMenu,
    resetDisplayedMonth,
  }: {
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
    resetDisplayedMonth: () => void;
  } = $props();

  let displayedMonth = getContext<Writable<Moment>>(DISPLAYED_MONTH);
  let metadata: Promise<IDayMetadata[]> | null = $state(null);
  let file: TFile | null = $state(null);

  function refresh() {
    file = fileCache.getFile($displayedMonth, "month");
    metadata = fileCache.getEvaluatedMetadata(
      "month",
      $displayedMonth,
      getSourceSettings,
    );
  }

  $effect(() => {
    // Reading $displayedMonth here makes Svelte re-run the effect on month changes
    $displayedMonth;
    return fileCache.store.subscribe(() => refresh());
  });

  function handleHover(event: PointerEvent) {
    if (!appHasMonthlyNotesPluginLoaded()) {
      return;
    }

    const date = $displayedMonth;
    if (event.target) {
      onHover?.("month", date, file, event.target, isMetaPressed(event));
    }
  }

  function handleClick(event: MouseEvent) {
    if (appHasMonthlyNotesPluginLoaded()) {
      onClick?.("month", $displayedMonth, file, isMetaPressed(event));
    } else {
      resetDisplayedMonth();
    }
  }
</script>

<MetadataResolver {metadata}>
  {#snippet children(metadata)}
    <div
      role="button"
      tabindex="0"
      draggable={!!file}
      onclick={handleClick}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (appHasMonthlyNotesPluginLoaded()) {
            onClick?.('month', $displayedMonth, file, false);
          } else {
            resetDisplayedMonth();
          }
        }
      }}
      oncontextmenu={metadata &&
        onContextMenu &&
        ((e) => onContextMenu('month', $displayedMonth, file, e))}
      ondragstart={file ? (event) => fileCache.onDragStart(event, file!) : undefined}
      onpointerenter={handleHover}
    >
      <span class="title">
        <span class="month">
          {$displayedMonth.format("MMM")}
        </span>
        <span class="year">
          {$displayedMonth.format("YYYY")}
        </span>
      </span>
      {#if metadata}
        <Dots {metadata} centered={false} />
      {/if}
    </div>
  {/snippet}
</MetadataResolver>

<style>
  .title {
    color: var(--color-text-title);
    cursor: pointer;
    display: flex;
    font-size: 1.4em;
    gap: 0.3em;
    margin: 0;
  }

  .month {
    font-weight: 500;
  }

  .year {
    color: var(--interactive-accent);
  }
</style>
