import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as modes from '../js/modes.js';

// Exercise the shipping engine without exposing test controls in the browser.
function engine() {
  const elements = new Map();
  const drawing = new Proxy({}, { get: (target, key) => target[key] ?? (() => {}) });
  const element = () => ({
    style: {}, children: [], classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, replaceChildren() {}, append() {}, focus() {}, addEventListener() {},
    getContext: () => drawing,
    parentElement: { setAttribute() {} },
  });
  const context = vm.createContext({
    ...modes, structuredClone,
    document: {
      getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      createElement: element, createTextNode: (text) => text,
      querySelector: () => ({ value: 'normal' }), addEventListener() {},
    },
    window: { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {}, requestAnimationFrame() {} },
    localStorage: { getItem: () => null, setItem() {} },
    performance: { now: () => 0 },
  });
  vm.runInContext(readFileSync(new URL('../js/main.js', import.meta.url), 'utf8').replace(/^import .*;\n/, ''), context);
  return (code) => vm.runInContext(code, context);
}

test('main.js combo scoring caps at x5; armor chips remain neutral', () => {
  const run = engine();
  run('startMission(); launch();');
  for (let hit = 1; hit <= 7; hit++) {
    run('hitBrick(bricks.find(b => b.alive));');
    assert.equal(run('comboMultiplier()'), Math.min(hit, 5));
  }
  assert.equal(run('score'), 250);
  run('sector = 4; makeBricks(); hitBrick(bricks.find(b => b.maxHp === 2));');
  assert.equal(run('combo'), 7);
  assert.equal(run('score'), 250);
});

test('main.js paddle contact and final life loss reset combo', () => {
  const run = engine();
  run('startMission(); launch(); combo = 4; balls = [{ x: paddle.x, y: paddle.y - 8, vx: 0, vy: 360, trail: [] }]; update(STEP);');
  assert.equal(run('combo'), 0);
  assert.equal(run('comboMultiplier()'), 1);
  run('combo = 5; lives = 1; loseLife();');
  assert.equal(run('combo'), 0);
  assert.equal(run('state'), 'gameover');
});

test('main.js field drift moves portals and collision bodies together at 0.15Hz', () => {
  const run = engine();
  run('startMission(); sector = 5; makeBricks(); launch(); updateFieldDrift(1 / (4 * FIELD_DRIFT_HZ));');
  assert.ok(Math.abs(run('bricks[0].x - bricks[0].baseX') - 20) < 1e-9);
  assert.ok(Math.abs(run('portals[0].x - portals[0].baseX') - 20) < 1e-9);
  assert.equal(run('bounceBrick({ x: bricks[0].x + bricks[0].w + 6, y: bricks[0].y + 11, vx: -100, vy: 50 }, bricks[0])'), true);
  run('spawnBoss(); updateFieldDrift(1);');
  assert.equal(run('boss.x'), run('boss.baseX'));
});

test('main.js drift freezes when paused or effects off; early sectors stay still', () => {
  const run = engine();
  run('startMission(); launch(); updateFieldDrift(1);');
  assert.equal(run('fieldDriftPhase'), 0);
  run('sector = 5; makeBricks(); updateFieldDrift(1);');
  const x = run('bricks[0].x');
  const phase = run('fieldDriftPhase');
  run('togglePause(); update(1);');
  assert.equal(run('bricks[0].x'), x);
  run('togglePause(); applyEffects(false); updateFieldDrift(1);');
  assert.equal(run('bricks[0].x'), x);
  assert.equal(run('fieldDriftPhase'), phase);
  run('applyEffects(true); updateFieldDrift(STEP);');
  assert.notEqual(run('bricks[0].x'), x);
  run('makeBricks();');
  assert.equal(run('fieldDriftPhase'), 0);
});

test('main.js combo rail draws at reset and capped chain without exceptions', () => {
  const run = engine();
  run('startMission(); drawComboRail(); combo = 8; drawComboRail(); draw();');
  assert.equal(run('comboMultiplier()'), 5);
});
