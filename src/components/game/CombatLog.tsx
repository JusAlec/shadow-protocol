// ============================================================
// Shadow Protocol - Combat Log
// ============================================================
import React, { useRef, useEffect } from 'react';
import { CombatLogEntry } from '../../engine/types';

interface CombatLogProps {
  entries: CombatLogEntry[];
}

const TYPE_COLORS: Record<string, string> = {
  damage: 'text-[hsl(0,70%,60%)]',
  kill: 'text-[hsl(0,80%,55%)] font-bold',
  ability: 'text-[hsl(280,60%,65%)]',
  movement: 'text-muted-foreground',
  status: 'text-[hsl(45,80%,55%)]',
  environment: 'text-[hsl(30,80%,55%)]',
  momentum: 'text-[hsl(45,100%,60%)] font-bold',
  info: 'text-[hsl(210,60%,65%)]',
};

const CombatLog: React.FC<CombatLogProps> = ({ entries }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  return (
    <div className="rounded-lg border border-border/30 bg-card/80 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Combat Log
      </h3>
      <div
        ref={scrollRef}
        className="h-36 overflow-y-auto space-y-0.5 text-[11px] font-mono pr-1"
      >
        {entries.map((entry, idx) => (
          <div key={idx} className={`${TYPE_COLORS[entry.type] || 'text-foreground'}`}>
            <span className="text-muted-foreground/50 mr-1">T{entry.turn}</span>
            {entry.message}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CombatLog;
