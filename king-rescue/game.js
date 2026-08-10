'use strict';

// ==============================
// Constants
// ==============================
const COLS = 7;
const ROWS = 8;
const PRESSURE_MAX = 100;   // 100 = king pinned in danger, 0 = boulders fully pushed back
const TILE_VALUE = 1.6;     // pressure removed per tile cleared
const MOVES_START = 20;
const GAUGE_CIRC = 2 * Math.PI * 27;

const TYPES = [
  { id: 'barrel',  emoji: '🛢️', bg: '#1f5fa8', light: '#5aa8ec' },
  { id: 'clover',  emoji: '🍀', bg: '#237a34', light: '#5cd074' },
  { id: 'crown',   emoji: '👑', bg: '#b8791a', light: '#ffd25c' },
  { id: 'gem',     emoji: '💎', bg: '#a02323', light: '#ff6b6b' },
  { id: 'feather', emoji: '🪶', bg: '#6b6b6b', light: '#e8e8e8' },
  { id: 'shield',  emoji: '🛡️', bg: '#232b3d', light: '#5c6b8a' },
];
const TYPE_MAP = Object.fromEntries(TYPES.map(t => [t.id, t]));

// ==============================
// State
// ==============================
let board = [];
let tileEls = new Map();
let nextId = 0;
let tileSize = 0;

let movesLeft = MOVES_START;
let pressure = PRESSURE_MAX;
let selectedCell = null;
let dragState = null;
let animating = false;
let lastSwapCell = null;

// ==============================
// Utils
// ==============================
function wait(ms) { return new Promise(res => setTimeout(res, ms)); }
function key(r, c) { return r + ',' + c; }
function randomType() { return TYPES[Math.floor(Math.random() * TYPES.length)].id; }
function isAdjacent(r1, c1, r2, c2) { return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1; }
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ==============================
// Board setup
// ==============================
function causesInitialMatch(r, c, type) {
  if (c >= 2 && board[r][c - 1] && board[r][c - 1].type === type &&
      board[r][c - 2] && board[r][c - 2].type === type) return true;
  if (r >= 2 && board[r - 1][c] && board[r - 1][c].type === type &&
      board[r - 2][c] && board[r - 2][c].type === type) return true;
  return false;
}

function initBoard() {
  board = [];
  for (let r = 0; r < ROWS; r++) {
    board.push([]);
    for (let c = 0; c < COLS; c++) {
      let type, tries = 0;
      do {
        type = randomType();
        tries++;
      } while (tries < 20 && causesInitialMatch(r, c, type));
      board[r].push({ id: nextId++, type, bomb: null, r, c });
    }
  }
  if (!hasAnyMove()) reshuffleBoard();
}

function reshuffleBoard() {
  let attempts = 0;
  do {
    const types = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) types.push(board[r][c].type);
    shuffleArray(types);
    let i = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      board[r][c].type = types[i++];
      board[r][c].bomb = null;
    }
    attempts++;
  } while ((findMatchGroups(board).length > 0 || !hasAnyMove()) && attempts < 40);
}

// ==============================
// Match detection
// ==============================
function findMatchGroups(b) {
  const groups = [];
  // horizontal runs
  for (let r = 0; r < ROWS; r++) {
    let c = 0;
    while (c < COLS) {
      const t = b[r][c] && b[r][c].type;
      if (!t) { c++; continue; }
      let c2 = c + 1;
      while (c2 < COLS && b[r][c2] && b[r][c2].type === t) c2++;
      const len = c2 - c;
      if (len >= 3) {
        const cells = [];
        for (let cc = c; cc < c2; cc++) cells.push({ r, c: cc });
        groups.push({ cells, dir: 'h', type: t, len });
      }
      c = c2;
    }
  }
  // vertical runs
  for (let c = 0; c < COLS; c++) {
    let r = 0;
    while (r < ROWS) {
      const t = b[r][c] && b[r][c].type;
      if (!t) { r++; continue; }
      let r2 = r + 1;
      while (r2 < ROWS && b[r2][c] && b[r2][c].type === t) r2++;
      const len = r2 - r;
      if (len >= 3) {
        const cells = [];
        for (let rr = r; rr < r2; rr++) cells.push({ r: rr, c });
        groups.push({ cells, dir: 'v', type: t, len });
      }
      r = r2;
    }
  }
  return groups;
}

