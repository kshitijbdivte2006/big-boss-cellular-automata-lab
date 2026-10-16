export const DEFAULT_WIDTH = 80;
export const DEFAULT_HEIGHT = 80;
export const MIN_SIZE = 10;
export const MAX_SIZE = 200;
export const DEFAULT_RULE = "B3/S23";

export type Rule = {
  birth: boolean[];
  survive: boolean[];
  notation: string;
};

export type PatternJson = {
  width: number;
  height: number;
  rule: string;
  wrap: boolean;
  cells: number[][];
};

export type NamedPattern = {
  id: string;
  label: string;
  cells: ReadonlyArray<readonly [number, number]>;
};

function emptyFlags(): boolean[] {
  return [false, false, false, false, false, false, false, false, false];
}

function digitsToFlags(digits: string): boolean[] | null {
  const flags = emptyFlags();
  const seen = new Set<string>();
  for (const ch of digits) {
    if (ch < "0" || ch > "8") return null;
    if (seen.has(ch)) return null;
    seen.add(ch);
    flags[Number(ch)] = true;
  }
  return flags;
}

function flagsToDigits(flags: boolean[]): string {
  let out = "";
  for (let n = 0; n < 9; n++) {
    if (flags[n]) out += String(n);
  }
  return out;
}

export function parseRule(input: string): { ok: true; rule: Rule } | { ok: false; error: string } {
  const trimmed = input.trim().toUpperCase().replace(/\s+/g, "");
  const match = /^B([0-8]*)\/S([0-8]*)$/.exec(trimmed);
  if (!match) {
    return {
      ok: false,
      error: "Use B/S notation like B3/S23. Birth digits, then a slash, then survive digits (0–8).",
    };
  }
  const birth = digitsToFlags(match[1]);
  const survive = digitsToFlags(match[2]);
  if (!birth || !survive) {
    return {
      ok: false,
      error: "Each digit 0–8 can appear at most once on each side of the rule.",
    };
  }
  const notation = `B${flagsToDigits(birth)}/S${flagsToDigits(survive)}`;
  return { ok: true, rule: { birth, survive, notation } };
}

export function createBuffers(width: number, height: number): {
  current: Uint8Array;
  next: Uint8Array;
} {
  const size = width * height;
  return {
    current: new Uint8Array(size),
    next: new Uint8Array(size),
  };
}

export function clampSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_WIDTH;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(n)));
}

export function indexOf(x: number, y: number, width: number): number {
  return y * width + x;
}

export function countPopulation(grid: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < grid.length; i++) {
    n += grid[i];
  }
  return n;
}

function neighborCount(
  grid: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  wrap: boolean,
): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      let nx = x + dx;
      let ny = y + dy;
      if (wrap) {
        nx = ((nx % width) + width) % width;
        ny = ((ny % height) + height) % height;
      } else if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      n += grid[indexOf(nx, ny, width)];
    }
  }
  return n;
}

/** Writes the next generation into `next`. Never mutates `current`. Returns live count. */
export function stepLife(
  current: Uint8Array,
  next: Uint8Array,
  width: number,
  height: number,
  rule: Rule,
  wrap: boolean,
): number {
  let population = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = indexOf(x, y, width);
      const alive = current[i] === 1;
      const n = neighborCount(current, width, height, x, y, wrap);
      const stays = alive ? rule.survive[n] : rule.birth[n];
      const v = stays ? 1 : 0;
      next[i] = v;
      population += v;
    }
  }
  return population;
}

export function clearGrid(grid: Uint8Array): void {
  grid.fill(0);
}

export function randomiseGrid(grid: Uint8Array, density = 0.28): void {
  for (let i = 0; i < grid.length; i++) {
    grid[i] = Math.random() < density ? 1 : 0;
  }
}

export function patternBounds(cells: ReadonlyArray<readonly [number, number]>): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of cells) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

export function placePattern(
  grid: Uint8Array,
  width: number,
  height: number,
  cells: ReadonlyArray<readonly [number, number]>,
  originX: number,
  originY: number,
  wrap: boolean,
): void {
  const b = patternBounds(cells);
  const ox = originX - Math.floor(b.width / 2) - b.minX;
  const oy = originY - Math.floor(b.height / 2) - b.minY;
  for (const [x, y] of cells) {
    let nx = x + ox;
    let ny = y + oy;
    if (wrap) {
      nx = ((nx % width) + width) % width;
      ny = ((ny % height) + height) % height;
    } else if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
      continue;
    }
    grid[indexOf(nx, ny, width)] = 1;
  }
}

