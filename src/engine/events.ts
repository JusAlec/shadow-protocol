// ============================================================
// Shadow Protocol - Event Bus System
// ============================================================

export type GameEventType =
  | 'unit_moved'
  | 'unit_attacked'
  | 'unit_damaged'
  | 'unit_killed'
  | 'unit_healed'
  | 'ability_used'
  | 'cover_destroyed'
  | 'tile_destroyed'
  | 'hazard_triggered'
  | 'status_applied'
  | 'status_expired'
  | 'turn_started'
  | 'turn_ended'
  | 'phase_changed'
  | 'visibility_updated'
  | 'momentum_changed'
  | 'combo_available'
  | 'combo_used'
  | 'awareness_changed'
  | 'noise_generated'
  | 'overwatch_triggered'
  | 'game_over';

export interface GameEvent {
  type: GameEventType;
  payload: Record<string, unknown>;
  timestamp: number;
}

type EventHandler = (event: GameEvent) => void;

class EventBus {
  private handlers: Map<GameEventType, Set<EventHandler>> = new Map();
  private globalHandlers: Set<EventHandler> = new Set();
  private eventLog: GameEvent[] = [];

  on(type: GameEventType, handler: EventHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  onAll(handler: EventHandler): () => void {
    this.globalHandlers.add(handler);
    return () => this.globalHandlers.delete(handler);
  }

  emit(type: GameEventType, payload: Record<string, unknown> = {}): void {
    const event: GameEvent = { type, payload, timestamp: Date.now() };
    this.eventLog.push(event);

    this.handlers.get(type)?.forEach(h => h(event));
    this.globalHandlers.forEach(h => h(event));
  }

  getLog(): GameEvent[] {
    return [...this.eventLog];
  }

  clear(): void {
    this.handlers.clear();
    this.globalHandlers.clear();
    this.eventLog = [];
  }
}

export const eventBus = new EventBus();