function hasAnyMove() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 1 < COLS) {
        swapBoardTiles(r, c, r, c + 1);
        const m = findMatchGroups(board).length > 0;
        swapBoardTiles(r, c, r, c + 1);
        if (m) return true;
      }
      if (r + 1 < ROWS) {
        swapBoardTiles(r, c, r + 1, c);
        const m = findMatchGroups(board).length > 0;
        swapBoardTiles(r, c, r + 1, c);
        if (m) return true;
      }
    }
  }
  return false;
}

function pickAnchor(g) {
  if (lastSwapCell) {
    const hit = g.cells.find(cell => cell.r === lastSwapCell.r && cell.c === lastSwapCell.c);
    if (hit) return hit;
  }
  return g.cells[Math.floor(g.cells.length / 2)];
}

function bombCells(r, c, kind) {
  const cells = [];
  if (kind === 'line-h') {
    for (let cc = 0; cc < COLS; cc++) cells.push({ r, c: cc });
  } else if (kind === 'line-v') {
    for (let rr = 0; rr < ROWS; rr++) cells.push({ r: rr, c });
  } else if (kind === 'mega') {
    for (let rr = r - 1; rr <= r + 1; rr++)
      for (let cc = c - 1; cc <= c + 1; cc++)
        if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) cells.push({ r: rr, c: cc });
  }
  return cells;
}

// ==============================
// Swap / gravity
// ==============================
function swapBoardTiles(r1, c1, r2, c2) {
  const a = board[r1][c1], b = board[r2][c2];
  board[r1][c1] = b; board[r2][c2] = a;
  a.r = r2; a.c = c2;
  b.r = r1; b.c = c1;
}

function applyGravityAndRefill() {
  for (let c = 0; c < COLS; c++) {
    const colTiles = [];
    for (let r = 0; r < ROWS; r++) if (board[r][c]) colTiles.push(board[r][c]);
    const missing = ROWS - colTiles.length;
    const newTiles = [];
    for (let i = 0; i < missing; i++) {
      newTiles.push({ id: nextId++, type: randomType(), bomb: null, r: 0, c });
    }
    const merged = newTiles.concat(colTiles);
    for (let r = 0; r < ROWS; r++) {
      merged[r].r = r;
      merged[r].c = c;
      board[r][c] = merged[r];
    }
    newTiles.forEach((t, i) => { t.spawnRow = i - missing; });
  }
}

// ==============================
// Rendering
// ==============================
function rY(r) { return r * tileSize; }
function cX(c) { return c * tileSize; }

function layout() {
  const wrap = document.getElementById('board-wrap');
  const availWidth = Math.min(wrap.clientWidth, 420);
  tileSize = Math.floor(availWidth / COLS);
  const boardEl = document.getElementById('board');
  boardEl.style.width = (tileSize * COLS) + 'px';
  boardEl.style.height = (tileSize * ROWS) + 'px';
  for (const el of tileEls.values()) el.style.transition = 'none';
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = board[r] && board[r][c];
    if (!t) continue;
    const el = tileEls.get(t.id);
    if (el) placeTile(el, r, c);
  }
  void boardEl.offsetWidth;
  requestAnimationFrame(() => { for (const el of tileEls.values()) el.style.transition = ''; });
}

function placeTile(el, r, c) {
  el.style.width = tileSize + 'px';
  el.style.height = tileSize + 'px';
  el.style.transform = `translate(${cX(c)}px, ${rY(r)}px)`;
  const emoji = el.querySelector('.tile-emoji');
  if (emoji) emoji.style.fontSize = (tileSize * 0.5) + 'px';
}

function updateTileVisual(el, t) {
  const def = TYPE_MAP[t.type];
  el.style.background = `radial-gradient(circle at 35% 30%, ${def.light}, ${def.bg})`;
  el.querySelector('.tile-emoji').textContent = def.emoji;
  el.classList.toggle('bomb-line', t.bomb === 'line-h' || t.bomb === 'line-v');
  el.classList.toggle('bomb-mega', t.bomb === 'mega');
}

function createTileEl(t) {
  const el = document.createElement('div');
  el.className = 'tile';
  el.dataset.id = t.id;
  const span = document.createElement('span');
  span.className = 'tile-emoji';
  el.appendChild(span);
  attachPointerHandlers(el);
  return el;
}

