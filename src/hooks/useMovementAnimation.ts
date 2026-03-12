// ============================================================
// Shadow Protocol - Movement Animation Hook
// ============================================================
import { useState, useRef, useCallback, useEffect } from 'react';
import { Position } from '@/engine/types';
import { deltaToFacing } from '@/engine/sprites';
import { AnimatedUnitState } from '@/components/game/TacticalMap';

const MS_PER_TILE = 250;
const WALK_FRAMES = 6;

interface PendingAnimation {
  unitId: string;
  path: Position[];
  segments: number;
  duration: number;
  startTime: number | null; // null until first tick captures RAF timestamp
  onComplete: () => void;
  onStep?: () => void; // #2: called when segment changes (footstep sound)
  onLastStep?: () => void; // called on final segment for heavier thud
  lastSegment: number; // #2: track last segment index for step detection
}

export function useMovementAnimation() {
  const [animatingUnits, setAnimatingUnits] = useState<Map<string, AnimatedUnitState>>(new Map());
  const animationRef = useRef<number | null>(null);
  const pendingRef = useRef<PendingAnimation | null>(null);
  const isAnimatingRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      pendingRef.current = null;
      isAnimatingRef.current = false;
    };
  }, []);

  const completeAnimation = useCallback((pending: PendingAnimation) => {
    setAnimatingUnits(prev => {
      const next = new Map(prev);
      next.delete(pending.unitId);
      return next;
    });
    animationRef.current = null;
    pendingRef.current = null;
    isAnimatingRef.current = false;
    pending.onComplete();
  }, []);

  const startAnimation = useCallback((unitId: string, path: Position[], onComplete: () => void, onStep?: () => void, onLastStep?: () => void) => {
    if (!Array.isArray(path) || path.length < 2) {
      onComplete();
      return;
    }

    // Cancel any existing animation
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    const segments = path.length - 1;
    const pathCopy = path.map(p => ({ x: p.x, y: p.y }));

    pendingRef.current = {
      unitId,
      path: pathCopy,
      segments,
      duration: segments * MS_PER_TILE,
      startTime: null, // captured on first tick from RAF timestamp
      onComplete,
      onStep, // #2: footstep callback
      onLastStep, // heavier thud on final step
      lastSegment: 0, // #2: track segment for step detection
    };
    isAnimatingRef.current = true;

    animationRef.current = requestAnimationFrame(tick);
  }, []);

  function tick(now: number) {
    const pending = pendingRef.current;
    if (!pending) return;

    // Capture start time from first RAF timestamp to avoid layout-effect timing skew
    if (pending.startTime === null) {
      pending.startTime = now;
    }

    const { path, segments, duration, startTime } = pending;
    const elapsed = now - startTime!;
    const progress = Math.min(elapsed / duration, 1);

    // Determine which segment we're in
    const rawSegment = progress * segments;
    const segmentIndex = Math.min(Math.floor(rawSegment), segments - 1);
    const segmentProgress = rawSegment - segmentIndex;

    const from = path[segmentIndex];
    const to = path[segmentIndex + 1];

    // Interpolate position
    const x = from.x + (to.x - from.x) * segmentProgress;
    const y = from.y + (to.y - from.y) * segmentProgress;

    // Facing based on current segment direction
    const facing = deltaToFacing(to.x - from.x, to.y - from.y);

    // #2: Fire onStep callback when segment changes
    if (segmentIndex > pending.lastSegment && pending.onStep) {
      pending.onStep();
      pending.lastSegment = segmentIndex;
    }

    // Walk frame cycles through 0-5 based on time
    const walkFrame = Math.floor((elapsed / (MS_PER_TILE / WALK_FRAMES)) % WALK_FRAMES);

    setAnimatingUnits(prev => {
      const next = new Map(prev);
      next.set(pending.unitId, { x, y, facing, walkFrame });
      return next;
    });

    if (progress < 1) {
      animationRef.current = requestAnimationFrame(tick);
    } else {
      // Fire final step sound for the last segment — use heavier thud if available
      if (pending.lastSegment < segments) {
        if (pending.onLastStep) {
          pending.onLastStep();
        } else if (pending.onStep) {
          pending.onStep();
        }
      }
      completeAnimation(pending);
    }
  }

  const isAnimating = isAnimatingRef.current || animatingUnits.size > 0;

  return {
    animatingUnits,
    startAnimation,
    isAnimating,
  };
}
