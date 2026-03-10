// ============================================================
// Shadow Protocol - Initiative Timeline Bar
// ============================================================
import React from 'react';
import { GameState } from '../../engine/types';

interface TimelineBarProps {
  gameState: GameState;
}

const TimelineBar: React.FC<TimelineBarProps> = ({ gameState }) => {
  const { timeline, units, activeUnitId } = gameState;

  // Normalize positions for display
  const minPos = Math.min(...timeline.map(t => t.position));
  const maxPos = Math.max(...timeline.map(t => t.position));
  const range = maxPos - minPos || 1;

  return (
    <div className="rounded-lg border border-border/30 bg-card/80 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Initiative Timeline
      </h3>
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {timeline.slice(0, 12).map((entry, idx) => {
          const unit = units.find(u => u.id === entry.unitId);
          if (!unit) return null;
          const isActive = unit.id === activeUnitId;
          const isPlayer = unit.faction === 'player';

          return (
            <div
              key={entry.unitId}
              className={`flex flex-col items-center rounded-md border px-2 py-1.5 transition-all ${
                isActive
                  ? 'border-[hsl(45,100%,60%)] bg-[hsl(45,100%,60%,0.15)] scale-110'
                  : isPlayer
                    ? 'border-[hsl(210,60%,40%)] bg-[hsl(210,60%,40%,0.1)]'
                    : 'border-[hsl(0,50%,35%)] bg-[hsl(0,50%,35%,0.1)]'
              }`}
              style={{ minWidth: 52 }}
            >
              <span className={`text-xs font-bold ${
                isPlayer ? 'text-[hsl(210,80%,65%)]' : 'text-[hsl(0,70%,60%)]'
              }`}>
                {unit.name.slice(0, 4)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {Math.round(entry.position)}
              </span>
              {isActive && (
                <div className="mt-0.5 h-0.5 w-full rounded bg-[hsl(45,100%,60%)]" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TimelineBar;
