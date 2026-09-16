import { calendarSeed, dailyPattern, proceduralPattern, endlessParameters } from './modes.js';

// Space Breaks: fixed-step simulation in an 800 × 680 logical playfield.
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const WIDTH = 800;
const HEIGHT = 680;
const STEP = 1 / 120;
const BALL_RADIUS = 7;
const PALETTE = ['#75dfd4', '#59b9c9', '#ecba73', '#e88977'];
const SECTORS = [
  ['First contact', 'Every great voyage begins with breaking a few things.'],
  ['Orbital drift', 'Find your angle. Let the orbit do the rest.'],
  ['The scattered belt', 'Open a path through the debris.'],
  ['Solar crossing', 'A warmer welcome. A little more speed.'],
  ['Deep field', 'The gaps are smaller out here.'],
  ['Signal cascade', 'Get above the belt and keep the chain alive.'],
  ['Event horizon', 'One last stretch of uncharted space.'],
  ['Homeward bound', 'Clear the final belt. Bring it home.'],
];
const POWER_COLORS = { W: '#5ee0bd', M: '#f4c16e', S: '#f28f83', P: '#c4a1ef', L: '#87cdf4', T: '#bbdc85' };
const POWER_TYPES = Object.keys(POWER_COLORS);
// # is a one-hit tile; A is a two-hit armored tile; O is an indestructible wormhole,
// always placed as an exactly-two-per-pattern pair with both portals in open lanes.
// Two-column openings and 18px row lanes leave room for the 14px ball, including
// inside the open ring and fortress.
const BRICK_PATTERNS = [
  // Full belt: a simple, uninterrupted opening formation (30).
  ['##########', '##########', '##########'],
  // Checkerboard: alternating pairs with open horizontal flight lanes (30).
  ['##..##..##', '..##..##..', '##..##..##', '..##..##..', '##..##..##', '..##..##..'],
  // Diamond: a broad center tapering to two-tile tips (32).
  ['....##....', '..######..', '.########.', '.########.', '..######..', '....##....'],
  // Gates: twin towers flank a generous central approach (34 + portal pair).
  ['##O....O##', '###....###', '###....###', '###....###', '###....###', '###....###'],
  // Pyramid: stepped shoulders over a three-row foundation, portal pair at the apex (34).
  ['....OO....', '...####...', '..A####A..', '.########.', '.A######A.', '.########.'],
  // Open ring: perimeter belt, portal pair inside the courtyard, entrance below (38).
  ['A###AA###A', '##......##', 'A#......#A', '##O....O##', 'A#......#A', '##......##', '####..####'],
  // Drifting lanes: three diagonal bands sweep across the field, portals mid-band (40).
  ['A####A....', '..#O##O#..', '....A####A', '..######..', 'A####A....', '..######..', '....A####A'],
  // Fortress: reinforced corners around a courtyard open to space above (44 + portal pair).
  ['AA##..##AA', '####..####', 'A##....##A', '##O....O##', 'A###..###A', '##A####A##'],
];
// Boss asteroid phases close sectors 3 and 6 (1-indexed).
const BOSS_SECTORS = [2, 5];
const keys = new Set();
const touchDirections = new Map();
let canvasTouch = null;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let effects = !reducedMotion.matches;
$('effects').checked = effects;
let state = 'ready';
let missionStarted = false;
let sector = 0;
let mode = 'campaign';
let dailySeed = calendarSeed();
let endlessSeed = 0;
let campaignSnapshot = null;
let dailyAllTimeBest = 0;
let score = 0;
let lives = 3;
let best = 0;
let difficulty = 'normal';
let baseSpeed = 360;
let bricks = [];
let portals = [];
let boss = null;
let bossDefeated = false;
let initialBrickCount = 0;
let balls = [];
let drops = [];
let particles = [];
let combo = 0;
const COMBO_CAP = 5;
const FIELD_DRIFT_AMPLITUDE = 20;
const FIELD_DRIFT_HZ = 0.15;
let fieldDriftPhase = 0;
let shield = false;
let wideTime = 0;
let piercingTime = 0;
let slowTime = 0;
let stickyTime = 0;
let shake = 0;
let noticeTime = 0;
let elapsed = 0;
let pausedFrom = 'playing';
let soundEnabled = false;
let audio = null;
let dpr = 1;
// Response is a natural period, not a fixed animation duration. All re-targets
// retain the live velocity; only a new mission resets the spring.
const PADDLE_RESPONSE = 0.3;
const paddle = { x: WIDTH / 2, y: HEIGHT - 54, w: 112, h: 13,
  target: WIDTH / 2, velocity: 0, damping: 1, edge: 0, edgeVelocity: 0 };
const feedback = { press: 0, pressVelocity: 0, score: 0, scoreVelocity: 0,
  combo: 0, comboVelocity: 0, shownScore: 0 };
const pressedPointers = new Set();
function springStep(value, velocity, target, dt, damping = 1, response = PADDLE_RESPONSE) {
  const omega = 2 * Math.PI / response;
  velocity += (omega * omega * (target - value) - 2 * damping * omega * velocity) * dt;
  return [value + velocity * dt, velocity];
}
function paddleBounds() { return [paddle.w / 2 + 8, WIDTH - paddle.w / 2 - 8]; }
function targetPaddle(x) { paddle.target = x; paddle.damping = 1; }
function updatePaddle(dt) {
  const [min, max] = paddleBounds();
  const target = clamp(paddle.target, min, max);
  const overshoot = paddle.target - target;
  // Rubber-band only the presentation; the collision body never leaves the field.
  const edge = (overshoot * 8 * 0.55) / (8 + 0.55 * Math.abs(overshoot));
  if (!effects || reducedMotion.matches) {
    paddle.x = target; paddle.velocity = paddle.edge = paddle.edgeVelocity = 0;
    return;
  }
  [paddle.x, paddle.velocity] = springStep(paddle.x, paddle.velocity, target, dt, paddle.damping);
  paddle.x = clamp(paddle.x, min, max);
  if ((paddle.x === min && paddle.velocity < 0) || (paddle.x === max && paddle.velocity > 0)) paddle.velocity = 0;
  [paddle.edge, paddle.edgeVelocity] = springStep(paddle.edge, paddle.edgeVelocity, edge, dt);
  paddle.edge = clamp(paddle.edge, -8, 8);
}
function updateFeedback(dt) {
  const press = active() && (pressedPointers.size || touchDirections.size || keys.has(' ') ||
    keys.has('arrowleft') || keys.has('arrowright') || keys.has('a') || keys.has('d')) ? 1 : 0;
  if (!effects || reducedMotion.matches) {
    feedback.press = press; feedback.score = 0; feedback.combo = Math.min(combo, COMBO_CAP);
    feedback.pressVelocity = feedback.scoreVelocity = feedback.comboVelocity = 0;
  } else {
    [feedback.press, feedback.pressVelocity] = springStep(feedback.press, feedback.pressVelocity, press, dt, 1, 0.15);
    [feedback.score, feedback.scoreVelocity] = springStep(feedback.score, feedback.scoreVelocity, 0, dt);
    [feedback.combo, feedback.comboVelocity] = springStep(feedback.combo, feedback.comboVelocity, Math.min(combo, COMBO_CAP), dt);
  }
  $('score').style.transform = `scale(${1 + Math.min(0.1, Math.max(0, feedback.score))})`;
  $('score').style.opacity = press && !effects ? '0.85' : '1';
}
const stars = Array.from({ length: 95 }, () => ({
  x: Math.random() * WIDTH, y: Math.random() * HEIGHT,
  size: 0.5 + Math.random() * 1.2, depth: 0.3 + Math.random() * 0.7,
}));
try {
  const stored = Number(localStorage.getItem('space-breaks-best'));
  best = Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;
} catch { /* Private browsing may disable storage; the game remains playable. */ }

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const speed = () => mode === 'endless'
  ? endlessParameters(sector, Math.min(650, baseSpeed + 7 * 27)).speed
  : mode === 'daily' ? 360 : Math.min(650, baseSpeed + sector * 27);
