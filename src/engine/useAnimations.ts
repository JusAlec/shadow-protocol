// ============================================================
// Shadow Protocol - Combat Animation Manager
// ============================================================
import { useState, useCallback, useRef } from 'react';
import { Position } from '@/engine/types';

export interface DamageNumber {
  id: string;
  position: Position;
  value: number;
  critical: boolean;
  miss: boolean;
  heal: boolean;
  timestamp: number;
}

export interface ExplosionEffect {
  id: string;
  position: Position;
  radius: number;
  type: 'explosion' | 'poison' | 'electric' | 'fire' | 'smoke' | 'impact';
  timestamp: number;
}

export interface UnitAnimation {
  unitId: string;
  from: Position;
  to: Position;
  timestamp: number;
  duration: number;
}

export interface AnimationState {
  damageNumbers: DamageNumber[];
  explosions: ExplosionEffect[];
  unitAnimations: UnitAnimation[];
  screenShake: boolean;
  screenShakeIntensity: number;
}

let animId = 0;
function nextId() { return `anim_${++animId}_${Date.now()}`; }

export function useAnimations() {
  const [animState, setAnimState] = useState<AnimationState>({
    damageNumbers: [],
    explosions: [],
    unitAnimations: [],
    screenShake: false,
    screenShakeIntensity: 0,
  });
  const shakeTimerRef = useRef<number | null>(null);

  const showDamageNumber = useCallback((position: Position, value: number, critical: boolean, miss: boolean = false, heal: boolean = false) => {
    const id = nextId();
    setAnimState(prev => ({
      ...prev,
      damageNumbers: [...prev.damageNumbers, { id, position, value, critical, miss, heal, timestamp: Date.now() }],
    }));
    // Auto-remove after animation
    setTimeout(() => {
      setAnimState(prev => ({
        ...prev,
        damageNumbers: prev.damageNumbers.filter(d => d.id !== id),
      }));
    }, 1200);
  }, []);

  const showExplosion = useCallback((position: Position, radius: number, type: ExplosionEffect['type'] = 'explosion') => {
    const id = nextId();
    setAnimState(prev => ({
      ...prev,
      explosions: [...prev.explosions, { id, position, radius, type, timestamp: Date.now() }],
    }));
    setTimeout(() => {
      setAnimState(prev => ({
        ...prev,
        explosions: prev.explosions.filter(e => e.id !== id),
      }));
    }, 800);
  }, []);

  const animateUnitMove = useCallback((unitId: string, from: Position, to: Position, duration: number = 300) => {
    const anim: UnitAnimation = { unitId, from, to, timestamp: Date.now(), duration };
    setAnimState(prev => ({
      ...prev,
      unitAnimations: [...prev.unitAnimations, anim],
    }));
    setTimeout(() => {
      setAnimState(prev => ({
        ...prev,
        unitAnimations: prev.unitAnimations.filter(a => a.unitId !== unitId),
      }));
    }, duration);
  }, []);

  const triggerScreenShake = useCallback((intensity: number = 1) => {
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    setAnimState(prev => ({ ...prev, screenShake: true, screenShakeIntensity: intensity }));
    shakeTimerRef.current = window.setTimeout(() => {
      setAnimState(prev => ({ ...prev, screenShake: false, screenShakeIntensity: 0 }));
      shakeTimerRef.current = null;
    }, 400);
  }, []);

  return {
    animState,
    showDamageNumber,
    showExplosion,
    animateUnitMove,
    triggerScreenShake,
  };
}
