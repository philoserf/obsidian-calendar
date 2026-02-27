<script lang="ts">
  import type { Moment } from "moment";
  import { onDestroy, setContext } from "svelte";
  import { get, writable } from "svelte/store";

  import type { ISettings } from "src/settings";
  import { activeFile, settings } from "../stores";
  import { DISPLAYED_MONTH } from "./context";
  import Day from "./Day.svelte";
  import type PeriodicNotesCache from "./fileStore";
  import { configureGlobalMomentLocale } from "./localization";
  import Nav from "./Nav.svelte";
  import type { ICalendarSource, IEventHandlers, IMonth, ISourceSettings } from "./types";
  import { getDaysOfWeek, getMonth, isWeekend } from "./utils";
  import WeekNum from "./WeekNum.svelte";

  // Props from view.ts
  let {
    fileCache,
    sources = [],
    onHover,
    onClick,
    onContextMenu,
  }: {
    fileCache: PeriodicNotesCache;
    sources?: ICalendarSource[];
    onHover: IEventHandlers["onHover"];
    onClick: IEventHandlers["onClick"];
    onContextMenu: IEventHandlers["onContextMenu"];
  } = $props();

  // Internal state — today is both derived from settings (locale change) and
  // imperatively mutated by tick(), so it needs $state.raw + $effect.
  let today: Moment = $state.raw(window.moment());

  $effect(() => {
    today = getToday($settings);
  });

  // Initialise store and context before any $derived blocks that read $displayedMonthStore
  let displayedMonthStore = writable<Moment>(window.moment());
  setContext(DISPLAYED_MONTH, displayedMonthStore);

  let showWeekNums = $derived($settings.showWeeklyNote);
  let selectedId = $derived($activeFile);
  let eventHandlers: IEventHandlers = $derived({ onHover, onClick, onContextMenu });

  // Pass `today` explicitly so the derived blocks re-evaluate when locale changes
  let month: IMonth = $derived.by(() => getMonth($displayedMonthStore, today));
  let daysOfWeek: string[] = $derived.by(() => getDaysOfWeek(today));

  // Public API for view.ts
  export function tick() {
    today = window.moment();
  }

  export function setDisplayedMonth(date: Moment) {
    displayedMonthStore.set(date);
  }

  function getToday(s: ISettings) {
    configureGlobalMomentLocale(s.localeOverride, s.weekStart);
    return window.moment();
  }

  // sourceId-based settings not yet persisted; all sources share defaults for now
  function getSourceSettings(_sourceId: string): ISourceSettings {
    return {
      color: "default",
      display: "calendar-and-menu",
      order: 0,
    };
  }

  // Heartbeat: update today every 60s; auto-advance displayed month if the user
  // was viewing the current month when the month boundary crossed.
  const heartbeat = setInterval(() => {
    const prevToday = today;
    tick();
    if (!prevToday.isSame(today, "month")) {
      if (get(displayedMonthStore).isSame(prevToday, "month")) {
        displayedMonthStore.set(today);
      }
    }
  }, 1000 * 60);

  onDestroy(() => {
    clearInterval(heartbeat);
  });
</script>

<div id="calendar-container" class="container">
  <Nav
    {fileCache}
    {today}
    {getSourceSettings}
    {eventHandlers}
  />
  <table class="calendar">
    <colgroup>
      {#if showWeekNums}
        <col />
      {/if}
      {#each month[1].days as date}
        <col class:weekend={isWeekend(date)} />
      {/each}
    </colgroup>
    <thead>
      <tr>
        {#if showWeekNums}
          <th>W</th>
        {/if}
        {#each daysOfWeek as dayOfWeek}
          <th>{dayOfWeek}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each month as week (week.weekNum)}
        <tr>
          {#if showWeekNums}
            <WeekNum
              {fileCache}
              {selectedId}
              {getSourceSettings}
              {...week}
              {...eventHandlers}
            />
          {/if}
          {#each week.days as day (day.format())}
            <Day
              date={day}
              {fileCache}
              {getSourceSettings}
              {today}
              {selectedId}
              {...eventHandlers}
            />
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .container {
    --color-background-heading: transparent;
    --color-background-day: transparent;
    --color-background-weeknum: transparent;
    --color-background-weekend: transparent;

    --color-dot: var(--text-muted);
    --color-arrow: var(--text-muted);
    --color-button: var(--text-muted);

    --color-text-title: var(--text-normal);
    --color-text-heading: var(--text-muted);
    --color-text-day: var(--text-normal);
    --color-text-today: var(--interactive-accent);
    --color-text-weeknum: var(--text-muted);
  }

  .container {
    padding: 0 8px;
  }

  .weekend {
    background-color: var(--color-background-weekend);
  }

  .calendar {
    border-collapse: collapse;
    width: 100%;
  }

  th {
    background-color: var(--color-background-heading);
    color: var(--color-text-heading);
    font-size: 0.6em;
    letter-spacing: 1px;
    padding: 4px;
    text-align: center;
    text-transform: uppercase;
  }
</style>