const hasBossSector = () => mode === 'campaign' ? BOSS_SECTORS.includes(sector)
  : mode === 'endless' && endlessParameters(sector, baseSpeed).boss;
const clearState = () => mode === 'daily' || (mode === 'campaign' && sector === 7) ? 'win' : 'cleared';
const dateLabel = (seed) => String(seed).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
const bestKey = () => mode === 'daily' ? `sb_daily_best_${dailySeed}`
  : mode === 'endless' ? 'sb_endless_best' : 'space-breaks-best';
function readBest(key) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch { return 0; }
}
function sectorTitle() {
  return mode === 'daily' ? `Daily sector · ${dateLabel(dailySeed)}`
    : mode === 'endless' ? `Endless drift · ${sector + 1}` : SECTORS[sector][0];
}
const active = () => missionStarted && (state === 'ready' || state === 'playing');
const formatted = (value) => String(value).padStart(6, '0');
// Armor chips are neutral; only destroyed bricks advance the scoring chain.
const comboMultiplier = () => clamp(combo, 1, COMBO_CAP);

function announce(message) {
  $('announcement').textContent = message;
  $('announcement').hidden = false;
  $('announcement').classList.add('visible');
  $('live-status').textContent = message;
  noticeTime = 2.6;
}

function saveBest() {
  if (score <= best) return;
  best = score;
  try { localStorage.setItem(bestKey(), String(best)); } catch { /* Optional persistence. */ }
  if (mode === 'daily' && best > dailyAllTimeBest) {
    dailyAllTimeBest = best;
    try { localStorage.setItem('sb_daily_best_all_time', String(best)); } catch { /* Optional persistence. */ }
  }
}

function updateHUD() {
  if (score > feedback.shownScore && effects && !reducedMotion.matches) feedback.scoreVelocity += 1.5;
  feedback.shownScore = score;
  $('score').textContent = formatted(score);
  $('best').textContent = formatted(best);
  $('lives').setAttribute('aria-label', `${lives} ${lives === 1 ? 'life' : 'lives'} remaining`);
  Array.from($('lives').children).forEach((life, index) => {
    life.classList.toggle('lost', index >= lives);
    life.style.opacity = index < lives ? '1' : '0.18';
  });
  $('sector-number').replaceChildren(document.createTextNode(String(sector + 1).padStart(2, '0')));
  const total = document.createElement('span');
  total.textContent = mode === 'campaign' ? '/08' : mode === 'daily' ? '/01' : '/∞';
  $('sector-number').append(total);
  $('sector-name').textContent = sectorTitle();
  $('sector-copy').textContent = mode === 'campaign' ? SECTORS[sector][1]
    : mode === 'daily' ? 'One local-calendar formation. Cruise speed. Three lives.'
      : 'Speed +3% per sector (900 cap). Two more bricks per sector (56 cap). Boss every third sector.';
  $('remaining').textContent = mode === 'campaign' ? `SECTOR ${String(sector + 1).padStart(2, '0')} / 08`
    : mode === 'daily' ? `DAILY · ${dateLabel(dailySeed)}` : `ENDLESS · ${sector + 1}`;
  $('best-label').textContent = mode === 'campaign' ? 'PERSONAL BEST' : mode === 'daily' ? 'DAILY BEST' : 'ENDLESS BEST';
  $('mode-record').hidden = mode !== 'daily';
  $('mode-record').textContent = `All-time daily best: ${formatted(dailyAllTimeBest)}`;
  const bossHits = hasBossSector() ? 6 : 0;
  const remainingBossHits = boss ? boss.hp : bossDefeated ? 0 : bossHits;
  const totalTargets = initialBrickCount + bossHits;
  const cleared = totalTargets ? Math.round(100 * (1 - (bricks.filter((b) => b.alive).length + remainingBossHits) / totalTargets)) : 0;
  $('progress-fill').style.width = `${cleared}%`;
  $('progress-label').textContent = `${cleared}%`;
  $('progress-fill').parentElement.setAttribute('aria-valuenow', String(cleared));
  $('combo').textContent = boss ? `BOSS · ${boss.hp} HITS LEFT`
    : combo > 1 ? `${comboMultiplier()}× CHAIN` : missionStarted ? 'KEEP IT IN ORBIT' : 'AWAITING PILOT';
}

function setState(next) {
  state = next;
  if (!active()) {
    canvasTouch = null;
    pressedPointers.clear();
    paddle.target = paddle.x;
  }
  const isIntro = state === 'ready' && !missionStarted;
  const overlayVisible = isIntro || ['paused', 'cleared', 'gameover', 'win'].includes(state);
  $('overlay').hidden = !overlayVisible;
  // Inline display also works with stylesheets that define .overlay { display: flex }.
  $('overlay').style.display = overlayVisible ? '' : 'none';
  $('difficulty-picker').hidden = mode !== 'campaign' || (!isIntro && state !== 'gameover' && state !== 'win');
  $('daily').hidden = mode !== 'campaign' || !overlayVisible;
  $('daily').textContent = `Daily sector · ${dateLabel(calendarSeed())}`;
  $('endless').hidden = mode !== 'campaign' || state !== 'win';
  $('return-campaign').hidden = mode === 'campaign';
  $('restart').hidden = !['paused', 'cleared'].includes(state);
  $('pause').disabled = !missionStarted || ['cleared', 'gameover', 'win'].includes(state);
  $('pause').textContent = state === 'paused' ? 'Resume' : 'Pause';
  $('launch-hint').hidden = !missionStarted || (state !== 'ready' && !(state === 'playing' && hasStuckBall()));
  $('launch-touch').disabled = !active();
  $('state-label').textContent = {
    ready: missionStarted ? 'READY TO LAUNCH' : 'READY FOR DEPARTURE',
    playing: 'MISSION IN PROGRESS', paused: 'FLIGHT PAUSED', cleared: 'SECTOR CLEARED',
    gameover: 'SIGNAL LOST', win: 'MISSION COMPLETE',
  }[state];
  const overlays = {
    paused: ['Take a breather.', boss
      ? `Boss encounter paused. ${boss.hp} hits remain. Your orbit is waiting.`
      : 'Your orbit is waiting right here.', 'Resume mission'],
    cleared: ['A little clearer.', bossDefeated
      ? `Sector ${sector + 1} cleared. The boss is dust. On to the next belt.`
      : `Sector ${sector + 1} cleared. On to the next belt.`, 'Next sector'],
    gameover: ['Lost in space.', `Final score: ${score.toLocaleString()}. There is always another orbit.`, 'Try again'],
    win: ['Space, made.', `All 8 sectors cleared. Final score: ${score.toLocaleString()}.`, 'Play again'],
  };
  if (mode === 'daily') {
    overlays.win = ['Daily sector cleared.', `${dateLabel(dailySeed)} · Score: ${score.toLocaleString()}. All-time daily best: ${dailyAllTimeBest.toLocaleString()}.`, 'Replay daily'];
    overlays.gameover[2] = 'Retry daily';
  } else if (mode === 'endless') {
    overlays.cleared = ['Keep drifting.', `Endless sector ${sector + 1} cleared. Score: ${score.toLocaleString()}.`, 'Next sector'];
    overlays.gameover[2] = 'Retry endless';
  }
  if (overlays[state]) {
    const [title, copy, action] = overlays[state];
    $('overlay-title').textContent = title;
    $('overlay-copy').textContent = copy;
    $('primary').textContent = action;
    $('overlay-hint').textContent = state === 'paused' ? 'P / ESC TO RESUME' : mode === 'daily' ? 'DAILY SECTOR · CRUISE · 3 LIVES'
      : mode === 'endless' ? 'ENDLESS DRIFT · 3 LIVES' : '8 SECTORS · 3 LIVES · ONE MORE TRY';
  }
  if (overlayVisible && !isIntro) {
    $('primary').focus({ preventScroll: true });
    $('live-status').textContent = $('overlay-copy').textContent;
  }
  updateHUD();
}