export function setCellLine(
  grid: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  value: 0 | 1,
): void {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    if (x >= 0 && y >= 0 && x < width && y < height) {
      grid[indexOf(x, y, width)] = value;
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

export function liveCells(grid: Uint8Array, width: number): number[][] {
  const cells: number[][] = [];
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === 1) {
      cells.push([i % width, Math.floor(i / width)]);
    }
  }
  return cells;
}

export function applyPatternJson(
  grid: Uint8Array,
  width: number,
  height: number,
  data: PatternJson,
): void {
  clearGrid(grid);
  for (const cell of data.cells) {
    if (!Array.isArray(cell) || cell.length < 2) continue;
    const x = cell[0];
    const y = cell[1];
    if (x >= 0 && y >= 0 && x < width && y < height) {
      grid[indexOf(x, y, width)] = 1;
    }
  }
}

export function parsePatternJson(raw: string): { ok: true; data: PatternJson } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Pattern JSON must be an object with cells, width, and height." };
  }
  const obj = parsed as Record<string, unknown>;
  const width = Number(obj.width);
  const height = Number(obj.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    return { ok: false, error: "Pattern JSON needs integer width and height of at least 1." };
  }
  if (!Array.isArray(obj.cells)) {
    return { ok: false, error: "Pattern JSON needs a cells array of [x, y] pairs." };
  }
  const cells: number[][] = [];
  for (const item of obj.cells) {
    if (!Array.isArray(item) || item.length < 2) {
      return { ok: false, error: "Each cell must be an [x, y] pair of integers." };
    }
    const x = item[0];
    const y = item[1];
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      return { ok: false, error: "Each cell must be an [x, y] pair of integers." };
    }
    cells.push([x, y]);
  }
  const rule = typeof obj.rule === "string" ? obj.rule : DEFAULT_RULE;
  const wrap = Boolean(obj.wrap);
  return { ok: true, data: { width, height, rule, wrap, cells } };
}

export function toPatternJson(
  grid: Uint8Array,
  width: number,
  height: number,
  rule: string,
  wrap: boolean,
): PatternJson {
  return {
    width,
    height,
    rule,
    wrap,
    cells: liveCells(grid, width),
  };
}

export const PRESETS: NamedPattern[] = [
  {
    id: "glider",
    label: "Glider",
    cells: [
      [1, 0],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ],
  },
  {
    id: "blinker",
    label: "Blinker",
    cells: [
      [0, 1],
      [1, 1],
      [2, 1],
    ],
  },
  {
    id: "pulsar",
    label: "Pulsar",
    cells: [
      [2, 0],
      [3, 0],
      [4, 0],
      [8, 0],
      [9, 0],
      [10, 0],
      [0, 2],
      [5, 2],
      [7, 2],
      [12, 2],
      [0, 3],
      [5, 3],
      [7, 3],
      [12, 3],
      [0, 4],
      [5, 4],
      [7, 4],
      [12, 4],
      [2, 5],
      [3, 5],
      [4, 5],
      [8, 5],
      [9, 5],
      [10, 5],
      [2, 7],
      [3, 7],
      [4, 7],
      [8, 7],
      [9, 7],
      [10, 7],
      [0, 8],
      [5, 8],
      [7, 8],
      [12, 8],
      [0, 9],
      [5, 9],
      [7, 9],
      [12, 9],
      [0, 10],
      [5, 10],
      [7, 10],
      [12, 10],
      [2, 12],
      [3, 12],
      [4, 12],
      [8, 12],
      [9, 12],
      [10, 12],
    ],
  },
  {
    id: "glider-gun",
    label: "Glider gun",
    cells: [
      [0, 4],
      [0, 5],
      [1, 4],
      [1, 5],
      [10, 4],
      [10, 5],
      [10, 6],
      [11, 3],
      [11, 7],
      [12, 2],
      [12, 8],
      [13, 2],
      [13, 8],
      [14, 5],
      [15, 3],
      [15, 7],
      [16, 4],
      [16, 5],
      [16, 6],
      [17, 5],
      [20, 2],
      [20, 3],
      [20, 4],
      [21, 2],
      [21, 3],
      [21, 4],
      [22, 1],
      [22, 5],
      [24, 0],
      [24, 1],
      [24, 5],
      [24, 6],
      [34, 2],
      [34, 3],
      [35, 2],
      [35, 3],
    ],
  },
];