function syncDOM() {
  const boardEl = document.getElementById('board');
  const seen = new Set();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = board[r][c];
      if (!t) continue;
      seen.add(t.id);
      let el = tileEls.get(t.id);
      if (!el) {
        el = createTileEl(t);
        tileEls.set(t.id, el);
        boardEl.appendChild(el);
        const startRow = (t.spawnRow !== undefined) ? t.spawnRow : r;
        el.style.transition = 'none';
        placeTile(el, startRow, c);
        delete t.spawnRow;
        void el.offsetWidth;
        el.style.transition = '';
      }
      updateTileVisual(el, t);
      placeTile(el, r, c);
    }
  }
  for (const [id, el] of tileEls) {
    if (!seen.has(id)) { el.remove(); tileEls.delete(id); }
  }
}

async function animateClear(cells) {
  const els = [];
  for (const cell of cells) {
    const t = board[cell.r][cell.c];
    if (!t) continue;
    const el = tileEls.get(t.id);
    if (el) els.push(el);
  }
  for (const el of els) {
    el.style.transform += ' scale(0.15)';
    el.style.opacity = '0';
  }
  await wait(190);
}

// ==============================
// Resolve loop
// ==============================
async function resolveBoard() {
  while (true) {
    const groups = findMatchGroups(board);
    if (groups.length === 0) break;

    const clearMap = new Map();
    const bombsToCreate = [];
    for (const g of groups) {
      for (const cell of g.cells) clearMap.set(key(cell.r, cell.c), cell);
      if (g.len >= 4) {
        const anchor = pickAnchor(g);
        bombsToCreate.push({ r: anchor.r, c: anchor.c, kind: g.len >= 5 ? 'mega' : (g.dir === 'h' ? 'line-h' : 'line-v') });
      }
    }

    // expand for pre-existing bombs caught in the blast
    const queue = [...clearMap.values()];
    const processed = new Set();
    while (queue.length) {
      const cell = queue.pop();
      const t = board[cell.r][cell.c];
      if (t && t.bomb && !processed.has(t.id)) {
        processed.add(t.id);
        for (const ec of bombCells(cell.r, cell.c, t.bomb)) {
          const k = key(ec.r, ec.c);
          if (!clearMap.has(k) && board[ec.r][ec.c]) { clearMap.set(k, ec); queue.push(ec); }
        }
      }
    }
    // protect anchors that are about to become bombs
    for (const b of bombsToCreate) clearMap.delete(key(b.r, b.c));

    const clearedCells = [...clearMap.values()];
    await animateClear(clearedCells);

    for (const cell of clearedCells) {
      const t = board[cell.r][cell.c];
      if (t) {
        const el = tileEls.get(t.id);
        if (el) el.remove();
        tileEls.delete(t.id);
      }
      board[cell.r][cell.c] = null;
    }
    for (const b of bombsToCreate) {
      const t = board[b.r][b.c];
      if (t) t.bomb = b.kind;
    }

    reducePressure(clearedCells.length);
    updateHUD();

    applyGravityAndRefill();
    syncDOM();
    await wait(240);
  }

  if (!hasAnyMove()) {
    await wait(150);
    reshuffleBoard();
    syncDOM();
    showToast('動かせる場所がないのでシャッフル！');
    await wait(200);
  }
}

// ==============================
// Pressure / HUD
// ==============================
function reducePressure(clearedCount) {
  pressure = Math.max(0, pressure - clearedCount * TILE_VALUE);
}

function updateHUD() {
  document.getElementById('moves-val').textContent = Math.max(0, movesLeft);
  const pushedPct = Math.round((PRESSURE_MAX - pressure) / PRESSURE_MAX * 100);
  document.getElementById('pct-val').textContent = pushedPct + '%';

  const fg = document.getElementById('gauge-fg');
  fg.style.strokeDasharray = GAUGE_CIRC;
  fg.style.strokeDashoffset = GAUGE_CIRC - (pushedPct / 100) * GAUGE_CIRC;
  fg.style.stroke = pushedPct > 70 ? '#4ee06a' : pushedPct > 35 ? '#ffd24d' : '#ff8a3d';

  const ratio = pressure / PRESSURE_MAX; // 1 = full danger, 0 = safe
  document.getElementById('boulder-pile').style.width = (20 + ratio * 40) + '%';
  document.getElementById('king-wrap').style.left = (14 + (1 - ratio) * 32) + '%';

  const kingEl = document.getElementById('king');
  kingEl.classList.toggle('danger', ratio > 0.6);
  kingEl.classList.toggle('safe', ratio < 0.15);
}

function checkGameEnd() {
  if (pressure <= 0) { endGame(true); return true; }
  if (movesLeft <= 0) { endGame(false); return true; }
  return false;
}

