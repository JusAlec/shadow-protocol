

# Animation Performance Fix Plan

## Root Cause Analysis

The animations are laggy due to several architectural issues:

1. **React state-driven animation loop**: The `TacticalMap` re-renders the **entire 144-tile SVG grid** on every animation frame via `setTick(t => t + 1)` (line 112). Each `requestAnimationFrame` triggers a full React reconciliation of ~200+ SVG elements just to update a few animated positions.

2. **`Date.now()` in render**: `CombatEffects` and `getUnitRenderPos` call `Date.now()` during render to compute progress. This is non-deterministic and forces constant re-computation, but more critically it means animation values are only correct at the moment of render -- if React batches or delays, animations stutter.

3. **Screen shake uses random values in render**: `Math.random()` in the shake transform (line 120) produces a new random offset every render, causing jitter rather than smooth shake. Combined with React's render timing, this looks choppy.

4. **No memoization of static grid**: The 144 tile `<g>` elements are recreated every frame even though most tiles don't change between frames. Only animated units and effects need per-frame updates.

## Fixes

### 1. Separate static grid from animated overlay
- Memoize the grid tiles layer with `useMemo` keyed on `grid`, `squadVisibility`, `movementRange`, `attackRange`, `hoveredTile`, `activeUnitId`, and `selectedAction`. This prevents re-rendering 144 tiles on every animation frame.
- Keep units and effects in a non-memoized layer that updates per-frame.

### 2. Use `requestAnimationFrame` properly with a ref-based animation loop
- Replace the `setTick` pattern with a proper rAF loop that stores the current timestamp in a `useRef` and only calls `setState` when animations are actually running.
- Pass a stable `frameTime` to `getUnitRenderPos` and `CombatEffects` instead of calling `Date.now()` repeatedly.

### 3. Fix screen shake with a deterministic shake curve
- Replace `Math.random()` with a sine-based shake function using elapsed time, producing smooth oscillation instead of random jitter.
- Use CSS `transform` with `will-change: transform` for GPU compositing.

### 4. Use SVG `<animate>` for damage numbers instead of React re-renders
- Damage numbers float upward and fade out -- this is a perfect fit for SVG `<animate>` or `<animateTransform>` elements which run on the browser's compositor thread without React involvement.
- Already partially done for the damage flash ring (lines 218-223 use `<animate>`), just extend the pattern.

### 5. Minor optimizations
- Add `React.memo` to `CombatEffects` component.
- Move the `colors` constant in `CombatEffects` outside the component (it's recreated every render for every explosion).

## Implementation Order

1. Extract and memoize static grid tiles into a separate `React.memo` sub-component
2. Refactor animation loop: single rAF loop with ref-based timestamp, only re-render the units/effects layer
3. Replace random screen shake with deterministic sine-wave shake
4. Convert damage number float/fade to SVG `<animate>` elements
5. Memoize `CombatEffects`, hoist static data outside render

