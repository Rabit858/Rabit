'use strict';

// ==============================
// Constants & Configuration
// ==============================
const TILE = 70;          // pixels per tile
const COLS = 8;
const ROWS = 8;
const HQ_MAX_HP = 20;

const TERRAIN = {
  PLAIN:  { id: 0, color: '#1a2a1a', name: '平地',   moveCost: 1, defBonus: 0 },
  FOREST: { id: 1, color: '#1a3a1a', name: '森',     moveCost: 2, defBonus: 1 },
  MOUNTAIN:{ id:2, color:'#2a2a3a',  name: '山',     moveCost: 3, defBonus: 2 },
  WATER:  { id: 3, color: '#0a1a3a', name: '水',     moveCost: 99,defBonus: 0 },
  ROAD:   { id: 4, color: '#2a2010', name: '道',     moveCost: 1, defBonus: 0 },
};

const UNIT_TYPES = {
  infantry: {
    name: '歩兵', emoji: '🪖',
    maxHp: 10, atk: 3, def: 2, move: 2, range: 1,
    color: '#3399ff',
  },
  archer: {
    name: '弓兵', emoji: '🏹',
    maxHp: 8,  atk: 4, def: 1, move: 2, range: 2,
    color: '#66ccff',
  },
  cavalry: {
    name: '騎兵', emoji: '🐴',
    maxHp: 14, atk: 5, def: 3, move: 3, range: 1,
    color: '#44ddff',
  },
  cannon: {
    name: '砲兵', emoji: '💣',
    maxHp: 6,  atk: 7, def: 1, move: 1, range: 3,
    color: '#aaddff',
  },
};

// ==============================
// Map Layout (0=Plain,1=Forest,2=Mountain,3=Water,4=Road)
// ==============================
const MAP_LAYOUT = [
  [1,0,0,2,2,0,0,1],
  [0,0,4,4,4,4,0,0],
  [0,4,1,0,0,1,4,0],
  [2,4,0,3,3,0,4,2],
  [2,4,0,3,3,0,4,2],
  [0,4,1,0,0,1,4,0],
  [0,0,4,4,4,4,0,0],
  [1,0,0,2,2,0,0,1],
];

// ==============================
// Game State
// ==============================
let state = {};

function initState() {
  state = {
    turn: 1,
    phase: 'player',   // 'player' | 'enemy'
    selected: null,     // selected unit id
    reachable: [],      // tiles the selected unit can reach
    attackable: [],     // tiles the selected unit can attack
    units: [],
    hq: {
      player: { x: 0, y: 7, hp: HQ_MAX_HP },
      enemy:  { x: 7, y: 0, hp: HQ_MAX_HP },
    },
    nextId: 0,
    animating: false,
  };

  // Place player units
  spawnUnit('player', 'infantry', 0, 6);
  spawnUnit('player', 'infantry', 1, 7);
  spawnUnit('player', 'archer',   2, 7);
  spawnUnit('player', 'cavalry',  0, 5);
  spawnUnit('player', 'cannon',   1, 6);

  // Place enemy units
  spawnUnit('enemy', 'infantry', 7, 1);
  spawnUnit('enemy', 'infantry', 6, 0);
  spawnUnit('enemy', 'archer',   5, 0);
  spawnUnit('enemy', 'cavalry',  7, 2);
  spawnUnit('enemy', 'cannon',   6, 1);
}

function spawnUnit(team, type, x, y) {
  const t = UNIT_TYPES[type];
  state.units.push({
    id: state.nextId++,
    team, type,
    x, y,
    hp: t.maxHp,
    maxHp: t.maxHp,
    moved: false,
    attacked: false,
  });
}

// ==============================
// Canvas Rendering
// ==============================
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawTerrain();
  drawHQ();
  drawHighlights();
  drawUnits();
}

function tileRect(x, y) {
  return { px: x * TILE, py: y * TILE, w: TILE, h: TILE };
}

function drawTerrain() {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const tid = MAP_LAYOUT[y][x];
      const terrain = Object.values(TERRAIN).find(t => t.id === tid);
      const r = tileRect(x, y);
      ctx.fillStyle = terrain.color;
      ctx.fillRect(r.px, r.py, r.w, r.h);
      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.strokeRect(r.px, r.py, r.w, r.h);
    }
  }
}

