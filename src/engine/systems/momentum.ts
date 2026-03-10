// ============================================================
// Shadow Protocol - Momentum System
// ============================================================
import { MomentumState, MomentumEvent, MOMENTUM_VALUES } from '../types';
import { eventBus } from '../events';

export function createMomentumState(): MomentumState {
  return { current: 0, threshold: 10, comboAvailable: false };
}

export function applyMomentum(
  state: MomentumState,
  event: MomentumEvent
): MomentumState {
  const delta = MOMENTUM_VALUES[event];
  const newCurrent = Math.max(0, Math.min(state.threshold, state.current + delta));
  const comboAvailable = newCurrent >= state.threshold;

  if (comboAvailable && !state.comboAvailable) {
    eventBus.emit('combo_available', {});
  }

  eventBus.emit('momentum_changed', { previous: state.current, current: newCurrent, event });

  return { ...state, current: newCurrent, comboAvailable };
}

export function consumeMomentum(state: MomentumState): MomentumState {
  eventBus.emit('combo_used', { previousMomentum: state.current });
  return { ...state, current: 0, comboAvailable: false };
}
