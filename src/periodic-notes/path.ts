export function join(...partSegments: string[]): string {
  let parts: string[] = [];
  for (let i = 0, l = partSegments.length; i < l; i++) {
    parts = parts.concat(partSegments[i].split("/"));
  }
  const newParts: string[] = [];
  for (let i = 0, l = parts.length; i < l; i++) {
    const part = parts[i];
    if (!part || part === ".") continue;
    newParts.push(part);
  }
  if (parts[0] === "") newParts.unshift("");
  return newParts.join("/");
}

export function getWeekdayOrder(weekStart: number): string[] {
  let start = weekStart;
  const daysOfWeek = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  while (start) {
    // biome-ignore lint/style/noNonNullAssertion: array is guaranteed non-empty
    daysOfWeek.push(daysOfWeek.shift()!);
    start--;
  }
  return daysOfWeek;
}

export function getDayOfWeekNumericalValue(
  dayOfWeekName: string,
  weekStart: number,
): number {
  return getWeekdayOrder(weekStart).indexOf(dayOfWeekName.toLowerCase());
}
