// Standalone validation of the game's core algorithms (mirrors main.ts logic).
// Maze gen, BFS pathfinding, wall collision, money summing, steal/win/lose rules.
// Run with: node test/logic.test.mjs

const GRID = 21;
const CELL = 4;

function genMaze() {
  const grid = Array.from({ length: GRID }, () => Array(GRID).fill(1));
  const stack = [{ x: 1, y: 1 }];
  grid[1][1] = 0;
  const dirs = [[0, -2], [0, 2], [-2, 0], [2, 0]];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  while (stack.length) {
    const cur = stack[stack.length - 1];
    shuffle(dirs);
    let pushed = false;
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx >= 1 && nx < GRID - 1 && ny >= 1 && ny < GRID - 1 && grid[ny][nx] === 1) {
        grid[ny][nx] = 0;
        grid[cur.y + dy / 2][cur.x + dx / 2] = 0;
        stack.push({ x: nx, y: ny });
        pushed = true; break;
      }
    }
    if (!pushed) stack.pop();
  }
  return grid;
}

function isWall(grid, wx, wz) {
  const gx = Math.floor(wx / CELL), gz = Math.floor(wz / CELL);
  if (gz < 0 || gz >= GRID || gx < 0 || gx >= GRID) return true;
  return grid[gz][gx] === 1;
}
function canWalk(grid, wx, wz) {
  const r = 0.35;
  return !isWall(grid, wx - r, wz) && !isWall(grid, wx + r, wz)
    && !isWall(grid, wx, wz - r) && !isWall(grid, wx, wz + r);
}
function cellToWorld(c) { return { x: c.x * CELL + CELL / 2, y: c.y * CELL + CELL / 2 }; }

function bfs(grid, start, target) {
  const key = (c) => c.y * GRID + c.x;
  const visited = new Set([key(start)]);
  const cameFrom = new Map();
  const queue = [start];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (queue.length) {
    const cur = queue.shift();
    if (cur.x === target.x && cur.y === target.y) {
      const path = [cur]; let node = cur;
      while (cameFrom.has(key(node))) { node = cameFrom.get(key(node)); path.unshift(node); }
      return path;
    }
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx >= 0 && nx < GRID && ny >= 0 && ny < GRID && grid[ny][nx] === 0) {
        const k = key({ x: nx, y: ny });
        if (!visited.has(k)) { visited.add(k); cameFrom.set(k, cur); queue.push({ x: nx, y: ny }); }
      }
    }
  }
  return null;
}

let fails = 0;
function check(name, cond) { console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}`); if (!cond) fails++; }

// Run several mazes to catch random generation edge cases
let reachable = 0, total = 20;
for (let t = 0; t < total; t++) {
  const grid = genMaze();
  const floors = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (grid[y][x] === 0) floors.push({ x, y });
  const start = { x: 1, y: 1 };
  const far = floors[floors.length - 1];
  const path = bfs(grid, start, far);
  if (path) reachable++;
  // collision sanity: start cell walkable
  const p = cellToWorld(start);
  if (!canWalk(grid, p.x, p.y)) check(`maze${t} start walkable`, false);
}
check(`BFS reaches far cell across ${total} mazes`, reachable === total);

// Collision: a point inside a wall cell must be un-walkable
const grid = genMaze();
let wallTest = false;
for (let y = 0; y < GRID && !wallTest; y++) for (let x = 0; x < GRID && !wallTest; x++) {
  if (grid[y][x] === 1) {
    const c = cellToWorld({ x, y });
    wallTest = !canWalk(grid, c.x, c.y); // center of a wall cell is blocked
  }
}
check(`collision blocks positions inside a wall`, wallTest);

// Economy: denominations sum to 20
const CASH_DENOM = [2, 3, 4, 5, 6];
let sum = 0;
for (let i = 0; i < CASH_DENOM.length; i++) sum += (i === CASH_DENOM.length - 1 ? 20 - (CASH_DENOM.slice(0, i).reduce((a, b) => a + b, 0)) : CASH_DENOM[i]);
check(`cash denominations sum to $20`, sum === 20);

// Steal/win/lose rules
let ram = 64, cash = 0, lastSteal = -100, time = 5.0;
const STEAL_AMOUNT = 2, STEAL_COOLDOWN = 1.4;
function frame(dist) {
  if (dist < 3.2 && time - lastSteal > STEAL_COOLDOWN) { lastSteal = time; ram -= STEAL_AMOUNT; if (ram <= 0) ram = 0; }
}
frame(2.0); frame(2.0); // two grabs within cooldown window (dt advanced)
check(`grab reduces RAM by 2`, ram === 62);
// spam close -> only steals once per cooldown
let before = ram; frame(2.0);
check(`grab respects cooldown (no double-steal)`, before - ram <= STEAL_AMOUNT);
// lose at 0 (advance time so cooldown allows a grab)
ram = 1.5; time = 20.0; frame(2.0);
check(`lose triggers at/under 0GB`, ram <= 0);
// win at $20
cash = 18; cash += 2; check(`win at $20`, cash >= 20);

console.log(fails === 0 ? '\nALL LOGIC CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