function makeBricks() {
  bricks = [];
  portals = [];
  boss = null;
  bossDefeated = false;
  fieldDriftPhase = 0;
  const pattern = mode === 'daily' ? dailyPattern(dailySeed)
    : mode === 'endless' ? proceduralPattern((endlessSeed + sector) >>> 0, endlessParameters(sector, baseSpeed).bricks)
      : BRICK_PATTERNS[sector];
  const rows = pattern.length;
  const gap = 8;
  const width = 62;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < pattern[row].length; col++) {
      const tile = pattern[row][col];
      const x = 54 + col * (width + gap);
      const y = 92 + row * 40;
      if (tile === 'O') {
        portals.push({ x, baseX: x, y, w: width, h: 22, alive: true });
        continue;
      }
      if (tile !== '#' && tile !== 'A') continue;
      const hp = tile === 'A' ? 2 : 1;
      bricks.push({ x, baseX: x, y,
        w: width, h: 22, color: PALETTE[(rows - row - 1) % PALETTE.length],
        hp, maxHp: hp, alive: true });
    }
  }
  // Progress tracks destructible tiles only; portals never block a clear.
  initialBrickCount = bricks.length;
}

function spawnBoss() {
  boss = { baseX: (WIDTH - 202) / 2, x: (WIDTH - 202) / 2, y: 250, w: 202, h: 55,
    hp: 6, maxHp: 6, drift: 118, phase: 0, crackStage: 0 };
  playSound('boss');
  announce('Boss asteroid ahead · 6 hits to break it');
  updateHUD();
}

function hitBoss() {
  boss.hp--;
  burst(boss.x + boss.w / 2, boss.y + boss.h / 2, '#d9a066', 10);
  shake = effects ? 6 : 0;
  const stage = Math.ceil((boss.maxHp - boss.hp) / 2);
  if (boss.hp <= 0) {
    score += 100;
    saveBest();
    burst(boss.x + boss.w / 2, boss.y + boss.h / 2, '#e88977', 40);
    shake = effects ? 12 : 0;
    boss = null;
    bossDefeated = true;
    playSound('win');
    announce('Boss asteroid destroyed · +100');
    drops = [];
    setState(clearState());
  } else {
    if (stage > boss.crackStage) {
      boss.crackStage = stage;
      announce(`Boss cracking · ${boss.hp} hits left`);
    }
    playSound('boss');
  }
  updateHUD();
}

function sectorCleared() { return !bricks.some((item) => item.alive) && !boss; }

function resetPaddle() {
  canvasTouch = null;
  paddle.x = WIDTH / 2;
  paddle.w = 112;
  paddle.target = paddle.x;
  paddle.velocity = paddle.edge = paddle.edgeVelocity = 0;
  paddle.damping = 1;
  pressedPointers.clear();
  wideTime = 0;
  piercingTime = 0;
  slowTime = 0;
  stickyTime = 0;
  shield = false;
  drops = [];
  combo = 0;
  balls = [{ x: paddle.x, y: paddle.y - BALL_RADIUS - 2, vx: 0, vy: 0, trail: [] }];
}

function startMission() {
  if (mode === 'campaign') {
    difficulty = document.querySelector('input[name="difficulty"]:checked')?.value || 'normal';
    baseSpeed = { relaxed: 285, normal: 360, fast: 440 }[difficulty] || 360;
  }
  if (mode === 'daily') {
    dailySeed = calendarSeed();
    dailyAllTimeBest = readBest('sb_daily_best_all_time');
  }
  best = readBest(bestKey());
  score = 0;
  lives = 3;
  sector = 0;
  missionStarted = true;
  particles = [];
  shake = 0;
  keys.clear();
  touchDirections.clear();
  makeBricks();
  resetPaddle();
  setState('ready');
  announce(`${sectorTitle()}. Launch when ready.`);
  canvas.focus({ preventScroll: true });
}

// Keep the campaign graph intact while a side run owns the live simulation.
function enterSideRun(nextMode) {
  if (mode !== 'campaign' || (nextMode === 'endless' && state !== 'win')) return;
  campaignSnapshot = structuredClone({ state, pausedFrom, missionStarted, sector, score, lives, best,
    difficulty, baseSpeed, bricks, portals, boss, bossDefeated, initialBrickCount, balls, drops,
    particles, combo, fieldDriftPhase, shield, wideTime, piercingTime, slowTime, stickyTime,
    shake, noticeTime, elapsed, paddle,
    announcement: $('announcement').textContent, overlayHint: $('overlay-hint').textContent,
    overlayTitle: $('overlay-title').innerHTML, overlayCopy: $('overlay-copy').innerHTML,
    primaryLabel: $('primary').innerHTML });
  mode = nextMode;
  endlessSeed = Math.floor(Math.random() * 4294967296);
  startMission();
}

function returnToCampaign() {
  if (!campaignSnapshot) return;
  const saved = campaignSnapshot;
  ({ state, pausedFrom, missionStarted, sector, score, lives, best, difficulty, baseSpeed,
    bricks, portals, boss, bossDefeated, initialBrickCount, balls, drops, particles, combo,
    fieldDriftPhase, shield, wideTime, piercingTime, slowTime, stickyTime, shake, noticeTime,
    elapsed } = saved);
  Object.assign(paddle, saved.paddle);
  mode = 'campaign';
  campaignSnapshot = null;
  canvasTouch = null;
  keys.clear();
  touchDirections.clear();
  $('announcement').textContent = saved.announcement;
  $('announcement').hidden = noticeTime <= 0;
  $('announcement').classList.toggle('visible', noticeTime > 0);
  $('overlay-hint').textContent = saved.overlayHint;
  $('overlay-title').innerHTML = saved.overlayTitle;
  $('overlay-copy').innerHTML = saved.overlayCopy;
  $('primary').innerHTML = saved.primaryLabel;
  setState(state);
}

