// ============================================================
// Shadow Protocol - Combat Visual Effects Overlay
// ============================================================
import React from 'react';
import { AnimationState } from '@/engine/useAnimations';

interface CombatEffectsProps {
  animState: AnimationState;
  tileSize: number;
  gap: number;
}

const CELL = (tileSize: number, gap: number) => tileSize + gap;

const CombatEffects: React.FC<CombatEffectsProps> = ({ animState, tileSize, gap }) => {
  const cell = CELL(tileSize, gap);

  return (
    <>
      {/* Floating Damage Numbers */}
      {animState.damageNumbers.map(dn => {
        const cx = dn.position.x * cell + gap + tileSize / 2;
        const cy = dn.position.y * cell + gap + tileSize / 2;
        const age = Date.now() - dn.timestamp;
        const progress = Math.min(1, age / 1200);

        return (
          <g key={dn.id}>
            <text
              x={cx}
              y={cy - 10 - progress * 30}
              textAnchor="middle"
              fontSize={dn.critical ? 18 : dn.miss ? 12 : 14}
              fontWeight="bold"
              fill={
                dn.miss ? 'hsl(0 0% 60%)' :
                dn.heal ? 'hsl(120 70% 55%)' :
                dn.critical ? 'hsl(45 100% 60%)' :
                'hsl(0 80% 60%)'
              }
              opacity={1 - progress * 0.8}
              style={{ pointerEvents: 'none', filter: dn.critical ? 'drop-shadow(0 0 4px hsl(45 100% 50%))' : undefined }}
            >
              {dn.miss ? 'MISS' : dn.heal ? `+${dn.value}` : `-${dn.value}`}
            </text>
            {dn.critical && (
              <text
                x={cx}
                y={cy - 26 - progress * 30}
                textAnchor="middle"
                fontSize={9}
                fontWeight="bold"
                fill="hsl(45 100% 70%)"
                opacity={1 - progress * 0.8}
                style={{ pointerEvents: 'none' }}
              >
                CRITICAL!
              </text>
            )}
          </g>
        );
      })}

      {/* Explosion Effects */}
      {animState.explosions.map(exp => {
        const cx = exp.position.x * cell + gap + tileSize / 2;
        const cy = exp.position.y * cell + gap + tileSize / 2;
        const age = Date.now() - exp.timestamp;
        const progress = Math.min(1, age / 800);
        const maxR = exp.radius * cell + tileSize / 2;

        const colors: Record<string, { inner: string; outer: string }> = {
          explosion: { inner: 'hsl(40 100% 60%)', outer: 'hsl(0 80% 50%)' },
          fire: { inner: 'hsl(30 100% 55%)', outer: 'hsl(0 90% 45%)' },
          poison: { inner: 'hsl(120 60% 50%)', outer: 'hsl(100 50% 30%)' },
          electric: { inner: 'hsl(200 90% 65%)', outer: 'hsl(210 80% 45%)' },
          smoke: { inner: 'hsl(0 0% 70%)', outer: 'hsl(0 0% 40%)' },
          impact: { inner: 'hsl(0 0% 90%)', outer: 'hsl(0 70% 55%)' },
        };
        const c = colors[exp.type] || colors.explosion;

        return (
          <g key={exp.id} opacity={1 - progress}>
            {/* Outer ring */}
            <circle
              cx={cx}
              cy={cy}
              r={maxR * progress * 0.8}
              fill="none"
              stroke={c.outer}
              strokeWidth={3 - progress * 2}
              opacity={0.6}
            />
            {/* Inner flash */}
            <circle
              cx={cx}
              cy={cy}
              r={maxR * 0.3 * (1 - progress * 0.5)}
              fill={c.inner}
              opacity={0.7 * (1 - progress)}
            />
            {/* Particles */}
            {exp.type === 'explosion' && Array.from({ length: 8 }).map((_, i) => {
              const angle = (i / 8) * Math.PI * 2;
              const dist = maxR * 0.6 * progress;
              return (
                <circle
                  key={i}
                  cx={cx + Math.cos(angle) * dist}
                  cy={cy + Math.sin(angle) * dist}
                  r={3 - progress * 2}
                  fill={c.inner}
                  opacity={0.8 * (1 - progress)}
                />
              );
            })}
          </g>
        );
      })}
    </>
  );
};

export default CombatEffects;