function endGame(win) {
  const title = document.getElementById('result-title');
  const msg = document.getElementById('result-message');
  if (win) {
    title.textContent = '王様、救出成功！';
    title.className = 'win';
    msg.textContent = '岩を押し返して王様は無事に脱出した！お見事！';
  } else {
    title.textContent = '王様、万事休す…';
    title.className = 'lose';
    msg.textContent = '手数が尽きて岩に押しつぶされてしまった…もう一度挑戦しよう！';
  }
  showScreen('result-screen');
}

// ==============================
// Input
// ==============================
function attachPointerHandlers(el) {
  el.addEventListener('pointerdown', (e) => {
    if (animating || movesLeft <= 0) return;
    const id = Number(el.dataset.id);
    const t = findTileById(id);
    if (!t) return;
    dragState = { r: t.r, c: t.c, x: e.clientX, y: e.clientY, moved: false };
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragState || dragState.moved) return;
    const dx = e.clientX - dragState.x;
    const dy = e.clientY - dragState.y;
    const threshold = tileSize * 0.28;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
    dragState.moved = true;
    let r2 = dragState.r, c2 = dragState.c;
    if (Math.abs(dx) > Math.abs(dy)) c2 += dx > 0 ? 1 : -1;
    else r2 += dy > 0 ? 1 : -1;
    const r1 = dragState.r, c1 = dragState.c;
    dragState = null;
    if (r2 >= 0 && r2 < ROWS && c2 >= 0 && c2 < COLS) {
      trySwap(r1, c1, r2, c2);
    }
  });
  el.addEventListener('pointerup', () => {
    if (dragState && !dragState.moved) handleTap(dragState.r, dragState.c);
    dragState = null;
  });
  el.addEventListener('pointercancel', () => { dragState = null; });
}

function findTileById(id) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (board[r][c] && board[r][c].id === id) return board[r][c];
  }
  return null;
}

function handleTap(r, c) {
  if (animating || movesLeft <= 0) return;
  if (!selectedCell) {
    selectedCell = { r, c };
    highlightSelected();
    return;
  }
  if (selectedCell.r === r && selectedCell.c === c) {
    selectedCell = null;
    highlightSelected();
    return;
  }
  if (isAdjacent(selectedCell.r, selectedCell.c, r, c)) {
    const s = selectedCell;
    selectedCell = null;
    highlightSelected();
    trySwap(s.r, s.c, r, c);
  } else {
    selectedCell = { r, c };
    highlightSelected();
  }
}

function highlightSelected() {
  for (const el of tileEls.values()) el.classList.remove('selected');
  if (selectedCell) {
    const t = board[selectedCell.r][selectedCell.c];
    const el = tileEls.get(t.id);
    if (el) el.classList.add('selected');
  }
}

function clearSelection() {
  selectedCell = null;
  highlightSelected();
}

async function trySwap(r1, c1, r2, c2) {
  if (animating || movesLeft <= 0) return;
  animating = true;
  clearSelection();

  swapBoardTiles(r1, c1, r2, c2);
  syncDOM();
  await wait(200);

  const groups = findMatchGroups(board);
  if (groups.length === 0) {
    swapBoardTiles(r1, c1, r2, c2);
    syncDOM();
    await wait(200);
    animating = false;
    return;
  }

  lastSwapCell = { r: r2, c: c2 };
  movesLeft--;
  updateHUD();
  await resolveBoard();
  lastSwapCell = null;
  animating = false;
  checkGameEnd();
}

// ==============================
// Toast / screens
// ==============================
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._h);
  showToast._h = setTimeout(() => t.classList.remove('show'), 1300);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (id === 'game-screen') requestAnimationFrame(layout);
}

function restartBanner() {
  const el = document.getElementById('banner-flash');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
}

// ==============================
// Game start
// ==============================
function startGame() {
  movesLeft = MOVES_START;
  pressure = PRESSURE_MAX;
  selectedCell = null;
  dragState = null;
  animating = false;
  lastSwapCell = null;

  document.getElementById('board').innerHTML = '';
  tileEls.clear();

  initBoard();
  showScreen('game-screen');
  layout();
  syncDOM();
  updateHUD();
  restartBanner();
}

// ==============================
// Boot
// ==============================
document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-help').addEventListener('click', () => showScreen('help-screen'));
document.getElementById('btn-help-back').addEventListener('click', () => showScreen('title-screen'));
document.getElementById('btn-retry').addEventListener('click', startGame);
document.getElementById('btn-title').addEventListener('click', () => showScreen('title-screen'));

window.addEventListener('resize', () => {
  if (document.getElementById('game-screen').classList.contains('active')) layout();
});

showScreen('title-screen');