function drawHQ() {
  const drawStar = (hq, color) => {
    const r = tileRect(hq.x, hq.y);
    ctx.fillStyle = color;
    ctx.font = `${TILE * 0.55}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.5;
    ctx.fillText('★', r.px + TILE/2, r.py + TILE/2);
    ctx.globalAlpha = 1.0;

    // HP bar
    const barW = TILE - 8;
    const barH = 5;
    const hpRatio = Math.max(0, hq.hp / HQ_MAX_HP);
    ctx.fillStyle = '#222';
    ctx.fillRect(r.px + 4, r.py + TILE - 10, barW, barH);
    ctx.fillStyle = color;
    ctx.fillRect(r.px + 4, r.py + TILE - 10, barW * hpRatio, barH);
  };
  drawStar(state.hq.player, '#44aaff');
  drawStar(state.hq.enemy,  '#ff4466');
}

function drawHighlights() {
  for (const tile of state.reachable) {
    const r = tileRect(tile.x, tile.y);
    ctx.fillStyle = 'rgba(100, 200, 255, 0.25)';
    ctx.fillRect(r.px + 1, r.py + 1, r.w - 2, r.h - 2);
    ctx.strokeStyle = 'rgba(100,200,255,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(r.px + 1, r.py + 1, r.w - 2, r.h - 2);
  }
  for (const tile of state.attackable) {
    const r = tileRect(tile.x, tile.y);
    ctx.fillStyle = 'rgba(255, 80, 80, 0.3)';
    ctx.fillRect(r.px + 1, r.py + 1, r.w - 2, r.h - 2);
    ctx.strokeStyle = 'rgba(255,80,80,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(r.px + 1, r.py + 1, r.w - 2, r.h - 2);
  }
}

function drawUnits() {
  for (const unit of state.units) {
    const r = tileRect(unit.x, unit.y);
    const ut = UNIT_TYPES[unit.type];
    const isSelected = state.selected === unit.id;
    const isDone = unit.moved && unit.attacked;

    // Background circle
    ctx.beginPath();
    ctx.arc(r.px + TILE/2, r.py + TILE/2, TILE * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = unit.team === 'player' ? 'rgba(30,80,180,0.7)' : 'rgba(180,30,40,0.7)';
    ctx.fill();

    if (isSelected) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Dim if done
    ctx.globalAlpha = isDone ? 0.45 : 1.0;

    // Emoji
    ctx.font = `${TILE * 0.45}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ut.emoji, r.px + TILE/2, r.py + TILE/2 - 2);

    ctx.globalAlpha = 1.0;

    // HP bar
    const barW = TILE - 10;
    const hpRatio = Math.max(0, unit.hp / unit.maxHp);
    ctx.fillStyle = '#111';
    ctx.fillRect(r.px + 5, r.py + TILE - 12, barW, 5);
    const hpColor = hpRatio > 0.5 ? '#44ff88' : hpRatio > 0.25 ? '#ffcc00' : '#ff4444';
    ctx.fillStyle = hpColor;
    ctx.fillRect(r.px + 5, r.py + TILE - 12, barW * hpRatio, 5);
  }
}

// ==============================
// Movement / Attack Ranges
// ==============================
function getTerrainAt(x, y) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return null;
  const tid = MAP_LAYOUT[y][x];
  return Object.values(TERRAIN).find(t => t.id === tid);
}

function getUnitAt(x, y) {
  return state.units.find(u => u.x === x && u.y === y) || null;
}

function computeReachable(unit) {
  const ut = UNIT_TYPES[unit.type];
  const dist = {};
  const queue = [{ x: unit.x, y: unit.y, mp: ut.move }];
  dist[`${unit.x},${unit.y}`] = ut.move;
  const result = [];

  while (queue.length > 0) {
    const cur = queue.shift();
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const key = `${nx},${ny}`;
      const terrain = getTerrainAt(nx, ny);
      if (!terrain) continue;
      if (terrain.moveCost === 99) continue;
      const rem = cur.mp - terrain.moveCost;
      if (rem < 0) continue;
      if (dist[key] !== undefined && dist[key] >= rem) continue;
      const occ = getUnitAt(nx, ny);
      if (occ && occ.team !== unit.team) continue;  // blocked by enemy
      dist[key] = rem;
      queue.push({ x: nx, y: ny, mp: rem });
      if (!occ) result.push({ x: nx, y: ny });  // can move here (not occupied by ally)
    }
  }
  return result;
}

