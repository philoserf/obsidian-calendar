---
name: "Address Review Findings"
overview: "Fix all issues surfaced in the code review, grouped by priority: P0 crashes → P1 resource leaks and Svelte reactivity bugs → P2 logic bugs → P3 cleanups → add pure-function tests."
todos:
  - id: "p0-locale-spec"
    content: "Fix _bundledLocaleWeekSpec crash: call configureGlobalMomentLocale() eagerly in CalendarPlugin.onload() after loadOptions()"
    status: not_started
  - id: "p0-reveal-crash"
    content: "Fix this.view null crash in reveal-active-note: change callback to checkCallback gated on view existence"
    status: not_started
  - id: "p1-subscription-leak"
    content: "Fix settings subscription leak in view.ts:39: wrap with this.register(settings.subscribe(...))"
    status: not_started
  - id: "p1-modal-promise"
    content: "Fix unhandled promise in modal.ts:30: wrap button handler in try/finally { this.close(); }"
    status: not_started
  - id: "p1-cache-arch"
    content: "Move PeriodicNotesCache from Calendar.svelte to CalendarView.onOpen(); change constructor to accept Component+App; register events on view lifetime; add fileCache as Calendar prop"
    status: not_started
  - id: "p1-svelte-calendar"
    content: "Fix state_referenced_locally in Calendar.svelte: change writable(today) to writable(window.moment()); remove PeriodicNotesCache instantiation (handled by cache-arch)"
    status: not_started
  - id: "p1-svelte-components"
    content: "Fix state_referenced_locally in Day.svelte, WeekNum.svelte, Month.svelte: replace top-level subscribe+onDestroy with $effect(() => { return fileCache.store.subscribe(...); })"
    status: not_started
  - id: "p2-logic-bugs"
    content: "Fix all P2 logic bugs: boolean return types, wordsPerDot NaN guard, appHasWeeklyNotesPluginLoaded self-referential check, draggable={!!file} in Day/Month/WeekNum, NODE_ENV casing, workspace.activeLeaf deprecation, ensureFolderExists recursive, heartbeat month granularity, getViewType as plugin ID"
    status: not_started
  - id: "p3-cleanups"
    content: "Apply P3 cleanups: navigator.userAgent, indexOf||0 fix, today; dependency hack, template error message, getSourceSettings comment"
    status: not_started
  - id: "tests"
    content: "Add pure-function test files: utils.test.ts, parse.test.ts, localization.test.ts"
    status: not_started
createdAt: "2026-02-26T18:39:52.745Z"
updatedAt: "2026-02-26T18:39:52.745Z"
---

# Address Review Findings

## Phase 1 — P0 Crashes

**1. `_bundledLocaleWeekSpec` crash (`src/settings.ts:117`)**
Call `configureGlobalMomentLocale()` eagerly inside `CalendarPlugin.onload()` after `loadOptions()`, so the global is populated before the settings tab can render. This is the root cause; the settings tab access is fine once the global is initialized.

**2. `this.view` null crash (`src/main.ts:62`)**
Change the `reveal-active-note` command from `callback` to `checkCallback`, returning `false` when `this.view` is not yet assigned.

---

## Phase 2 — P1: Resource Leaks & Modal

**3. Settings subscription leak (`src/view.ts:39`)**
Wrap with `this.register(settings.subscribe(...))` — `Component.register()` accepts the unsubscribe function and calls it on `onunload`.

**4. Unhandled promise in modal (`src/modal.ts:30`)**
Wrap the button click handler body in `try/finally { this.close(); }`.

**5. PeriodicNotesCache accumulation (architecture)**
- Move cache creation from `Calendar.svelte` into `CalendarView.onOpen()`.
- Change `PeriodicNotesCache` constructor: replace the `Plugin` parameter with a `Component` (imported from `obsidian`) plus a separate `App`. Both `Plugin` and `ItemView` extend `Component`, so both contexts work. Register vault events via the component's `registerEvent()` so they are scoped to the view's lifetime, not the plugin's.
- Add `fileCache: PeriodicNotesCache` as an explicit prop to `Calendar.svelte`, removing the local instantiation.
- Key files: `src/components/fileStore.ts`, `src/view.ts`, `src/components/Calendar.svelte`.

---

