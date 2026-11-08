// React keys for a list whose ids may repeat: the first of an id keeps it, a later twin gets "~1", "~2"... Pure, so the map and its test share it.
// (A room's assets are numbered from two counters that can meet, so `room-11` can stand twice; the ids are kept, old saves hold them.)
export function uniqueKeys(items: readonly { id: string }[]): string[] {
  const seen = new Map<string, number>();
  return items.map(({ id }) => {
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    return n === 0 ? id : `${id}~${n}`;
  });
}