function computeAttackable(unit) {
  const ut = UNIT_TYPES[unit.type];
  const tiles = [];
  for (let dy = -ut.range; dy <= ut.range; dy++) {
    for (let dx = -ut.range; dx <= ut.range; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist < 1 || dist > ut.range) continue;
      const nx = unit.x + dx;
      const ny = unit.y + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      const target = getUnitAt(nx, ny);
      if (target && target.team !== unit.team) {
        tiles.push({ x: nx, y: ny });
      }
      // Check HQ
      const hq = unit.team === 'player' ? state.hq.enemy : state.hq.player;
      if (nx === hq.x && ny === hq.y) {
        tiles.push({ x: nx, y: ny });
      }
    }
  }
  return tiles;
}

// ==============================
// Combat
// ==============================
function calcDamage(attacker, defUnit, defTerrain) {
  const at = UNIT_TYPES[attacker.type];
  let dmg = at.atk;
  if (defUnit) {
    const dt = UNIT_TYPES[defUnit.type];
    dmg = Math.max(1, at.atk - dt.def - defTerrain.defBonus);
  }
  // small variance
  dmg += Math.floor(Math.random() * 2);
  return dmg;
}

function attackUnit(attacker, defender) {
  const defTerrain = getTerrainAt(defender.x, defender.y) || TERRAIN.PLAIN;
  const dmg = calcDamage(attacker, defender, defTerrain);
  defender.hp -= dmg;
  addLog(`⚔️ ${UNIT_TYPES[attacker.type].name} が ${UNIT_TYPES[defender.type].name} に ${dmg} ダメージ！`, 'log-attack');

  // Counter-attack (if adjacent and still alive)
  const dx = Math.abs(attacker.x - defender.x);
  const dy = Math.abs(attacker.y - defender.y);
  if (defender.hp > 0 && dx + dy === 1) {
    const atkTerrain = getTerrainAt(attacker.x, attacker.y) || TERRAIN.PLAIN;
    const counterDmg = calcDamage(defender, attacker, atkTerrain);
    attacker.hp -= counterDmg;
    addLog(`↩️ 反撃！ ${counterDmg} ダメージ！`, 'log-attack');
  }

  // Remove dead units
  state.units = state.units.filter(u => u.hp > 0);
}

function attackHQ(attacker, hq) {
  const at = UNIT_TYPES[attacker.type];
  const dmg = at.atk + Math.floor(Math.random() * 2);
  hq.hp -= dmg;
  hq.hp = Math.max(0, hq.hp);
  addLog(`💥 本拠地に ${dmg} ダメージ！ 残HP: ${hq.hp}`, 'log-destroy');
}

// ==============================
// Player Interaction
// ==============================
canvas.addEventListener('click', onCanvasClick);

function onCanvasClick(e) {
  if (state.phase !== 'player' || state.animating) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;
  const tx = Math.floor(mx / TILE);
  const ty = Math.floor(my / TILE);

  const clickedUnit = getUnitAt(tx, ty);
  const sel = state.selected !== null ? state.units.find(u => u.id === state.selected) : null;

  // Click on own unit — select it
  if (clickedUnit && clickedUnit.team === 'player') {
    selectUnit(clickedUnit);
    return;
  }

  if (!sel) return;

  // Click on attackable tile
  const isAttackable = state.attackable.some(t => t.x === tx && t.y === ty);
  if (isAttackable && !sel.attacked) {
    // Attack enemy unit
    const target = getUnitAt(tx, ty);
    if (target && target.team === 'enemy') {
      attackUnit(sel, target);
      sel.attacked = true;
      sel.moved = true;
    } else {
      // Attack enemy HQ
      const ehq = state.hq.enemy;
      if (tx === ehq.x && ty === ehq.y) {
        attackHQ(sel, ehq);
        sel.attacked = true;
        sel.moved = true;
      }
    }
    clearSelection();
    updateUI();
    checkWin();
    return;
  }

  // Click on reachable tile — move
  const isReachable = state.reachable.some(t => t.x === tx && t.y === ty);
  if (isReachable && !sel.moved) {
    sel.x = tx;
    sel.y = ty;
    sel.moved = true;
    // Recompute attackable from new position
    state.reachable = [];
    state.attackable = computeAttackable(sel);
    addLog(`➡️ ${UNIT_TYPES[sel.type].name} が移動しました`, 'log-move');
    updateUnitDetail(sel);
    render();
    return;
  }

  // Click on empty tile or inaccessible — deselect
  clearSelection();
  render();
}