function hasStuckBall() { return balls.some((ball) => ball.stuck); }

function launch() {
  if (!missionStarted) { startMission(); return; }
  if (state === 'playing' && hasStuckBall()) {
    for (const ball of balls.filter((item) => item.stuck)) {
      const angle = ball.stickPoint * Math.PI / 3;
      ball.x = paddle.x + ball.stickPoint * (paddle.w / 2 - BALL_RADIUS);
      ball.y = paddle.y - BALL_RADIUS - 0.1;
      ball.vx = Math.sin(angle) * ball.stickSpeed;
      ball.vy = -Math.cos(angle) * ball.stickSpeed;
      ball.stuck = false;
    }
    $('launch-hint').hidden = true;
    playSound('launch');
    return;
  }
  if (state !== 'ready') return;
  const ball = balls[0];
  ball.vx = speed() * 0.28;
  ball.vy = -Math.sqrt(speed() ** 2 - ball.vx ** 2);
  setState('playing');
  playSound('launch');
}

function primaryAction() {
  if (state === 'paused') { togglePause(); return; }
  if (state === 'cleared') {
    sector++;
    makeBricks();
    resetPaddle();
    particles = [];
    setState('ready');
    announce(sectorTitle()
      + (hasBossSector() ? ' · boss asteroid ahead' : ''));
    canvas.focus({ preventScroll: true });
    return;
  }
  startMission();
}

function togglePause() {
  if (state === 'paused') {
    setState(pausedFrom);
    canvas.focus({ preventScroll: true });
  } else if (active()) {
    pausedFrom = state;
    keys.clear();
    touchDirections.clear();
    setState('paused');
  }
}

function loseLife() {
  lives--;
  combo = 0;
  playSound('lose');
  burst(paddle.x, paddle.y, '#e88977', 28);
  shake = effects ? 9 : 0;
  if (lives === 0) {
    saveBest();
    setState('gameover');
  } else {
    resetPaddle();
    setState('ready');
    announce(`${lives} ${lives === 1 ? 'life' : 'lives'} left. Launch when ready.`);
  }
}

function playSound(kind) {
  if (!soundEnabled) return;
  try {
    if (!audio) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) { soundEnabled = false; updateSoundButton(); return; }
      audio = new AudioContext();
    }
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    // The pitch keeps rising beyond the score cap, approaching a safe upper bound.
    const chainPitch = 1 + 1.5 * (1 - Math.exp(-Math.max(0, combo - 1) / 8));
    const tones = { launch: [260, 620, 0.13], brick: [590 * chainPitch, 220 * chainPitch, 0.07],
      armor: [310, 140, 0.1], boss: [150, 80, 0.28], portal: [700, 240, 0.16],
      paddle: [180, 350, 0.08], lose: [220, 55, 0.38], win: [440, 880, 0.4], power: [330, 990, 0.24] };
    const [from, to, duration] = tones[kind];
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = kind === 'lose' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(from, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(to, audio.currentTime + duration);
    gain.gain.setValueAtTime(0.065, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  } catch { soundEnabled = false; updateSoundButton(); }
}

function updateSoundButton() {
  $('sound').textContent = soundEnabled ? 'Sound on' : 'Sound off';
  $('sound').setAttribute('aria-pressed', String(soundEnabled));
}
function toggleSound() {
  soundEnabled = !soundEnabled;
  updateSoundButton();
  if (soundEnabled) playSound('paddle');
  else if (audio?.state === 'running') audio.suspend().catch(() => {});
}

function burst(x, y, color, count = 14) {
  if (!effects) return;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = 35 + Math.random() * 145;
    particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
      life: 0.3 + Math.random() * 0.4, maxLife: 0.7, color });
  }
  if (particles.length > 350) particles.splice(0, particles.length - 350);
}

function collectPower(type) {
  if (type === 'W') {
    wideTime = 12;
    paddle.w = 174;
    paddle.x = clamp(paddle.x, paddle.w / 2 + 8, WIDTH - paddle.w / 2 - 8);
    announce('Wide beam active · 12 seconds');
  } else if (type === 'S') {
    shield = true;
    announce('Safety net armed · one rescue');
  } else if (type === 'P') {
    piercingTime = 8;
    announce('Piercing shot active · 8 seconds');
  } else if (type === 'L') {
    slowTime = 8;
    announce('Slow field active · 8 seconds');
  } else if (type === 'T') {
    stickyTime = 12;
    announce('Sticky paddle armed · next catch within 12 seconds');
  } else if (type === 'M') {
    const source = balls.find((ball) => !ball.stuck) || balls[0];
    if (source) {
      const currentSpeed = source.stuck ? source.stickSpeed : Math.hypot(source.vx, source.vy);
      const angle = source.stuck ? -Math.PI / 2 : Math.atan2(source.vy, source.vx);
      for (const turn of [-0.45, 0.45]) {
        if (balls.length >= 5) break;
        let vx = Math.cos(angle + turn) * currentSpeed;
        let vy = Math.sin(angle + turn) * currentSpeed;
        if (Math.abs(vy) < currentSpeed * 0.3) {
          vy = (vy < 0 ? -1 : 1) * currentSpeed * 0.3;
          vx = (vx < 0 ? -1 : 1) * Math.sqrt(currentSpeed ** 2 - vy ** 2);
        }
        balls.push({ x: source.x, y: source.y, vx, vy, trail: [] });
      }
    }
    announce('Multiball deployed');
  }
  playSound('power');
  burst(paddle.x, paddle.y, POWER_COLORS[type], 22);
}

// Resolve a circle against the nearest point of a rectangle, including side/corner hits.
function bounceBrick(ball, brick) {
  const nearX = clamp(ball.x, brick.x, brick.x + brick.w);
  const nearY = clamp(ball.y, brick.y, brick.y + brick.h);
  let nx = ball.x - nearX;
  let ny = ball.y - nearY;
  let distance = Math.hypot(nx, ny);
  if (distance > BALL_RADIUS) return false;
  if (distance === 0) {
    const faces = [
      { distance: ball.x - brick.x, nx: -1, ny: 0 },
      { distance: brick.x + brick.w - ball.x, nx: 1, ny: 0 },
      { distance: ball.y - brick.y, nx: 0, ny: -1 },
      { distance: brick.y + brick.h - ball.y, nx: 0, ny: 1 },
    ].sort((a, b) => a.distance - b.distance);
    ({ nx, ny } = faces[0]);
    distance = -faces[0].distance;
  } else { nx /= distance; ny /= distance; }
  ball.x += nx * (BALL_RADIUS - distance + 0.1);
  ball.y += ny * (BALL_RADIUS - distance + 0.1);
  const dot = ball.vx * nx + ball.vy * ny;
  if (dot < 0) { ball.vx -= 2 * dot * nx; ball.vy -= 2 * dot * ny; }
  // A nearly horizontal corner reflection can otherwise orbit forever between side walls.
  const velocity = Math.hypot(ball.vx, ball.vy);
  if (Math.abs(ball.vy) < velocity * 0.22) {
    ball.vy = (ball.vy < 0 ? -1 : 1) * velocity * 0.22;
    ball.vx = (ball.vx < 0 ? -1 : 1) * Math.sqrt(velocity ** 2 - ball.vy ** 2);
  }
  return true;
}

