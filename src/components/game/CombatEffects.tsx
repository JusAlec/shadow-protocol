// ============================================================
// Shadow Protocol - Combat Visual Effects Overlay (Optimized)
// ============================================================
import React from 'react';
import { AnimationState } from '@/engine/useAnimations';

interface CombatEffectsProps {
  animState: AnimationState;
  tileSize: number;
  gap: number;
  frameTime: number;
}

const cell = (tileSize: number, gap: number) => tileSize + gap;

// Hoisted outside render — static color map
const EXPLOSION_COLORS: Record<string, { inner: string; outer: string }> = {
  explosion: { inner: 'hsl(40 100% 60%)', outer: 'hsl(0 80% 50%)' },
  fire: { inner: 'hsl(30 100% 55%)', outer: 'hsl(0 90% 45%)' },
  poison: { inner: 'hsl(120 60% 50%)', outer: 'hsl(100 50% 30%)' },
  electric: { inner: 'hsl(200 90% 65%)', outer: 'hsl(210 80% 45%)' },
  smoke: { inner: 'hsl(0 0% 70%)', outer: 'hsl(0 0% 40%)' },
  impact: { inner: 'hsl(0 0% 90%)', outer: 'hsl(0 70% 55%)' },
};

const CombatEffects: React.FC<CombatEffectsProps> = React.memo(({ animState, tileSize, gap, frameTime }) => {
  const c = cell(tileSize, gap);

  return (
    <>
      {/* Floating Damage Numbers — using SVG animate for compositor-driven motion */}
      {animState.damageNumbers.map(dn => {
        const cx = dn.position.x * c + gap + tileSize / 2;
        const cy = dn.position.y * c + gap + tileSize / 2;
        const startY = cy - 10;
        const endY = cy - 40;
        const fillColor = dn.miss ? 'hsl(0 0% 60%)' :
          dn.heal ? 'hsl(120 70% 55%)' :
          dn.critical ? 'hsl(45 100% 60%)' :
          'hsl(0 80% 60%)';
        const fontSize = dn.critical ? 18 : dn.miss ? 12 : 14;

        return (
          <g key={dn.id}>
            <text
              x={cx} y={startY}
              textAnchor="middle" fontSize={fontSize} fontWeight="bold"
              fill={fillColor}
              style={{
                pointerEvents: 'none',
                filter: dn.critical ? 'drop-shadow(0 0 4px hsl(45 100% 50%))' : undefined,
              }}
            >
              {dn.miss ? 'MISS' : dn.heal ? `+${dn.value}` : `-${dn.value}`}
              <animate attributeName="y" from={startY} to={endY} dur="1.2s" begin="0s" fill="freeze" />
              <animate attributeName="opacity" from="1" to="0" dur="1.2s" begin="0s" fill="freeze" />
            </text>
            {dn.critical && (
              <text
                x={cx} y={startY - 16}
                textAnchor="middle" fontSize={9} fontWeight="bold"
                fill="hsl(45 100% 70%)"
                style={{ pointerEvents: 'none' }}
              >
                CRITICAL!
                <animate attributeName="y" from={startY - 16} to={endY - 16} dur="1.2s" begin="0s" fill="freeze" />
                <animate attributeName="opacity" from="1" to="0" dur="1.2s" begin="0s" fill="freeze" />
              </text>
            )}
          </g>
        );
      })}

      {/* Explosion Effects — use stable frameTime */}
      {animState.explosions.map(exp => {
        const cx = exp.position.x * c + gap + tileSize / 2;
        const cy = exp.position.y * c + gap + tileSize / 2;
        const age = frameTime - exp.timestamp;
        const progress = Math.min(1, age / 800);
        const maxR = exp.radius * c + tileSize / 2;
        const col = EXPLOSION_COLORS[exp.type] || EXPLOSION_COLORS.explosion;

        return (
          <g key={exp.id} opacity={1 - progress}>
            <circle cx={cx} cy={cy} r={maxR * progress * 0.8}
              fill="none" stroke={col.outer} strokeWidth={3 - progress * 2} opacity={0.6} />
            <circle cx={cx} cy={cy} r={maxR * 0.3 * (1 - progress * 0.5)}
              fill={col.inner} opacity={0.7 * (1 - progress)} />
            {exp.type === 'explosion' && Array.from({ length: 8 }).map((_, i) => {
              const angle = (i / 8) * Math.PI * 2;
              const dist = maxR * 0.6 * progress;
              return (
                <circle key={i}
                  cx={cx + Math.cos(angle) * dist} cy={cy + Math.sin(angle) * dist}
                  r={3 - progress * 2} fill={col.inner} opacity={0.8 * (1 - progress)} />
              );
            })}
          </g>
        );
      })}
    </>
  );
});
CombatEffects.displayName = 'CombatEffects';

export default CombatEffects;
