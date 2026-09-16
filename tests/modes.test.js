import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarSeed, mulberry32, dailyPattern, proceduralPattern, endlessParameters } from '../js/modes.js';

test('modes.js daily formations are deterministic, bounded and navigable', () => {
  assert.equal(calendarSeed(new Date(2026, 8, 16, 23, 59)), 20260916);
  assert.equal(mulberry32(20260916)(), mulberry32(20260916)());
  const shapes = new Set();
  for (let day = 1; day <= 31; day++) {
    const seed = 20261000 + day;
    const pattern = dailyPattern(seed);
    assert.deepEqual(pattern, dailyPattern(seed));
    const text = pattern.join('');
    assert.equal(pattern.length, 7);
    assert.ok(pattern.every(row => row.length === 10 && /^[#.AO]+$/.test(row)));
    assert.equal([...text].filter(c => c === 'O').length, 2);
    const count = [...text].filter(c => c === '#' || c === 'A').length;
    assert.ok(count >= 30 && count <= 44);
    assert.ok(text.includes('A'));
    // Open vertical approach either side of the single portal row. Every row
    // has an 18px gap to the next (ball diameter 14px), so there is no sealed void.
    assert.ok(pattern.every(row => row.slice(4, 6) === '..' || row.slice(4, 6) === 'OO'));
    shapes.add(text);
  }
  assert.ok(shapes.size > 25);
});

test('modes.js endless density, compounded speed, safety cap and bosses', () => {
  for (let index = 0; index < 100; index++) {
    const params = endlessParameters(index, 549);
    assert.equal(params.bricks, Math.min(56, 46 + index * 2));
    assert.equal(params.speed, Math.min(900, 549 * 1.03 ** (index + 1)));
    assert.equal(params.boss, (index + 1) % 3 === 0);
    const pattern = proceduralPattern(1234 + index, params.bricks).join('');
    assert.equal([...pattern].filter(c => c === '#' || c === 'A').length, params.bricks);
    assert.equal([...pattern].filter(c => c === 'O').length, 2);
  }
});
