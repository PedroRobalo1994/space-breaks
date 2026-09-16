// Procedural formations share the campaign's 62×22 tiles and 18px flight lanes.
export const ENDLESS_BRICK_CAP = 56;
export const ENDLESS_SPEED_CAP = 900;

export function calendarSeed(date = new Date()) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

export function mulberry32(seed) {
  return () => {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function endlessParameters(index, campaignSpeed) {
  return {
    bricks: Math.min(ENDLESS_BRICK_CAP, 46 + index * 2),
    speed: Math.min(ENDLESS_SPEED_CAP, campaignSpeed * 1.03 ** (index + 1)),
    boss: (index + 1) % 3 === 0,
  };
}

export function proceduralPattern(seed, count) {
  const random = mulberry32(seed);
  const grid = Array.from({ length: 7 }, () => Array(10).fill('.'));
  // Keep a two-column approach open. Portals occupy just one row of that lane;
  // their vertical exits have 18px clearance and never face an adjacent tile.
  const portalRow = 1 + Math.floor(random() * 5);
  grid[portalRow][4] = grid[portalRow][5] = 'O';
  const cells = [];
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 10; col++) {
      if (col !== 4 && col !== 5) cells.push([row, col]);
    }
  }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  cells.slice(0, count).forEach(([row, col], index) => {
    grid[row][col] = index % 5 === 0 ? 'A' : '#';
  });
  return grid.map((row) => row.join(''));
}

export function dailyPattern(seed) {
  const count = 30 + Math.floor(mulberry32(seed)() * 15);
  return proceduralPattern(seed, count);
}
