import { describe, it, expect } from 'vitest';
import { deltaToFacing } from '@/engine/sprites';

describe('deltaToFacing', () => {
  it('returns south for (0, 0)', () => {
    expect(deltaToFacing(0, 0)).toBe('south');
  });

  it('returns south for (0, 1)', () => {
    expect(deltaToFacing(0, 1)).toBe('south');
  });

  it('returns north for (0, -1)', () => {
    expect(deltaToFacing(0, -1)).toBe('north');
  });

  it('returns east for (1, 0)', () => {
    expect(deltaToFacing(1, 0)).toBe('east');
  });

  it('returns west for (-1, 0)', () => {
    expect(deltaToFacing(-1, 0)).toBe('west');
  });

  it('returns south-east for (1, 1)', () => {
    expect(deltaToFacing(1, 1)).toBe('south-east');
  });

  it('returns south-west for (-1, 1)', () => {
    expect(deltaToFacing(-1, 1)).toBe('south-west');
  });

  it('returns north-east for (1, -1)', () => {
    expect(deltaToFacing(1, -1)).toBe('north-east');
  });

  it('returns north-west for (-1, -1)', () => {
    expect(deltaToFacing(-1, -1)).toBe('north-west');
  });
});