## Phase 3 — P1: Svelte 5 Reactivity (`state_referenced_locally`)

**6. `Calendar.svelte:89` — `writable(today)` captures by value**
Change to `writable(window.moment())` — semantically identical since `today` starts as `window.moment()`, but no longer reads a reactive rune in a non-reactive context.

**7. `Calendar.svelte:92` — `PeriodicNotesCache` created from reactive props**
Eliminated by Phase 2 fix (cache becomes a prop).

**8. `Day.svelte:60`, `WeekNum.svelte:52`, `Month.svelte:62` — `fileCache.store.subscribe()` captured at module level**
Replace the top-level `const unsubscribe = fileCache.store.subscribe(...)` + `onDestroy(unsubscribe)` pattern with `$effect(() => { const unsub = fileCache.store.subscribe(...); return unsub; })`. The returned teardown is called automatically by Svelte on effect re-run or component destruction.

---

## Phase 4 — P2: Logic Bugs

| # | File | Fix |
|---|------|-----|
| 9 | `src/settings.ts:41` | `return !!periodicNotes?.settings?.weekly?.enabled` |
| 10 | `src/settings.ts:107` | Guard `wordsPerDot`: `Number.isFinite(n) && n > 0 ? n : DEFAULT_WORDS_PER_DOT` |
| 11 | `src/periodic-notes/settings.ts:163` | Remove the self-referential `getPlugin("calendar")` check; fall back to `calendar?.options?.showWeeklyNote` |
| 12 | `src/components/Day.svelte:104` | `draggable={!!file}` |
| 13 | `src/components/Month.svelte:94` | `draggable={!!file}` |
| 14 | `src/components/WeekNum.svelte:77` | `draggable={!!file}` |
| 15 | `vite.config.ts:18` | `process.env.NODE_ENV === "development"` |
| 16 | `src/view.ts:161, 178` | Replace `workspace.activeLeaf` with `workspace.getActiveFile()` and adjust callers (the `instanceof FileView` branch is no longer needed) |
| 17 | `src/periodic-notes/vault.ts:28` | `ensureFolderExists`: walk each path segment in a loop, creating any missing ancestor folder before the next |
| 18 | `src/components/Calendar.svelte:80` | Heartbeat: save `prevToday` before calling `tick()`, then advance `displayedMonthStore` only if the user was viewing the old month and a month boundary was crossed |
| 19 | `src/view.ts:75` | Add `PLUGIN_ID = "calendar"` to `src/constants.ts` and use it instead of `getViewType()` |

---

## Phase 5 — P3: Cleanups

| # | File | Fix |
|---|------|-----|
| 20 | `src/components/utils.ts:6` | `navigator.userAgent.includes("Mac")` |
| 21 | `src/components/localization.ts:73` | `const idx = weekdays.indexOf(weekStart); return idx < 0 ? 0 : idx;` |
| 22 | `src/components/utils.ts` + `Calendar.svelte:45,50` | Give `getMonth` and `getDaysOfWeek` an optional `_today?: Moment` parameter; call them as `getMonth($displayedMonthStore, today)` and `getDaysOfWeek(today)` — removes the bare `today;` no-op |
| 23 | `src/periodic-notes/vault.ts:52` | Pass a `noteType` string to `getTemplateInfo`, use it in the error `Notice` and `console.error` |
| 24 | `src/components/Calendar.svelte:69` | Add inline comment: placeholder — `sourceId` not yet persisted |

---

## Phase 6 — Tests

Scaffold pure-function tests using bun's built-in test runner. Each file sets `window.moment = require('moment')` in `beforeAll`.

| Test file | Functions covered |
|-----------|-------------------|
| `src/components/utils.test.ts` | `getMonth` (grid shape, week boundaries), `getDaysOfWeek`, `isWeekend`, `getStartOfWeek` |
| `src/periodic-notes/parse.test.ts` | `getDateUID`, `getDateFromPath` (mock `getWeeklyNoteSettings` etc. via `mock.module`) |
| `src/components/localization.test.ts` | `configureGlobalMomentLocale` (locale switching), `overrideGlobalMomentWeekStart` (week-start values) |

---

## Verification

After each phase:
```
bun run typecheck   # 0 errors
bun run lint        # 0 issues
bun run build       # no svelte-check warnings
bun test            # all tests pass
```
