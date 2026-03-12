// ============================================================
// Shadow Protocol - Combat Animation Hook
// ============================================================
import { useState, useRef, useCallback, useEffect } from 'react';
import { CombatAnimation } from '@/engine/types';

export interface ActiveCombatAnimation extends CombatAnimation {
  progress: number; // 0 to 1
}

export function useCombatAnimations() {
  const [activeAnimation, setActiveAnimation] = useState<ActiveCombatAnimation | null>(null);
  const animRef = useRef<number | null>(null);
  const pendingRef = useRef<{ anim: CombatAnimation; startTime: number | null; onComplete: () => void } | null>(null);
  const safetyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (animRef.current !== null) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      if (safetyTimerRef.current !== null) {
        clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
      // If pending callback exists on unmount, call it to prevent orphaned state
      if (pendingRef.current) {
        const { onComplete } = pendingRef.current;
        pendingRef.current = null;
        onComplete();
      }
    };
  }, []);

  const startCombatAnimation = useCallback((anim: CombatAnimation, onComplete: () => void) => {
    if (animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    if (safetyTimerRef.current !== null) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }

    pendingRef.current = { anim, startTime: null, onComplete };
    animRef.current = requestAnimationFrame(tick);

    // Safety fallback: force-complete if RAF loop hasn't finished in time
    safetyTimerRef.current = window.setTimeout(() => {
      safetyTimerRef.current = null;
      if (pendingRef.current) {
        const { onComplete: cb } = pendingRef.current;
        if (animRef.current !== null) {
          cancelAnimationFrame(animRef.current);
          animRef.current = null;
        }
        pendingRef.current = null;
        setActiveAnimation(null);
        cb();
      }
    }, anim.duration + 1000);
  }, []);

  function tick(now: number) {
    const pending = pendingRef.current;
    if (!pending) return;

    if (pending.startTime === null) {
      pending.startTime = now;
    }

    const elapsed = now - pending.startTime;
    const progress = Math.min(elapsed / pending.anim.duration, 1);

    setActiveAnimation({ ...pending.anim, progress });

    if (progress < 1) {
      animRef.current = requestAnimationFrame(tick);
    } else {
      animRef.current = null;
      const { onComplete } = pending;
      pendingRef.current = null;
      // Clear safety timer on normal completion
      if (safetyTimerRef.current !== null) {
        clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
      // Synchronous clear + callback (no fragile setTimeout)
      setActiveAnimation(null);
      onComplete();
    }
  }

  return { activeAnimation, startCombatAnimation };
}
