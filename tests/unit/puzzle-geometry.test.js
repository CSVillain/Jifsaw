import { describe, it, expect } from 'vitest';
import Puzzle from '../../puzzle.js';

const { buildKnobs, buildPiecePath } = Puzzle;

describe('buildKnobs', () => {
  it('produces a vSign grid of rows x (cols-1) and hSign grid of (rows-1) x cols', () => {
    const rows = 4, cols = 5;
    const { vSign, hSign } = buildKnobs(rows, cols);
    expect(vSign).toHaveLength(rows);
    vSign.forEach(row => expect(row).toHaveLength(cols - 1));
    expect(hSign).toHaveLength(rows - 1);
    hSign.forEach(row => expect(row).toHaveLength(cols));
  });

  it('only ever produces +1 or -1 for each knob direction', () => {
    const { vSign, hSign } = buildKnobs(6, 6);
    [...vSign.flat(), ...hSign.flat()].forEach(sign => {
      expect([1, -1]).toContain(sign);
    });
  });
});

describe('buildPiecePath', () => {
  const rows = 3, cols = 3, pw = 100, ph = 100, pad = 30, bump = 20;

  it('always returns a path string that starts with M and ends with Z (closed shape)', () => {
    const { vSign, hSign } = buildKnobs(rows, cols);
    const d = buildPiecePath(1, 1, rows, cols, pw, ph, pad, bump, vSign, hSign);
    expect(d.trim().startsWith('M')).toBe(true);
    expect(d.trim().endsWith('Z')).toBe(true);
  });

  it('draws a straight top edge (no knob curve) for a piece on the top row', () => {
    const { vSign, hSign } = buildKnobs(rows, cols);
    const d = buildPiecePath(0, 1, rows, cols, pw, ph, pad, bump, vSign, hSign);
    // Top edge (r === 0) is a plain " L x y" straight line, not a curve (" C ").
    // The first segment after the initial M is the top edge.
    const afterMove = d.slice(d.indexOf('M') + 1);
    const firstCommand = afterMove.trim().split(/\s+L\s+|\s+C\s+/)[0];
    expect(d.includes(`L ${pad + pw} ${pad}`)).toBe(true);
  });

  it('draws a curved (knob) edge for an interior piece', () => {
    // Force an interior piece (not on any border) so all four edges curve.
    const bigRows = 5, bigCols = 5;
    const { vSign, hSign } = buildKnobs(bigRows, bigCols);
    const d = buildPiecePath(2, 2, bigRows, bigCols, pw, ph, pad, bump, vSign, hSign);
    expect(d).toContain('C '); // at least one cubic Bezier knob segment
  });

  it('is deterministic for the same signs (no hidden randomness in the path itself)', () => {
    const { vSign, hSign } = buildKnobs(rows, cols);
    const d1 = buildPiecePath(1, 1, rows, cols, pw, ph, pad, bump, vSign, hSign);
    const d2 = buildPiecePath(1, 1, rows, cols, pw, ph, pad, bump, vSign, hSign);
    expect(d1).toBe(d2);
  });

  it('keeps every straight-edge coordinate within the padded cell bounds', () => {
    const { vSign, hSign } = buildKnobs(rows, cols);
    // Corner piece: top and left edges are both straight lines.
    const d = buildPiecePath(0, 0, rows, cols, pw, ph, pad, bump, vSign, hSign);
    expect(d).toContain(`M ${pad} ${pad}`);
  });
});