function hitBrick(brick) {
  if (--brick.hp > 0) {
    burst(brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color, 6);
    playSound('armor');
    return;
  }
  brick.alive = false;
  combo++;
  score += 10 * comboMultiplier();
  saveBest();
  burst(brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color);
  shake = effects ? Math.min(4, 1 + combo * 0.25) : 0;
  playSound('brick');
  if (Math.random() < 0.16) {
    drops.push({ x: brick.x + brick.w / 2, y: brick.y + brick.h / 2,
      type: POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)] });
  }
  updateHUD();
  if (!sectorCleared()) return;
  if (hasBossSector() && !boss && !bossDefeated) { spawnBoss(); return; }
  playSound('win');
  drops = [];
  setState(clearState());
}

function updateFieldDrift(dt) {
  if (state !== 'playing' || (mode === 'campaign' && sector < 5) || !effects) return;
  fieldDriftPhase = (fieldDriftPhase + dt * Math.PI * 2 * FIELD_DRIFT_HZ) % (Math.PI * 2);
  const offset = Math.sin(fieldDriftPhase) * FIELD_DRIFT_AMPLITUDE;
  // Render and collision share these positions; portals stay in their formation lanes.
  for (const tile of bricks) tile.x = tile.baseX + offset;
  for (const portal of portals) portal.x = portal.baseX + offset;
}

function update(dt) {
  if (state === 'paused') return;
  updateFeedback(dt);
  // Power duration uses real simulation seconds; slow motion never changes STEP.
  const timerDt = dt;
  dt *= slowTime > 0 && active() ? 0.5 : 1;
  elapsed += dt;
  if (effects) {
    for (const star of stars) star.y = (star.y + dt * 11 * star.depth) % HEIGHT;
    for (const particle of particles) {
      particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
    shake = Math.max(0, shake - dt * 24);
  }
  if (noticeTime > 0) {
    noticeTime -= timerDt;
    if (noticeTime <= 0) {
      $('announcement').textContent = '';
      $('announcement').hidden = true;
      $('announcement').classList.remove('visible');
    }
  }
  if (!active()) return;
  piercingTime = Math.max(0, piercingTime - timerDt);
  slowTime = Math.max(0, slowTime - timerDt);
  stickyTime = Math.max(0, stickyTime - timerDt);
  const left = keys.has('arrowleft') || keys.has('a') || [...touchDirections.values()].includes(-1);
  const right = keys.has('arrowright') || keys.has('d') || [...touchDirections.values()].includes(1);
  let glide = 0;
  if (canvasTouch) {
    if (canvasTouch.mode === 'pending' && performance.now() - canvasTouch.startedAt >= 200) {
      canvasTouch.mode = 'hold';
    }
    if (canvasTouch.mode === 'hold') {
      // Stop at the held point instead of oscillating across it each fixed step.
      glide = clamp(canvasTouch.currentX - paddle.target, -650 * dt, 650 * dt);
    }
  }
  const direction = Number(right) - Number(left);
  if (direction || glide) {
    const [min, max] = paddleBounds();
    targetPaddle(clamp(paddle.target + direction * 650 * dt + glide, min - 80, max + 80));
  } else if (!canvasTouch && !pressedPointers.size) {
    paddle.target = clamp(paddle.target, ...paddleBounds());
  }
  updatePaddle(dt);
  if (state === 'ready') {
    balls[0].x = paddle.x;
    balls[0].y = paddle.y - BALL_RADIUS - 2;
    return;
  }
  updateFieldDrift(dt);
  if (wideTime > 0) {
    wideTime -= timerDt;
    if (wideTime <= 0) { paddle.w = 112; announce('Wide beam ended'); }
  }
  if (boss) {
    // Slow sine drift; clamped inside the side walls.
    boss.phase += dt * 0.9;
    boss.x = clamp(boss.baseX + Math.sin(boss.phase) * boss.drift, 12, WIDTH - 12 - boss.w);
  }
  for (const ball of balls) {
    if (ball.stuck) {
      ball.x = paddle.x + ball.stickPoint * (paddle.w / 2 - BALL_RADIUS);
      ball.y = paddle.y - BALL_RADIUS - 0.1;
      continue;
    }
    const previousY = ball.y;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (effects) {
      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 12) ball.trail.shift();
    }
    if (ball.x < BALL_RADIUS + 8) { ball.x = BALL_RADIUS + 8; ball.vx = Math.abs(ball.vx); }
    if (ball.x > WIDTH - BALL_RADIUS - 8) { ball.x = WIDTH - BALL_RADIUS - 8; ball.vx = -Math.abs(ball.vx); }
    if (ball.y < BALL_RADIUS + 8) { ball.y = BALL_RADIUS + 8; ball.vy = Math.abs(ball.vy); }
    if (ball.vy > 0 && previousY + BALL_RADIUS <= paddle.y && ball.y + BALL_RADIUS >= paddle.y
        && ball.x + BALL_RADIUS >= paddle.x - paddle.w / 2 && ball.x - BALL_RADIUS <= paddle.x + paddle.w / 2) {
      const angle = clamp((ball.x - paddle.x) / (paddle.w / 2), -1, 1) * Math.PI / 3;
      const velocity = Math.hypot(ball.vx, ball.vy);
      ball.vx = Math.sin(angle) * velocity;
      ball.vy = -Math.cos(angle) * velocity;
      ball.y = paddle.y - BALL_RADIUS - 0.1;
      if (stickyTime > 0) {
        stickyTime = 0;
        ball.stuck = true;
        ball.stickPoint = clamp((ball.x - paddle.x) / (paddle.w / 2), -1, 1);
        ball.stickSpeed = velocity;
        ball.vx = 0;
        ball.vy = 0;
        ball.trail = [];
        $('launch-hint').hidden = false;
        announce('Ball caught · quick-tap or Space to re-launch');
      }
      combo = 0;
      updateHUD();
      playSound('paddle');
      burst(ball.x, paddle.y, '#75dfd4', 6);
    }
    if (shield && ball.vy > 0 && ball.y + BALL_RADIUS >= HEIGHT - 18) {
      ball.y = HEIGHT - 18 - BALL_RADIUS;
      ball.vy = -Math.abs(ball.vy);
      shield = false;
      announce('Safety net used');
      playSound('paddle');
    }
    // Track overlap even after piercing expires: an armored tile takes one hit per pass.
    ball.brickContacts ??= new Set();
    for (const brick of bricks) {
      const overlaps = brick.alive && Math.hypot(
        ball.x - clamp(ball.x, brick.x, brick.x + brick.w),
        ball.y - clamp(ball.y, brick.y, brick.y + brick.h)) <= BALL_RADIUS;
      if (!overlaps) { ball.brickContacts.delete(brick); continue; }
      if (ball.brickContacts.has(brick)) continue;
      if (piercingTime > 0) {
        ball.brickContacts.add(brick);
        hitBrick(brick);
      } else if (bounceBrick(ball, brick)) {
        hitBrick(brick);
        break;
      }
      if (state !== 'playing') break;
    }
    if (state !== 'playing') return;
    // Wormholes: entering one portal of a pair exits the other, speed preserved,
    // velocity mirrored across the portal's horizontal axis. Contact sets keep a
    // ball from re-teleporting while it drifts out of the exit portal.
    ball.portalContacts ??= new Set();
    for (const portal of portals) {
      const overlaps = Math.hypot(
        ball.x - clamp(ball.x, portal.x, portal.x + portal.w),
        ball.y - clamp(ball.y, portal.y, portal.y + portal.h)) <= BALL_RADIUS;
      if (!overlaps) { ball.portalContacts.delete(portal); continue; }
      if (ball.portalContacts.has(portal) || portals.length < 2) continue;
      const exit = portals.find((item) => item !== portal);
      ball.portalContacts.add(portal);
      ball.portalContacts.add(exit);
      ball.vy = -ball.vy;
      ball.x = exit.x + exit.w / 2;
      ball.y = exit.y + exit.h / 2 + (ball.vy < 0 ? -1 : 1) * (exit.h / 2 + BALL_RADIUS + 2);
      ball.trail = [];
      playSound('portal');
      burst(exit.x + exit.w / 2, exit.y + exit.h / 2, '#9d8cf0', 12);
    }
    // The boss bounces like a brick body but takes one damage tick per pass,
    // even while piercing is active.
    if (boss) {
      ball.bossContacts ??= new Set();
      const overlaps = Math.hypot(
        ball.x - clamp(ball.x, boss.x, boss.x + boss.w),
        ball.y - clamp(ball.y, boss.y, boss.y + boss.h)) <= BALL_RADIUS;
      if (!overlaps) {
        ball.bossContacts.delete(boss);
      } else if (!ball.bossContacts.has(boss)) {
        ball.bossContacts.add(boss);
        bounceBrick(ball, boss);
        hitBoss();
      }
      if (state !== 'playing') return;
    }
    if (state !== 'playing') return;
  }
  balls = balls.filter((ball) => ball.y - BALL_RADIUS <= HEIGHT);
  if (!balls.length) { loseLife(); return; }
  for (const drop of drops) {
    drop.y += 110 * dt;
    if (drop.y + 12 >= paddle.y && drop.y - 12 <= paddle.y + paddle.h
        && Math.abs(drop.x - paddle.x) <= paddle.w / 2 + 12) {
      collectPower(drop.type);
      drop.caught = true;
    }
  }
  drops = drops.filter((drop) => !drop.caught && drop.y < HEIGHT + 16);
}

function roundedRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

// Same 24-unit geometry as assets/icons/*.svg, scaled within the capsule.
function drawPowerIcon(type, x, y) {
  ctx.save();
  ctx.translate(x - 9, y - 9);
  ctx.scale(0.75, 0.75);
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (type === 'W') {
    ctx.moveTo(3, 5); ctx.lineTo(3, 19);
    ctx.moveTo(21, 5); ctx.lineTo(21, 19);
    ctx.moveTo(6, 12); ctx.lineTo(18, 12);
    ctx.moveTo(9, 9); ctx.lineTo(6, 12); ctx.lineTo(9, 15);
    ctx.moveTo(15, 9); ctx.lineTo(18, 12); ctx.lineTo(15, 15);
  } else if (type === 'M') {
    ctx.moveTo(12, 9); ctx.lineTo(12, 12);
    ctx.moveTo(5, 15); ctx.lineTo(5, 12); ctx.lineTo(19, 12); ctx.lineTo(19, 15);
    ctx.moveTo(12, 12); ctx.lineTo(12, 15);
    for (const [cx, cy, radius] of [[12, 5, 3], [5, 18, 2.5], [12, 18, 2.5], [19, 18, 2.5]]) {
      ctx.moveTo(cx + radius, cy); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    }
  } else if (type === 'P') {
    ctx.moveTo(3, 12); ctx.lineTo(21, 12);
    ctx.moveTo(16, 7); ctx.lineTo(21, 12); ctx.lineTo(16, 17);
    ctx.moveTo(10, 4); ctx.lineTo(10, 8);
    ctx.moveTo(10, 16); ctx.lineTo(10, 20);
  } else if (type === 'L') {
    ctx.moveTo(21, 12); ctx.arc(12, 12, 9, 0, Math.PI * 2);
    ctx.moveTo(12, 6); ctx.lineTo(12, 12); ctx.lineTo(8, 15);
  } else if (type === 'T') {
    ctx.moveTo(5, 15); ctx.lineTo(5, 20); ctx.lineTo(19, 20); ctx.lineTo(19, 15);
    ctx.moveTo(16, 7); ctx.arc(12, 7, 4, 0, Math.PI * 2);
    ctx.moveTo(12, 13); ctx.lineTo(12, 16);
    ctx.moveTo(10, 14); ctx.lineTo(12, 16); ctx.lineTo(14, 14);
  } else if (type === 'S') {
    ctx.moveTo(12, 2); ctx.lineTo(20, 5); ctx.lineTo(20, 11);
    ctx.bezierCurveTo(20, 16, 16, 20, 12, 22);
    ctx.bezierCurveTo(8, 20, 4, 16, 4, 11);
    ctx.lineTo(4, 5); ctx.closePath();
    ctx.moveTo(12, 7); ctx.lineTo(13.5, 10.5); ctx.lineTo(17, 12);
    ctx.lineTo(13.5, 13.5); ctx.lineTo(12, 17); ctx.lineTo(10.5, 13.5);
    ctx.lineTo(7, 12); ctx.lineTo(10.5, 10.5); ctx.closePath();
  }
  ctx.stroke();
  ctx.restore();
}

