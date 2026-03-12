// ============================================================
// Shadow Protocol - Tactical HUD
// ============================================================
import React, { useState } from 'react';
import { GameState, Unit, TileData } from '../../engine/types';
import { WEAPONS } from '../../engine/data/weapons';
import { ABILITIES } from '../../engine/data/abilities';
import { Button } from '../ui/button';

interface TacticalHUDProps {
  gameState: GameState;
  onSelectAction: (action: string | null) => void;
  onReload: () => void;
  onOverwatch: () => void;
  onEndTurn: () => void;
  onCombo: (id: string) => void;
}

const TacticalHUD: React.FC<TacticalHUDProps> = ({
  gameState, onSelectAction, onReload, onOverwatch, onEndTurn, onCombo
}) => {
  const { units, activeUnitId, momentum, selectedAction, phase } = gameState;
  const activeUnit = units.find(u => u.id === activeUnitId);
  const isPlayerTurn = phase === 'player_turn' && activeUnit?.faction === 'player';

  return (
    <div className="flex flex-col gap-3">
      {/* Squad Portraits */}
      <div className="rounded-lg border border-border/30 bg-card/80 p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Squad
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {units.filter(u => u.faction === 'player').map((unit, i) => (
            <UnitPortrait key={unit.id} unit={unit} isActive={unit.id === activeUnitId} isRightColumn={i % 2 === 1} grid={gameState.grid} />
          ))}
        </div>
      </div>

      {/* Active Unit Detail */}
      {activeUnit && isPlayerTurn && (
        <div className="rounded-lg border border-border/30 bg-card/80 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {activeUnit.name} — {activeUnit.class.toUpperCase()}
          </h3>
          <div className="grid grid-cols-3 gap-1 text-xs mb-3">
            <StatBadge label="HP" value={`${activeUnit.stats.health}/${activeUnit.stats.maxHealth}`} color="hsl(120 70% 45%)" />
            <StatBadge label="Armor" value={`${activeUnit.stats.armor}`} color="hsl(210 60% 55%)" />
            <StatBadge label="AP" value={`${activeUnit.actionPoints}/${activeUnit.maxActionPoints}`} color="hsl(45 80% 55%)" />
          </div>
          <div className="mb-3 text-xs text-muted-foreground">
            Ammo: {activeUnit.ammo}/{activeUnit.maxAmmo} •
            Weapon: {WEAPONS[activeUnit.weaponId]?.name || 'None'}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-1.5">
            <ActionButton
              label="Move"
              active={selectedAction === 'move'}
              disabled={activeUnit.actionPoints < 1}
              onClick={() => onSelectAction(selectedAction === 'move' ? null : 'move')}
              shortcut="M"
            />
            <ActionButton
              label="Shoot"
              active={selectedAction === 'shoot'}
              disabled={activeUnit.actionPoints < 1 || activeUnit.ammo <= 0}
              onClick={() => onSelectAction(selectedAction === 'shoot' ? null : 'shoot')}
              shortcut="S"
            />
            <ActionButton
              label="Reload"
              active={false}
              disabled={activeUnit.actionPoints < 1 || activeUnit.ammo === activeUnit.maxAmmo}
              onClick={onReload}
              shortcut="R"
            />
            <ActionButton
              label="Overwatch"
              active={false}
              disabled={activeUnit.actionPoints < 1}
              onClick={onOverwatch}
              shortcut="O"
            />
          </div>

          {/* Abilities */}
          {activeUnit.abilityIds.length > 0 && (
            <div className="mt-2">
              <div className="text-xs text-muted-foreground mb-1">Abilities</div>
              <div className="grid grid-cols-1 gap-1">
                {activeUnit.abilityIds.map((aId, idx) => {
                  const ability = ABILITIES[aId];
                  if (!ability) return null;
                  const cd = activeUnit.abilityCooldowns[aId] || 0;
                  const shortcutKey = idx < 4 ? String(idx + 1) : null; // #8: 1-4 shortcuts
                  return (
                    <button
                      key={aId}
                      onClick={() => onSelectAction(selectedAction === `ability:${aId}` ? null : `ability:${aId}`)}
                      disabled={cd > 0 || activeUnit.actionPoints < ability.cost}
                      title={ability.description} /* #3: Tooltip */
                      className={`flex items-center justify-between rounded border px-2 py-1 text-xs transition-all ${
                        selectedAction === `ability:${aId}`
                          ? 'border-[hsl(280,60%,55%)] bg-[hsl(280,60%,55%,0.2)] text-[hsl(280,60%,75%)]'
                          : cd > 0
                            ? 'border-border/20 bg-muted/20 text-muted-foreground/50'
                            : 'border-border/30 bg-muted/30 text-foreground hover:border-[hsl(280,60%,55%)] hover:bg-[hsl(280,60%,55%,0.1)]'
                      }`}
                    >
                      <span>{ability.name}</span>
                      <span className="flex items-center gap-1">
                        {cd > 0 && <span className="text-[10px] text-muted-foreground">CD: {cd}</span>}
                        {shortcutKey && <kbd className="rounded bg-muted/30 px-1 text-[9px] text-muted-foreground">{shortcutKey}</kbd>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* End Turn */}
          <Button
            onClick={onEndTurn}
            variant="outline"
            size="sm"
            className="mt-2 w-full border-border/40 text-xs"
          >
            End Turn (Space)
          </Button>
        </div>
      )}

      {/* Momentum Meter */}
      <div className="rounded-lg border border-border/30 bg-card/80 p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Momentum
        </h3>
        <div className="relative h-4 w-full overflow-hidden rounded-full bg-muted/30">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${(momentum.current / momentum.threshold) * 100}%`,
              background: momentum.comboAvailable
                ? 'linear-gradient(90deg, hsl(45 100% 50%), hsl(30 100% 55%))'
                : 'linear-gradient(90deg, hsl(210 60% 45%), hsl(210 80% 55%))',
            }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>{momentum.current}/{momentum.threshold}</span>
          {momentum.comboAvailable && (
            <span className="text-[hsl(45,100%,60%)] font-bold animate-pulse">COMBO READY!</span>
          )}
        </div>

        {momentum.comboAvailable && (
          <div className="mt-2 grid gap-1">
            {['tactical_barrage', 'breach_assault', 'coordinated_strike'].map(id => {
              const ability = ABILITIES[id];
              return ability ? (
                <button
                  key={id}
                  onClick={() => onCombo(id)}
                  className="rounded border border-[hsl(45,80%,45%)] bg-[hsl(45,80%,45%,0.15)] px-2 py-1 text-xs text-[hsl(45,100%,70%)] hover:bg-[hsl(45,80%,45%,0.25)] transition-all"
                >
                  {ability.name}
                </button>
              ) : null;
            })}
          </div>
        )}
      </div>

      {/* Enemy Intel */}
      <div className="rounded-lg border border-border/30 bg-card/80 p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Enemy Intel
        </h3>
        <div className="space-y-1">
          {units.filter(u => u.faction === 'enemy').map(unit => {
            const vis = gameState.squadVisibility[`${unit.position.x},${unit.position.y}`];
            return (
              <div key={unit.id} className="flex items-center justify-between text-xs">
                <span className={vis === 'visible' ? 'text-[hsl(0,70%,60%)]' : 'text-muted-foreground/50'}>
                  {vis === 'visible' ? unit.name : '???'}
                </span>
                <span className={`text-[10px] ${unit.alive ? '' : 'line-through text-muted-foreground/30'}`}>
                  {!unit.alive ? 'KIA' : vis === 'visible' ? `${unit.stats.health}HP` : vis === 'detected' ? 'Last seen' : 'Unknown'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Sub-components
const UnitPortrait: React.FC<{ unit: Unit; isActive: boolean; isRightColumn?: boolean; grid?: TileData[][] }> = ({ unit, isActive, isRightColumn, grid }) => {
  const [hovered, setHovered] = useState(false);
  const healthPct = unit.stats.health / unit.stats.maxHealth;
  const weapon = WEAPONS[unit.weaponId];
  return (
    <div
      className={`relative flex items-center gap-2 rounded-md border p-2 transition-all ${
        !unit.alive
          ? 'border-border/10 bg-muted/10 opacity-40'
          : isActive
            ? 'border-[hsl(45,100%,60%)] bg-[hsl(45,100%,60%,0.1)]'
            : 'border-border/20 bg-muted/20'
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ${
        unit.alive ? '' : 'opacity-30'
      }`} style={{ background: unit.faction === 'player' ? 'hsl(210 60% 40%)' : 'hsl(0 50% 40%)' }}>
        {unit.name[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate text-xs font-medium">{unit.name}</div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${healthPct * 100}%`,
              background: healthPct > 0.6 ? 'hsl(120 70% 45%)' : healthPct > 0.3 ? 'hsl(40 80% 50%)' : 'hsl(0 70% 50%)',
            }}
          />
        </div>
      </div>
      {/* #9: Hover detail popup */}
      {hovered && unit.alive && (
        <div className={`absolute ${isRightColumn ? 'right-0' : 'left-0'} top-full z-50 mt-1 w-48 rounded-lg border border-border/40 bg-card p-2 text-xs shadow-lg`}>
          <div className="font-semibold text-foreground mb-1">{unit.name} — {unit.class}</div>
          <div className="grid grid-cols-3 gap-1 mb-1">
            <div>HP: <span className="text-[hsl(120,70%,50%)]">{unit.stats.health}/{unit.stats.maxHealth}</span></div>
            <div>Armor: <span className="text-[hsl(210,60%,55%)]">{unit.stats.armor}</span></div>
            <div>AP: <span className="text-[hsl(45,80%,55%)]">{unit.actionPoints}/{unit.maxActionPoints}</span></div>
          </div>
          {weapon && <div className="text-muted-foreground">Weapon: {weapon.name}</div>}
          {unit.statusEffects.length > 0 && (
            <div className="mt-1 text-[hsl(280,60%,55%)]">
              {unit.statusEffects.map((e, i) => (
                <span key={i}>{e.type} ({e.duration}t){i < unit.statusEffects.length - 1 ? ', ' : ''}</span>
              ))}
            </div>
          )}
          {unit.overwatching && <div className="mt-1 text-[hsl(45,100%,60%)]">Overwatching</div>}
          {grid && grid[unit.position.y]?.[unit.position.x]?.smoke && grid[unit.position.y][unit.position.x].smoke! > 0 && (
            <div className="mt-1 text-[hsl(0,0%,65%)]">In Smoke ({grid[unit.position.y][unit.position.x].smoke}t)</div>
          )}
        </div>
      )}
    </div>
  );
};

const StatBadge: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div className="flex flex-col items-center rounded border border-border/20 bg-muted/20 px-1 py-0.5">
    <span className="text-[9px] uppercase text-muted-foreground">{label}</span>
    <span className="text-xs font-bold" style={{ color }}>{value}</span>
  </div>
);

const ActionButton: React.FC<{
  label: string; active: boolean; disabled: boolean; onClick: () => void; shortcut: string;
}> = ({ label, active, disabled, onClick, shortcut }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center justify-between rounded border px-2 py-1.5 text-xs font-medium transition-all ${
      active
        ? 'border-[hsl(45,100%,60%)] bg-[hsl(45,100%,60%,0.2)] text-[hsl(45,100%,70%)]'
        : disabled
          ? 'border-border/10 bg-muted/10 text-muted-foreground/30 cursor-not-allowed'
          : 'border-border/30 bg-muted/30 text-foreground hover:border-[hsl(210,60%,50%)] hover:bg-[hsl(210,60%,50%,0.1)]'
    }`}
  >
    <span>{label}</span>
    <kbd className="rounded bg-muted/30 px-1 text-[9px] text-muted-foreground">{shortcut}</kbd>
  </button>
);

export default TacticalHUD;
