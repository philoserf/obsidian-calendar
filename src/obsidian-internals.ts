/**
 * Typed accessors for Obsidian private/internal APIs.
 *
 * Centralizes all `as any` casts so that breakage from Obsidian updates
 * surfaces in one place instead of scattered across the codebase.
 */

import type { App, Plugin, Workspace } from "obsidian";

// -- Internal plugin manager --

interface InternalPluginEntry {
  enabled: boolean;
  instance?: { options?: Record<string, unknown> };
}

interface InternalPlugins {
  plugins: Record<string, InternalPluginEntry | undefined>;
  getPluginById(id: string): InternalPluginEntry | undefined;
}

export function getInternalPlugins(app: App): InternalPlugins {
  // biome-ignore lint/suspicious/noExplicitAny: Obsidian private API
  return (app as any).internalPlugins;
}

// -- Plugin settings / options --

export function getPluginSettings(
  plugin: Plugin | null,
): Record<string, unknown> | undefined {
  if (!plugin) return undefined;
  // biome-ignore lint/suspicious/noExplicitAny: Obsidian private API
  return (plugin as any).settings;
}

export function getPluginOptions(
  plugin: Plugin | null,
): Record<string, unknown> | undefined {
  if (!plugin) return undefined;
  // biome-ignore lint/suspicious/noExplicitAny: Obsidian private API
  return (plugin as any).options;
}

// -- Fold manager --

interface FoldManager {
  load(file: unknown): Record<string, unknown> | null;
  save(file: unknown, foldInfo: Record<string, unknown>): void;
}

export function getFoldManager(app: App): FoldManager {
  // biome-ignore lint/suspicious/noExplicitAny: Obsidian private API
  return (app as any).foldManager;
}

// -- Drag manager --

interface DragManager {
  dragFile(event: DragEvent, file: unknown): unknown;
  onDragStart(event: DragEvent, dragData: unknown): void;
}

export function getDragManager(app: App): DragManager {
  // biome-ignore lint/suspicious/noExplicitAny: Obsidian private API
  return (app as any).dragManager;
}

// -- Workspace with custom events --

interface CustomWorkspaceEvents {
  on(
    name: "periodic-notes:settings-updated",
    callback: () => void,
    ctx?: unknown,
  ): ReturnType<Workspace["on"]>;
  on(
    name: "calendar:metadata-updated",
    callback: () => void,
    ctx?: unknown,
  ): ReturnType<Workspace["on"]>;
}

export type CalendarWorkspace = Workspace & CustomWorkspaceEvents;

export function asEventWorkspace(workspace: Workspace): CalendarWorkspace {
  // biome-ignore lint/suspicious/noExplicitAny: Obsidian private API
  return workspace as any as CalendarWorkspace;
}

// -- Moment locale internals --

export function getWeekStartDay(): number {
  const { moment } = window;
  // biome-ignore lint/suspicious/noExplicitAny: Moment private API
  return (moment.localeData() as any)._week.dow;
}