function drawComboRail() {
  if (!missionStarted) return;
  ctx.save();
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  const radius = 23;
  const centerY = paddle.y - 31;
  for (let segment = 0; segment < COMBO_CAP; segment++) {
    const start = Math.PI + segment * Math.PI / COMBO_CAP + 0.07;
    const end = Math.PI + (segment + 1) * Math.PI / COMBO_CAP - 0.07;
    ctx.strokeStyle = '#274950';
    ctx.beginPath();
    ctx.arc(paddle.x, centerY, radius, start, end);
    ctx.stroke();
    const fill = clamp(feedback.combo - segment, 0, 1);
    if (!fill) continue;
    ctx.strokeStyle = '#75dfd4';
    ctx.beginPath();
    ctx.arc(paddle.x, centerY, radius, start, start + (end - start) * fill);
    ctx.stroke();
  }
  ctx.fillStyle = '#eefaf6';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`×${comboMultiplier()}`, paddle.x, centerY - 5);
  ctx.restore();
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#090e14';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.save();
  if (effects && shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  for (const star of stars) {
    ctx.globalAlpha = star.depth * 0.65;
    ctx.fillStyle = '#afcbd5';
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#14242c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(8, 48); ctx.lineTo(8, HEIGHT - 22);
  ctx.moveTo(WIDTH - 8, 48); ctx.lineTo(WIDTH - 8, HEIGHT - 22);
  ctx.stroke();
  ctx.globalAlpha = missionStarted ? 1 : 0.3;
  for (const brick of bricks) {
    if (!brick.alive) continue;
    ctx.fillStyle = brick.color;
    roundedRect(brick.x, brick.y, brick.w, brick.h, 4);
    ctx.fill();
    ctx.fillStyle = '#f0fbff';
    ctx.globalAlpha = missionStarted ? 0.22 : 0.08;
    ctx.fillRect(brick.x + 5, brick.y + 3, brick.w - 10, 2);
    ctx.globalAlpha = missionStarted ? 1 : 0.3;
    if (brick.maxHp === 2) {
      ctx.strokeStyle = '#26343d'; ctx.lineWidth = 1.8;
      if (brick.hp === 2) {
        roundedRect(brick.x + 3, brick.y + 3, brick.w - 6, brick.h - 6, 2);
      } else {
        ctx.beginPath();
        ctx.moveTo(brick.x + 29, brick.y);
        ctx.lineTo(brick.x + 24, brick.y + 8);
        ctx.lineTo(brick.x + 35, brick.y + 13);
        ctx.lineTo(brick.x + 29, brick.y + brick.h);
        ctx.moveTo(brick.x + 35, brick.y + 13);
        ctx.lineTo(brick.x + 45, brick.y + 8);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  if (shield) {
    ctx.strokeStyle = '#ecba73'; ctx.lineWidth = 3;
    ctx.setLineDash([10, 6]);
    ctx.beginPath(); ctx.moveTo(15, HEIGHT - 18); ctx.lineTo(WIDTH - 15, HEIGHT - 18); ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const portal of portals) {
    ctx.save();
    ctx.translate(portal.x + portal.w / 2, portal.y + portal.h / 2);
    ctx.fillStyle = '#241b33';
    roundedRect(-portal.w / 2, -portal.h / 2, portal.w, portal.h, 11);
    ctx.fill();
    ctx.strokeStyle = '#9d8cf0';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Twin counter-rotating swirl arcs mark the wormhole pair.
    for (const dir of [1, -1]) {
      const start = effects ? dir * elapsed * 2.4 : dir * Math.PI / 3;
      ctx.beginPath();
      ctx.arc(0, 0, dir > 0 ? 8 : 4.5, start, start + Math.PI * 1.2);
      ctx.stroke();
    }
    ctx.fillStyle = '#e6d6ff';
    ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  if (boss) {
    const stage = Math.ceil((boss.maxHp - boss.hp) / 2);
    ctx.fillStyle = '#5d6f7a';
    ctx.beginPath();
    for (const [index, [x, y]] of [[0.06, 0], [0.36, 0.03], [0.7, 0], [0.94, 0.05],
      [1, 0.3], [0.97, 0.77], [0.89, 1], [0.55, 0.95], [0.25, 1], [0.03, 0.88], [0, 0.3]].entries()) {
      if (index === 0) ctx.moveTo(boss.x + x * boss.w, boss.y + y * boss.h);
      else ctx.lineTo(boss.x + x * boss.w, boss.y + y * boss.h);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#8fb3c0'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(240, 251, 255, 0.14)';
    ctx.fillRect(boss.x + 10, boss.y + 5, boss.w - 20, 3);
    // Jagged cracks deepen per stage (three stages across six hits).
    ctx.strokeStyle = '#10191f'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (stage >= 1) {
      ctx.moveTo(boss.x + boss.w * 0.3, boss.y);
      ctx.lineTo(boss.x + boss.w * 0.26, boss.y + boss.h * 0.5);
      ctx.lineTo(boss.x + boss.w * 0.34, boss.y + boss.h);
    }
    if (stage >= 2) {
      ctx.moveTo(boss.x + boss.w * 0.56, boss.y);
      ctx.lineTo(boss.x + boss.w * 0.62, boss.y + boss.h * 0.45);
      ctx.lineTo(boss.x + boss.w * 0.52, boss.y + boss.h);
    }
    if (stage >= 3) {
      ctx.moveTo(boss.x + boss.w * 0.78, boss.y);
      ctx.lineTo(boss.x + boss.w * 0.74, boss.y + boss.h * 0.4);
      ctx.lineTo(boss.x + boss.w * 0.84, boss.y + boss.h * 0.7);
      ctx.moveTo(boss.x + boss.w * 0.84, boss.y + boss.h * 0.7);
      ctx.lineTo(boss.x + boss.w * 0.9, boss.y + boss.h);
    }
    ctx.stroke();
    for (let i = 0; i < boss.maxHp; i++) {
      ctx.fillStyle = i < boss.hp ? '#e88977' : '#26343d';
      ctx.fillRect(boss.x + boss.w / 2 - (boss.maxHp * 10) / 2 + i * 10, boss.y - 10, 8, 4);
    }
  }
  for (const drop of drops) {
    ctx.fillStyle = '#172a32';
    ctx.strokeStyle = POWER_COLORS[drop.type];
    ctx.lineWidth = 1;
    roundedRect(drop.x - 13, drop.y - 12, 26, 24, 6); ctx.fill(); ctx.stroke();
    drawPowerIcon(drop.type, drop.x, drop.y);
  }
  ctx.save();
  ctx.translate(paddle.edge, 0);
  // Press and launch anticipation remain visual: no collision size/position changes.
  ctx.fillStyle = feedback.press > 0.05 ? '#c2fff0'
    : stickyTime > 0 || hasStuckBall() ? POWER_COLORS.T : '#75dfd4';
  roundedRect(paddle.x - paddle.w / 2, paddle.y, paddle.w, paddle.h, 6); ctx.fill();
  ctx.fillStyle = '#c2fff0';
  roundedRect(paddle.x - paddle.w / 2 + 8, paddle.y + 2, paddle.w - 16, 3, 1); ctx.fill();
  ctx.fillStyle = '#274950';
  ctx.fillRect(paddle.x - 15, paddle.y + 7, 30, 3);
  if (wideTime > 0) {
    ctx.fillStyle = '#ecba73';
    ctx.fillRect(paddle.x - paddle.w / 2, paddle.y + 19, paddle.w * wideTime / 12, 2);
  }
  for (const [index, [time, duration, type]] of [[piercingTime, 8, 'P'], [slowTime, 8, 'L'], [stickyTime, 12, 'T']].entries()) {
    if (time <= 0) continue;
    ctx.fillStyle = POWER_COLORS[type];
    ctx.fillRect(paddle.x - paddle.w / 2, paddle.y + 23 + index * 4, paddle.w * time / duration, 2);
  }
  if (feedback.press > 0.01 && (state === 'ready' || hasStuckBall())) {
    ctx.globalAlpha = feedback.press * 0.65;
    ctx.strokeStyle = '#c2fff0'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(paddle.x, paddle.y - BALL_RADIUS - 2, BALL_RADIUS + 5, Math.PI, Math.PI * 2);
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  drawComboRail();
  ctx.restore();
  for (const ball of balls) {
    ctx.save();
    if (effects && piercingTime > 0) {
      ctx.shadowColor = POWER_COLORS.P;
      ctx.shadowBlur = 14;
    }
    if (effects) ball.trail.forEach((point, index) => {
      ctx.globalAlpha = (index / ball.trail.length) * 0.2;
      ctx.fillStyle = piercingTime > 0 ? POWER_COLORS.P : '#75dfd4'; ctx.beginPath();
      ctx.arc(point.x, point.y, BALL_RADIUS * index / ball.trail.length, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = piercingTime > 0 ? POWER_COLORS.P : '#eefaf6'; ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  for (const particle of particles) {
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x - 1.5, particle.y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(WIDTH * dpr);
  canvas.height = Math.round(HEIGHT * dpr);
  // CSS sizes the canvas; physics never changes with layout or pixel density.
  canvas.style.width = '100%';
  canvas.style.height = 'auto';
  canvas.style.aspectRatio = `${WIDTH} / ${HEIGHT}`;
  draw();
}

function pointerSteer(event) {
  if (!active()) return;
  const bounds = canvas.getBoundingClientRect();
  targetPaddle((event.clientX - bounds.left) * WIDTH / bounds.width);
}
canvas.style.touchAction = 'none';
function touchX(event) {
  const bounds = canvas.getBoundingClientRect();
  return (event.clientX - bounds.left) * WIDTH / bounds.width;
}
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch') {
    if (!active() || canvasTouch?.pointerId !== event.pointerId) return;
    const touch = canvasTouch;
    touch.currentX = touchX(event);
    const now = performance.now();
    touch.history.push({ x: touch.currentX, time: now });
    touch.history = touch.history.filter((sample) => now - sample.time <= 100);
    touch.maxDisplacement = Math.max(touch.maxDisplacement, Math.abs(touch.currentX - touch.anchorX));
    if (touch.mode !== 'drag' && touch.maxDisplacement >= 12) {
      if (touch.mode === 'hold') {
        // A hold has moved the paddle: start a fresh relative grab without snapping back.
        touch.anchorX = touch.currentX;
        touch.paddleX = paddle.x;
      }
      touch.mode = 'drag';
    }
    if (touch.mode === 'drag') {
      targetPaddle(touch.paddleX + touch.currentX - touch.anchorX);
    }
    return;
  }
  if (event.pointerType === 'mouse' || canvas.hasPointerCapture(event.pointerId)) pointerSteer(event);
});
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !active()) return;
  if (event.pointerType === 'touch' && canvasTouch) return;
  event.preventDefault();
  canvas.focus({ preventScroll: true });
  canvas.setPointerCapture(event.pointerId);
  pressedPointers.add(event.pointerId);
  if (event.pointerType === 'touch') {
    const x = touchX(event);
    targetPaddle(paddle.x);
    canvasTouch = { pointerId: event.pointerId, anchorX: x, currentX: x,
      paddleX: paddle.x, startedAt: performance.now(), maxDisplacement: 0,
      history: [{ x, time: performance.now() }],
      mode: 'pending', readyAtDown: state === 'ready' || hasStuckBall() };
    return;
  }
  pointerSteer(event);
  // Launch from the live paddle, never from an unrendered target.
  if (state === 'ready') balls[0].x = paddle.x;
  if (state === 'ready' || hasStuckBall()) launch();
});
function releaseCanvasTouch(event) {
  pressedPointers.delete(event.pointerId);
  if (canvasTouch?.pointerId !== event.pointerId) {
    paddle.target = clamp(paddle.target, ...paddleBounds());
    return;
  }
  const touch = canvasTouch;
  canvasTouch = null;
  paddle.target = clamp(paddle.target, ...paddleBounds());
  if (event.type === 'pointerup' && touch.mode === 'drag' && effects && !reducedMotion.matches) {
    const recent = touch.history.filter((sample) => performance.now() - sample.time <= 100);
    if (recent.length >= 2) {
      const first = recent[0], last = recent[recent.length - 1];
      const velocity = (last.x - first.x) / Math.max(0.001, (last.time - first.time) / 1000);
      if (Math.abs(velocity) > 80) {
        paddle.velocity = velocity;
        paddle.damping = 0.8;
        // 0.99 is the skill's snappy projection, rather than scroll's long 0.998 coast.
        paddle.target = clamp(paddle.x + velocity / 1000 * 0.99 / (1 - 0.99), ...paddleBounds());
      }
    }
  }
  // Holds win at 200ms; cancellation and lost capture must never launch a ball.
  if (event.type === 'pointerup' && active() && (state === 'ready' || hasStuckBall()) && touch.readyAtDown
      && touch.mode === 'pending' && performance.now() - touch.startedAt < 200
      && Math.max(touch.maxDisplacement, Math.abs(touchX(event) - touch.anchorX)) < 10) {
    if (state === 'ready') balls[0].x = paddle.x;
    launch();
  }
}
canvas.addEventListener('pointerup', releaseCanvasTouch);
canvas.addEventListener('pointercancel', releaseCanvasTouch);
canvas.addEventListener('lostpointercapture', releaseCanvasTouch);
for (const [id, direction] of [['left', -1], ['right', 1]]) {
  const button = $(id);
  button.style.touchAction = 'none';
  button.addEventListener('pointerdown', (event) => {
    if (!active()) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    touchDirections.set(event.pointerId, direction);
  });
  const release = (event) => {
    touchDirections.delete(event.pointerId);
    if (!touchDirections.size) paddle.target = clamp(paddle.target, ...paddleBounds());
  };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
}
$('launch-touch').addEventListener('pointerdown', (event) => pressedPointers.add(event.pointerId));
window.addEventListener('pointerup', (event) => pressedPointers.delete(event.pointerId));
window.addEventListener('pointercancel', (event) => pressedPointers.delete(event.pointerId));
$('launch-touch').addEventListener('click', launch);
$('primary').addEventListener('click', primaryAction);
$('restart').addEventListener('click', startMission);
$('daily').addEventListener('click', () => enterSideRun('daily'));
$('endless').addEventListener('click', () => enterSideRun('endless'));
$('return-campaign').addEventListener('click', returnToCampaign);
$('pause').addEventListener('click', togglePause);
$('sound').addEventListener('click', toggleSound);
function applyEffects(enabled) {
  effects = enabled && !reducedMotion.matches;
  $('effects').checked = effects;
  $('arena').classList.toggle('quiet-effects', !effects);
  if (!effects) { particles = []; shake = 0; for (const ball of balls) ball.trail = []; }
}
$('effects').addEventListener('change', (event) => applyEffects(event.target.checked));
reducedMotion.addEventListener('change', (event) => { if (event.matches) applyEffects(false); });
window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  const control = event.target.closest?.('button, input, select, textarea, a');
  // Native Space/arrow behavior on focused controls takes priority over game shortcuts.
  if (control && (key === ' ' || key.startsWith('arrow') || control.matches('input, select, textarea'))) return;
  if (['arrowleft', 'arrowright', 'a', 'd', ' ', 'p', 'escape', 'm'].includes(key)) event.preventDefault();
  if (['arrowleft', 'arrowright', 'a', 'd', ' '].includes(key)) keys.add(key);
  if (event.repeat) return;
  if (key === ' ') launch();
  if (key === 'p' || key === 'escape') togglePause();
  if (key === 'm') toggleSound();
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
function suspend() {
  canvasTouch = null;
  pressedPointers.clear();
  keys.clear(); touchDirections.clear();
  if (active()) togglePause();
}
window.addEventListener('blur', suspend);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });
window.addEventListener('resize', resize);

let previousTime = null;
let accumulator = 0;
function frame(time) {
  if (previousTime === null) previousTime = time;
  accumulator += Math.min((time - previousTime) / 1000, 0.05);
  previousTime = time;
  while (accumulator >= STEP) { update(STEP); accumulator -= STEP; }
  draw();
  window.requestAnimationFrame(frame);
}
makeBricks();
resetPaddle();
setState('ready');
resize();
window.requestAnimationFrame(frame);