function selectUnit(unit) {
  if (unit.moved && unit.attacked) return; // exhausted
  state.selected = unit.id;
  state.reachable  = unit.moved ? [] : computeReachable(unit);
  state.attackable = unit.attacked ? [] : computeAttackable(unit);
  updateUnitDetail(unit);
  render();
}

function clearSelection() {
  state.selected = null;
  state.reachable = [];
  state.attackable = [];
  document.getElementById('unit-detail-text').textContent = 'ユニットをクリックして選択';
  render();
}

function updateUnitDetail(unit) {
  const ut = UNIT_TYPES[unit.type];
  const status = [];
  if (unit.moved) status.push('移動済');
  if (unit.attacked) status.push('攻撃済');
  document.getElementById('unit-detail-text').textContent =
    `${ut.emoji} ${ut.name} | HP:${unit.hp}/${unit.maxHp} | ATK:${ut.atk} DEF:${ut.def} 射程:${ut.range} ` +
    (status.length ? `[${status.join(' ')}]` : '');
}

// ==============================
// Turn Management
// ==============================
document.getElementById('btn-end-turn').addEventListener('click', endPlayerTurn);

function endPlayerTurn() {
  if (state.phase !== 'player') return;
  clearSelection();
  state.phase = 'enemy';
  updatePhaseUI();
  addLog('--- 敵ターン ---', 'log-enemy');
  setTimeout(runEnemyTurn, 500);
}

function startPlayerTurn() {
  state.phase = 'player';
  state.turn++;
  // Reset unit flags
  for (const u of state.units) {
    u.moved = false;
    u.attacked = false;
  }
  updatePhaseUI();
  addLog(`--- ターン ${state.turn} 自軍フェーズ ---`, 'log-move');
  updateUI();
}

// ==============================
// Enemy AI
// ==============================
async function runEnemyTurn() {
  const enemyUnits = state.units.filter(u => u.team === 'enemy');
  for (const unit of enemyUnits) {
    if (state.units.find(u => u.id === unit.id) === undefined) continue; // dead
    await sleep(200);
    enemyAct(unit);
    render();
    updateUI();
  }
  await sleep(400);
  startPlayerTurn();
}

function enemyAct(unit) {
  const ut = UNIT_TYPES[unit.type];

  // Try to attack player HQ or player unit
  const phq = state.hq.player;
  const attackableNow = computeAttackable(unit);

  if (attackableNow.length > 0) {
    // Prefer player HQ
    const hqTarget = attackableNow.find(t => t.x === phq.x && t.y === phq.y);
    if (hqTarget) {
      attackHQ(unit, phq);
      unit.moved = true;
      unit.attacked = true;
      return;
    }
    // Otherwise attack a player unit
    const t = attackableNow[0];
    const defender = getUnitAt(t.x, t.y);
    if (defender) {
      attackUnit(unit, defender);
      unit.moved = true;
      unit.attacked = true;
      checkWin();
      return;
    }
  }

  // Move towards player HQ
  const reachable = computeReachable(unit);
  if (reachable.length > 0) {
    // Pick tile closest to player HQ
    let best = null;
    let bestDist = Infinity;
    for (const tile of reachable) {
      const d = Math.abs(tile.x - phq.x) + Math.abs(tile.y - phq.y);
      if (d < bestDist) { bestDist = d; best = tile; }
    }
    if (best) {
      unit.x = best.x;
      unit.y = best.y;
      unit.moved = true;
      addLog(`👹 ${UNIT_TYPES[unit.type].name} が移動`, 'log-enemy');
    }
  }

  // Attack after move
  const afterAttackable = computeAttackable(unit);
  if (afterAttackable.length > 0 && !unit.attacked) {
    const hqTarget = afterAttackable.find(t => t.x === phq.x && t.y === phq.y);
    if (hqTarget) {
      attackHQ(unit, phq);
      unit.attacked = true;
      return;
    }
    const t = afterAttackable[0];
    const defender = getUnitAt(t.x, t.y);
    if (defender) {
      attackUnit(unit, defender);
      unit.attacked = true;
      checkWin();
    }
  }
}

