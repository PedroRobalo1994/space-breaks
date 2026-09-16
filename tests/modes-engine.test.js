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
  const storage = new Map();
  const context = vm.createContext({
    ...modes, structuredClone,
    document: {
      getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      createElement: element, createTextNode: (text) => text,
      querySelector: () => ({ value: 'normal' }), addEventListener() {},
    },
    window: { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {}, requestAnimationFrame() {} },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    performance: { now: () => 0 },
  });
  vm.runInContext(readFileSync(new URL('../js/main.js', import.meta.url), 'utf8').replace(/^import .*;\n/, ''), context);
  return (code) => vm.runInContext(code, context);
}

test('main.js daily round trip preserves paused campaign graph and independent bests', () => {
  const run = engine();
  run(`startMission(); sector = 5; makeBricks(); launch();
    score = 230; lives = 2; combo = 3; wideTime = 7; paddle.w = 174;
    balls[0].brickContacts = new Set([bricks[0]]); updateFieldDrift(0.5); togglePause();
    globalThis.before = JSON.stringify({ sector, score, lives, combo, wideTime, paddle, bricks, balls });
    enterSideRun('daily');`);
  assert.equal(run('mode'), 'daily');
  assert.equal(run('speed()'), 360);
  assert.equal(run('score'), 0);
  assert.equal(run('lives'), 3);
  assert.equal(run('portals.length'), 2);
  assert.ok(run('[...bricks, ...portals].every(tile => Number.isFinite(tile.baseX))'));
  run('score = 500; saveBest();');
  assert.equal(run('localStorage.getItem(`sb_daily_best_${dailySeed}`)'), '500');
  assert.equal(run("localStorage.getItem('sb_daily_best_all_time')"), '500');
  assert.equal(run("localStorage.getItem('space-breaks-best')"), null);
  run('returnToCampaign();');
  assert.equal(run('state'), 'paused');
  assert.equal(run('pausedFrom'), 'playing');
  assert.equal(run('JSON.stringify({ sector, score, lives, combo, wideTime, paddle, bricks, balls })'), run('before'));
  assert.equal(run('balls[0].brickContacts.has(bricks[0])'), true);
  run('togglePause(); update(STEP);');
  assert.equal(run('state'), 'playing');
});

test('main.js daily clear, retry, final hull loss and intro return', () => {
  const run = engine();
  run(`enterSideRun('daily'); launch(); for (const brick of bricks) while (brick.alive) hitBrick(brick);`);
  assert.equal(run('state'), 'win');
  assert.equal(run('boss'), null);
  assert.equal(run("$('endless').hidden"), true);
  run('primaryAction();');
  assert.equal(run('mode'), 'daily');
  assert.equal(run('score'), 0);
  run('lives = 1; loseLife();');
  assert.equal(run('state'), 'gameover');
  run('returnToCampaign();');
  assert.equal(run('missionStarted'), false);
  assert.equal(run('sector'), 0);
  assert.equal(run("$('overlay').hidden"), false);
});

test('main.js endless gates, progression beyond sector eight, bosses and own best', () => {
  const run = engine();
  run("startMission(); enterSideRun('endless');");
  assert.equal(run('mode'), 'campaign');
  run("sector = 7; score = 800; setState('win'); enterSideRun('endless'); launch();");
  assert.equal(run('score'), 0);
  assert.equal(run('lives'), 3);
  assert.ok(Math.abs(run('speed()') - 565.47) < 1e-8);
  assert.equal(run('bricks.length'), 46);
  for (let index = 0; index < 10; index++) {
    run('for (const brick of bricks) while (brick.alive) hitBrick(brick);');
    assert.equal(run('Boolean(boss)'), (index + 1) % 3 === 0);
    if (run('Boolean(boss)')) run('while (boss) hitBoss();');
    assert.equal(run('state'), 'cleared');
    run('primaryAction(); launch();');
    assert.equal(run('sector'), index + 1);
    assert.equal(run('bricks.length'), Math.min(56, 46 + (index + 1) * 2));
    assert.ok(run('[...bricks, ...portals].every(tile => Number.isFinite(tile.baseX))'));
    run('draw();');
  }
  assert.ok(run("Number(localStorage.getItem('sb_endless_best')) > 0"));
  run('lives = 1; loseLife();');
  assert.equal(run('state'), 'gameover');
  run('returnToCampaign();');
  assert.equal(run('sector'), 7);
  assert.equal(run('score'), 800);
  assert.equal(run('state'), 'win');
});
