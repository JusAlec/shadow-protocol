// ============================================================
// Shadow Protocol - Initiative Timeline System
// ============================================================
import { Unit, TimelineEntry, ACTION_COSTS } from '@/engine/types';

export function initializeTimeline(units: Unit[]): TimelineEntry[] {
  const entries: TimelineEntry[] = units
    .filter(u => u.alive)
    .map(u => ({
      unitId: u.id,
      position: u.timelinePosition,
    }));

  return sortTimeline(entries);
}

export function sortTimeline(timeline: TimelineEntry[]): TimelineEntry[] {
  return [...timeline].sort((a, b) => a.position - b.position);
}

export function getNextUnit(timeline: TimelineEntry[]): string | null {
  if (timeline.length === 0) return null;
  return timeline[0].unitId;
}

export function advanceUnit(
  timeline: TimelineEntry[],
  unitId: string,
  actionKey: string,
  unitSpeed: number
): TimelineEntry[] {
  const cost = ACTION_COSTS[actionKey] || ACTION_COSTS.move;
  const advance = cost / (unitSpeed / 100); // higher speed = less delay

  return sortTimeline(
    timeline.map(entry =>
      entry.unitId === unitId
        ? { ...entry, position: entry.position + advance }
        : entry
    )
  );
}

export function removeFromTimeline(
  timeline: TimelineEntry[],
  unitId: string
): TimelineEntry[] {
  return timeline.filter(e => e.unitId !== unitId);
}

// Preview where a unit would end up after an action
export function previewTimelinePosition(
  timeline: TimelineEntry[],
  unitId: string,
  actionKey: string,
  unitSpeed: number
): number {
  const entry = timeline.find(e => e.unitId === unitId);
  if (!entry) return 0;
  const cost = ACTION_COSTS[actionKey] || ACTION_COSTS.move;
  return entry.position + cost / (unitSpeed / 100);
}