// ==============================
// Win Condition
// ==============================
function checkWin() {
  if (state.hq.enemy.hp <= 0 || state.units.filter(u => u.team === 'enemy').length === 0) {
    showResult('win');
    return;
  }
  if (state.hq.player.hp <= 0 || state.units.filter(u => u.team === 'player').length === 0) {
    showResult('lose');
    return;
  }
}

function showResult(outcome) {
  const title = document.getElementById('result-title');
  const message = document.getElementById('result-message');
  title.textContent = outcome === 'win' ? '勝利！' : '敗北...';
  title.className = outcome;
  message.textContent = outcome === 'win'
    ? '敵の本拠地を制圧しました！おめでとう！'
    : '本拠地が陥落しました...もう一度挑戦しよう！';
  showScreen('result-screen');
  state.animating = true;
}

// ==============================
// UI Updates
// ==============================
function updateUI() {
  const playerCount = state.units.filter(u => u.team === 'player').length;
  const enemyCount  = state.units.filter(u => u.team === 'enemy').length;
  document.getElementById('player-units-count').textContent = playerCount;
  document.getElementById('enemy-units-count').textContent  = enemyCount;

  document.getElementById('player-hq-hp-val').textContent = state.hq.player.hp;
  document.getElementById('enemy-hq-hp-val').textContent  = state.hq.enemy.hp;

  const phqRatio = (state.hq.player.hp / HQ_MAX_HP * 100).toFixed(0) + '%';
  const ehqRatio = (state.hq.enemy.hp  / HQ_MAX_HP * 100).toFixed(0) + '%';
  document.getElementById('player-hq-hp').style.width = phqRatio;
  document.getElementById('enemy-hq-hp').style.width  = ehqRatio;

  document.getElementById('turn-num').textContent = state.turn;
  render();
}

function updatePhaseUI() {
  const label = document.getElementById('phase-label');
  if (state.phase === 'player') {
    label.textContent = '自軍フェーズ';
    label.className = 'phase-player';
    document.getElementById('btn-end-turn').disabled = false;
  } else {
    label.textContent = '敵軍フェーズ';
    label.className = 'phase-enemy';
    document.getElementById('btn-end-turn').disabled = true;
  }
  updateUI();
}

function addLog(msg, cls = '') {
  const log = document.getElementById('battle-log');
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = msg;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// ==============================
// Screen Management
// ==============================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ==============================
// Button Handlers
// ==============================
document.getElementById('btn-start').addEventListener('click', () => {
  initState();
  showScreen('game-screen');
  document.getElementById('battle-log').innerHTML = '';
  addLog('--- ターン 1 自軍フェーズ ---', 'log-move');
  updatePhaseUI();
});

document.getElementById('btn-help').addEventListener('click', () => showScreen('help-screen'));
document.getElementById('btn-help-back').addEventListener('click', () => showScreen('title-screen'));

document.getElementById('btn-retry').addEventListener('click', () => {
  initState();
  showScreen('game-screen');
  document.getElementById('battle-log').innerHTML = '';
  addLog('--- ターン 1 自軍フェーズ ---', 'log-move');
  updatePhaseUI();
  state.animating = false;
});

document.getElementById('btn-title').addEventListener('click', () => showScreen('title-screen'));

// ==============================
// Utils
// ==============================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==============================
// Boot
// ==============================
showScreen('title-screen');
