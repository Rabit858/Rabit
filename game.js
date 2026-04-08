'use strict';

// ==================== CONSTANTS ====================

const UNIT_DEF = {
  army:     { name: '陸軍', emoji: '🪖', color: '#4499ff' },
  navy:     { name: '海軍', emoji: '🚢', color: '#00ffaa' },
  airforce: { name: '空軍', emoji: '✈️', color: '#aa44ff' },
};

// army beats airforce, navy beats army, airforce beats navy
const ADVANTAGE = { army: 'airforce', navy: 'army', airforce: 'navy' };

const TERR_DEFS = [
  { id:0,  type:'airforce', req:350, gold:90,  rp:28 },
  { id:1,  type:'navy',     req:280, gold:75,  rp:22 },
  { id:2,  type:'army',     req:310, gold:80,  rp:25 },
  { id:3,  type:'airforce', req:260, gold:70,  rp:20 },
  { id:4,  type:'navy',     req:380, gold:95,  rp:30 },
  { id:5,  type:'navy',     req:60,  gold:25,  rp:8  },
  { id:6,  type:'airforce', req:130, gold:35,  rp:12 },
  { id:7,  type:'army',     req:190, gold:52,  rp:16 },
  { id:8,  type:'navy',     req:210, gold:58,  rp:17 },
  { id:9,  type:'airforce', req:240, gold:65,  rp:20 },
  { id:10, type:'home',     req:0,   gold:0,   rp:0  },
  { id:11, type:'army',     req:60,  gold:25,  rp:8  },
  { id:12, type:'navy',     req:160, gold:42,  rp:14 },
  { id:13, type:'airforce', req:230, gold:62,  rp:19 },
  { id:14, type:'army',     req:400, gold:100, rp:32 },
];

const RESEARCH_ITEMS = [
  { id:'lv6',    label:'Lv.6合成アンロック',  cost:20, desc:'合成上限をLv.6に拡張',      req:null  },
  { id:'lv7',    label:'Lv.7合成アンロック',  cost:40, desc:'合成上限をLv.7に拡張',      req:'lv6' },
  { id:'lv8',    label:'Lv.8合成アンロック',  cost:80, desc:'合成上限をLv.8に拡張',      req:'lv7' },
  { id:'cost',   label:'生産コスト削減',       cost:30, desc:'ユニット生産コスト-2G',     req:null  },
  { id:'energy', label:'エネルギー効率化',     cost:25, desc:'エネルギー回復速度+1/3秒',  req:null  },
];

const HERO_POOL = [
  { id:'garcia', name:'陸将ガルシア', emoji:'🦁', type:'army',     mult:0.2 },
  { id:'aqua',   name:'海将アクア',   emoji:'🐬', type:'navy',     mult:0.2 },
  { id:'storm',  name:'空将ストーム', emoji:'🦅', type:'airforce', mult:0.2 },
  { id:'omega',  name:'名将オメガ',   emoji:'⭐', type:'all',      mult:0.1 },
  { id:'mint',   name:'合成師ミント', emoji:'🍀', type:'cost',     mult:0.0 },
];

const MARCH_MS   = 4000;
const CANVAS_W   = 550;
const CANVAS_H   = 330;
const TILE_W     = 110;
const TILE_H     = 110;

// ==================== STATE ====================

let S = {};

function initState() {
  if (S.energyInterval) clearInterval(S.energyInterval);
  if (S.rafId) { cancelAnimationFrame(S.rafId); }
  S = {
    gold: 50,
    energy: 10,
    maxEnergy: 20,
    rp: 0,
    board: Array(20).fill(null),
    nextId: 1,
    territories: buildTerritories(),
    selTerritory: null,
    deployed: new Set(),
    research: { maxLv: 5, unlocked: new Set(), costReduction: 0, energyBonus: 0 },
    heroes: [],
    streak: 0,
    marches: [],
    marchCounter: 0,
    energyInterval: null,
    rafId: null,
  };
}

function buildTerritories() {
  const names = { home:'本拠地', army:'陸軍基地', navy:'海軍基地', airforce:'空軍基地' };
  return TERR_DEFS.map(d => ({
    ...d,
    name: names[d.type],
    state: d.id === 10 ? 'captured' : (d.id === 5 || d.id === 11 ? 'visible' : 'fog'),
  }));
}

function getAdjacent(id) {
  const result = [];
  const row = Math.floor(id / 5), col = id % 5;
  if (col > 0) result.push(id - 1);
  if (col < 4) result.push(id + 1);
  if (row > 0) result.push(id - 5);
  if (row < 2) result.push(id + 5);
  return result;
}

// ==================== SCREEN ====================

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  document.querySelectorAll('.tab-btn[data-target]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.target === id);
  });
}

// ==================== UI SYNC ====================

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function syncUI() {
  setText('gold-b',  S.gold);
  setText('gold-m',  S.gold);
  setText('ep-b',    S.energy);
  setText('ep-m',    S.energy);
  setText('epm-b',   S.maxEnergy);
  setText('epm-m',   S.maxEnergy);
  setText('rp-b',    S.rp);
  setText('rp-m',    S.rp);
  setText('sk-b',    S.streak);
  const capCount = S.territories.filter(t => t.state === 'captured' && t.type !== 'home').length;
  setText('cap-m', capCount);
  const cost = getProductionCost();
  setText('cost-a', cost + 'G');
  setText('cost-n', cost + 'G');
  setText('cost-f', cost + 'G');
}

function getProductionCost() {
  const mintBonus = S.heroes.some(h => h.id === 'mint') ? 1 : 0;
  return Math.max(1, 5 - S.research.costReduction - mintBonus);
}

// ==================== MERGE BOARD ====================

function hpColor(pct) {
  if (pct > 60) return '#44ff88';
  if (pct > 30) return '#ffcc00';
  return '#ff4444';
}

function renderBoard() {
  const container = document.getElementById('merge-board');
  if (!container) return;
  container.innerHTML = '';
  const marchingSet = new Set(S.marches.flatMap(m => m.unitIdx));

  for (let i = 0; i < 20; i++) {
    const cell = document.createElement('div');
    cell.className = 'board-cell';
    cell.dataset.idx = i;

    const unit = S.board[i];
    if (unit) {
      const def = UNIT_DEF[unit.type];
      const isDeployed  = S.deployed.has(i);
      const isMarching  = marchingSet.has(i);
      if (isDeployed) cell.classList.add('cell-deployed');
      if (isMarching) cell.classList.add('cell-marching');

      cell.innerHTML =
        `<div class="unit-card" style="--uc:${def.color}">` +
          `<span class="u-emoji">${def.emoji}</span>` +
          `<span class="u-badge">Lv.${unit.level}</span>` +
          `<div class="u-hpbar"><div class="u-hpfill" style="width:${unit.hp}%;background:${hpColor(unit.hp)}"></div></div>` +
        `</div>`;

      if (!isMarching) {
        cell.draggable = true;
        cell.addEventListener('dragstart', onDragStart);
        cell.addEventListener('click',     onCellClick);
      }
    }
    cell.addEventListener('dragover', e => e.preventDefault());
    cell.addEventListener('drop', onDrop);
    container.appendChild(cell);
  }
  syncUI();
}

// ==================== DRAG & DROP ====================

let dragFrom = null;

function onDragStart(e) {
  dragFrom = parseInt(e.currentTarget.dataset.idx);
  e.dataTransfer.effectAllowed = 'move';
}

function onDrop(e) {
  e.preventDefault();
  const to = parseInt(e.currentTarget.dataset.idx);
  if (dragFrom === null || dragFrom === to) { dragFrom = null; return; }

  const src = S.board[dragFrom];
  const dst = S.board[to];
  const marchingSet = new Set(S.marches.flatMap(m => m.unitIdx));

  if (!src || marchingSet.has(dragFrom)) { dragFrom = null; return; }

  if (!dst) {
    // Move to empty cell
    S.board[to] = src;
    S.board[dragFrom] = null;
    if (S.deployed.has(dragFrom)) { S.deployed.delete(dragFrom); S.deployed.add(to); }
  } else if (src.type === dst.type && src.level === dst.level && src.level < S.research.maxLv) {
    // Merge!
    S.board[to]      = { id: S.nextId++, type: src.type, level: src.level + 1, hp: 100 };
    S.board[dragFrom] = null;
    S.deployed.delete(dragFrom);
    S.deployed.delete(to);
    // Flash animation
    requestAnimationFrame(() => {
      const cells = document.querySelectorAll('#merge-board .board-cell');
      if (cells[to]) {
        cells[to].classList.add('merge-flash');
        setTimeout(() => cells[to] && cells[to].classList.remove('merge-flash'), 600);
      }
    });
  } else {
    if (src.level >= S.research.maxLv && src.type === dst.type && src.level === dst.level) {
      showToast('最大Lv.' + S.research.maxLv + 'です！研究でアンロック可能', 'err');
    } else {
      showToast('合成できません（同じ兵種・同じレベルのみ）');
    }
    dragFrom = null;
    return;
  }
  dragFrom = null;
  renderBoard();
}

function onCellClick(e) {
  const idx = parseInt(e.currentTarget.dataset.idx);
  const marchingSet = new Set(S.marches.flatMap(m => m.unitIdx));
  if (marchingSet.has(idx)) return;
  if (S.deployed.has(idx)) S.deployed.delete(idx);
  else S.deployed.add(idx);
  renderBoard();
}

// ==================== PRODUCTION ====================

function produceUnit(type) {
  const cost = getProductionCost();
  if (S.gold < cost) { showToast('ゴールド不足です', 'err'); return; }
  const idx = S.board.findIndex(c => c === null);
  if (idx === -1) { showToast('ボードが満杯です', 'err'); return; }
  S.gold -= cost;
  S.board[idx] = { id: S.nextId++, type, level: 1, hp: 100 };
  renderBoard();
}

// ==================== DEPLOY ====================

function goToWorldMap() {
  if (S.deployed.size === 0) { showToast('ユニットをクリックして選択してください'); return; }
  showScreen('worldmap-screen');
  drawWorldMap();
  updateTerrPanel();
}


// ==================== CANVAS ====================

let mapCanvas = null, mapCtx = null, canvasListenerAdded = false;

function ensureCanvas() {
  if (!mapCtx) {
    mapCanvas = document.getElementById('world-canvas');
    if (!mapCanvas) return false;
    mapCtx = mapCanvas.getContext('2d');
  }
  if (!canvasListenerAdded) {
    mapCanvas.addEventListener('click', onMapClick);
    canvasListenerAdded = true;
  }
  return true;
}

function tileXY(id)     { return { x: (id % 5) * TILE_W, y: Math.floor(id / 5) * TILE_H }; }
function tileCenter(id) { return { x: (id % 5) * TILE_W + 55, y: Math.floor(id / 5) * TILE_H + 55 }; }

function drawWorldMap() {
  if (!ensureCanvas()) return;
  const ctx = mapCtx;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#05050f';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Grid lines
  ctx.strokeStyle = 'rgba(40,40,80,0.6)';
  ctx.lineWidth = 1;
  for (let c = 1; c < 5; c++) { ctx.beginPath(); ctx.moveTo(c*TILE_W, 0); ctx.lineTo(c*TILE_W, CANVAS_H); ctx.stroke(); }
  for (let r = 1; r < 3; r++) { ctx.beginPath(); ctx.moveTo(0, r*TILE_H); ctx.lineTo(CANVAS_W, r*TILE_H); ctx.stroke(); }

  for (const t of S.territories) drawTerritory(ctx, t);

  const now = Date.now();
  for (const m of S.marches) drawMarch(ctx, m, now);
}

function drawTerritory(ctx, terr) {
  const { x: tx, y: ty } = tileXY(terr.id);
  const cx = tx + 55, cy = ty + 55;

  // Background
  if      (terr.state === 'captured') ctx.fillStyle = 'rgba(0,50,25,0.55)';
  else if (terr.state === 'visible')  ctx.fillStyle = 'rgba(40,0,0,0.55)';
  else                                ctx.fillStyle = 'rgba(4,4,18,0.85)';
  ctx.fillRect(tx + 1, ty + 1, TILE_W - 2, TILE_H - 2);

  // Border
  ctx.shadowBlur = 0;
  const isSel = S.selTerritory === terr.id;
  if (isSel) {
    ctx.shadowBlur = 18; ctx.shadowColor = '#ffff00'; ctx.strokeStyle = '#ffff00'; ctx.lineWidth = 3;
  } else if (terr.state === 'captured') {
    ctx.shadowBlur = 6;  ctx.shadowColor = '#00ff88'; ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 2;
  } else if (terr.state === 'visible') {
    ctx.shadowBlur = 5;  ctx.shadowColor = '#ff2244'; ctx.strokeStyle = '#ff2244'; ctx.lineWidth = 2;
  } else {
    ctx.strokeStyle = '#1a1a3a'; ctx.lineWidth = 1;
  }
  ctx.strokeRect(tx + 1, ty + 1, TILE_W - 2, TILE_H - 2);
  ctx.shadowBlur = 0;

  // Content
  if (terr.state === 'fog') {
    drawFog(ctx, cx, cy);
  } else if (terr.state === 'captured') {
    if (terr.type === 'home') drawHome(ctx, cx, cy);
    else drawBuilding(ctx, cx, cy, terr.type, true);
    ctx.fillStyle = '#88ffaa'; ctx.font = '9px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(terr.name, cx, ty + TILE_H - 3);
  } else {
    drawBuilding(ctx, cx, cy, terr.type, false);
    ctx.fillStyle = '#ff8888'; ctx.font = '9px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('\u2694\uFE0F ' + terr.req, cx, ty + TILE_H - 3);
  }
}

function drawFog(ctx, cx, cy) {
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#1a1a3a';
  ctx.fillRect(cx - 55, cy - 55, TILE_W, TILE_H);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#333355'; ctx.font = 'bold 30px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('?', cx, cy);
}

function drawHome(ctx, cx, cy) {
  const col = '#00ffff';
  ctx.shadowBlur = 14; ctx.shadowColor = col;
  // Platform
  ctx.fillStyle = '#003344';
  ctx.beginPath();
  ctx.moveTo(cx-28, cy+28); ctx.lineTo(cx+28, cy+28);
  ctx.lineTo(cx+20, cy+14); ctx.lineTo(cx-20, cy+14);
  ctx.closePath(); ctx.fill();
  // Tower
  ctx.fillStyle = '#005566';
  ctx.fillRect(cx - 9, cy - 10, 18, 24);
  // Dome
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(cx, cy - 10, 12, Math.PI, 0); ctx.fill();
  // Antenna
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, cy - 22); ctx.lineTo(cx, cy - 36); ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(cx, cy - 38, 3, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
}

function drawBuilding(ctx, cx, cy, type, isCaptured) {
  const colors = { army: '#4499ff', navy: '#00ffaa', airforce: '#aa44ff' };
  const col = colors[type] || '#ffffff';
  ctx.shadowBlur = isCaptured ? 11 : 4;
  ctx.shadowColor = col;

  if (type === 'army') {
    // Trapezoid base
    ctx.fillStyle = '#001133';
    ctx.beginPath();
    ctx.moveTo(cx-28, cy+28); ctx.lineTo(cx+28, cy+28);
    ctx.lineTo(cx+20, cy+15); ctx.lineTo(cx-20, cy+15);
    ctx.closePath(); ctx.fill();
    // Fortress body
    ctx.fillStyle = isCaptured ? '#002255' : '#1a1000';
    ctx.fillRect(cx-20, cy-8, 40, 23);
    // Battlements
    ctx.fillStyle = col;
    for (let i = -1; i <= 1; i++) ctx.fillRect(cx + i*13 - 5, cy-18, 9, 10);
    // Cannon barrel
    ctx.fillStyle = '#aaddff';
    ctx.fillRect(cx+18, cy-2, 16, 5);

  } else if (type === 'navy') {
    // Ellipse platform
    ctx.fillStyle = '#001122';
    ctx.beginPath(); ctx.ellipse(cx, cy+22, 28, 7, 0, 0, Math.PI*2); ctx.fill();
    // Dome body
    ctx.fillStyle = isCaptured ? '#002233' : '#1a1000';
    ctx.fillRect(cx-17, cy, 34, 14);
    // Dome arc
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 17, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = col; ctx.globalAlpha = 0.15;
    ctx.beginPath(); ctx.arc(cx, cy, 17, Math.PI, 0); ctx.fill();
    ctx.globalAlpha = 1;
    // Radar
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx+12, cy-12, 8, -0.4, Math.PI+0.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+12, cy-12); ctx.lineTo(cx+12, cy-4); ctx.stroke();

  } else if (type === 'airforce') {
    // Trapezoid base
    ctx.fillStyle = '#110022';
    ctx.beginPath();
    ctx.moveTo(cx-20, cy+28); ctx.lineTo(cx+20, cy+28);
    ctx.lineTo(cx+13, cy+14); ctx.lineTo(cx-13, cy+14);
    ctx.closePath(); ctx.fill();
    // Tower
    ctx.fillStyle = isCaptured ? '#220044' : '#1a1000';
    ctx.fillRect(cx-7, cy-22, 14, 36);
    // Control room
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    ctx.strokeRect(cx-10, cy-8, 20, 13);
    ctx.fillStyle = col; ctx.globalAlpha = 0.2;
    ctx.fillRect(cx-10, cy-8, 20, 13);
    ctx.globalAlpha = 1;
    // Cross antenna
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy-22); ctx.lineTo(cx, cy-38); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx-9, cy-32); ctx.lineTo(cx+9, cy-32); ctx.stroke();
  }
  ctx.shadowBlur = 0;
}


// ==================== MARCH DRAWING ====================

function drawMarch(ctx, march, now) {
  const prog = Math.min(1, (now - march.startTime) / MARCH_MS);
  const home = tileCenter(10);
  const tgt  = tileCenter(march.targetId);
  const px   = home.x + (tgt.x - home.x) * prog;
  const py   = home.y + (tgt.y - home.y) * prog;
  const isAtk = march.type === 'attack';
  const lineCol = isAtk ? '#ff2244' : '#2299ff';

  ctx.save();
  ctx.shadowBlur = 8; ctx.shadowColor = lineCol;
  ctx.strokeStyle = lineCol; ctx.lineWidth = 2;
  if (!isAtk) ctx.setLineDash([8, 5]);
  ctx.beginPath(); ctx.moveTo(home.x, home.y); ctx.lineTo(tgt.x, tgt.y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Arrowhead at target
  const angle = Math.atan2(tgt.y - home.y, tgt.x - home.x);
  ctx.save();
  ctx.fillStyle = lineCol; ctx.shadowBlur = 6; ctx.shadowColor = lineCol;
  ctx.beginPath();
  ctx.moveTo(tgt.x, tgt.y);
  ctx.lineTo(tgt.x - 13*Math.cos(angle-0.38), tgt.y - 13*Math.sin(angle-0.38));
  ctx.lineTo(tgt.x - 13*Math.cos(angle+0.38), tgt.y - 13*Math.sin(angle+0.38));
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // Unit badge
  const def = UNIT_DEF[march.unitType] || UNIT_DEF.army;
  ctx.save();
  ctx.shadowBlur = 14; ctx.shadowColor = lineCol;
  ctx.fillStyle = lineCol; ctx.globalAlpha = 0.82;
  ctx.beginPath(); ctx.arc(px, py, 14, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.font = '15px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(def.emoji, px, py);
  ctx.restore();

  // Progress bar
  const bw = 32, bx = px - 16, by = py + 18;
  ctx.fillStyle = '#222';       ctx.fillRect(bx, by, bw, 4);
  ctx.fillStyle = lineCol;      ctx.fillRect(bx, by, bw * prog, 4);
}

// ==================== MARCH STATUS BAR ====================

function updateMarchBar() {
  const bar = document.getElementById('march-bar');
  if (!bar) return;
  if (S.marches.length === 0) { bar.innerHTML = ''; return; }
  const now = Date.now();
  bar.innerHTML = S.marches.map(m => {
    const pct = Math.min(100, Math.round((now - m.startTime) / MARCH_MS * 100));
    const def = UNIT_DEF[m.unitType] || UNIT_DEF.army;
    const label = m.type === 'attack' ? '⚔️攻撃' : '⛏️採集';
    const tname = S.territories[m.targetId] ? S.territories[m.targetId].name : '';
    return `<span class="march-item">${def.emoji}${label}→${tname} <span class="march-pct">${pct}%</span></span>`;
  }).join(' ');
}

// ==================== MAP CLICK ====================

function onMapClick(e) {
  if (!mapCanvas) return;
  const rect = mapCanvas.getBoundingClientRect();
  const sx = CANVAS_W / rect.width, sy = CANVAS_H / rect.height;
  const mx = (e.clientX - rect.left) * sx;
  const my = (e.clientY - rect.top)  * sy;
  const col = Math.floor(mx / TILE_W), row = Math.floor(my / TILE_H);
  if (col < 0 || col >= 5 || row < 0 || row >= 3) return;
  S.selTerritory = row * 5 + col;
  drawWorldMap();
  updateTerrPanel();
}

function updateTerrPanel() {
  const infoEl = document.getElementById('terr-info');
  const btnsEl = document.getElementById('terr-btns');
  if (!infoEl || !btnsEl) return;

  if (S.selTerritory === null) {
    infoEl.textContent = '領地をクリックしてください';
    btnsEl.innerHTML = '';
    return;
  }

  const terr = S.territories[S.selTerritory];
  if (!terr) return;
  const stLbl = { fog:'未探索', visible:'攻撃可能', captured:'占領済み' }[terr.state];
  const stCol = { fog:'#666', visible:'#ff4466', captured:'#44ff88' }[terr.state];
  const myPow = calcDeployPower(terr.type);

  let html = `<span style="color:${stCol}">[${stLbl}]</span> <strong>${terr.name}</strong>`;
  if (terr.state === 'visible')
    html += `<br>要求戦力: <span style="color:#ff8888">${terr.req}</span>　自軍戦力: <span style="color:#88ffff">${Math.round(myPow)}</span>`;
  if (terr.state === 'captured' && terr.type !== 'home')
    html += `<br>採集ゴールド: <span style="color:#ffcc44">💰${terr.gold}G</span>`;
  if (terr.id === 10)
    html += '<br>🏠 プレイヤー本拠地';
  infoEl.innerHTML = html;

  btnsEl.innerHTML = '';
  const noEnergy = S.energy < 1;
  const noUnits  = S.deployed.size === 0;

  if (terr.state === 'visible') {
    if (noUnits) {
      const hint = document.createElement('div');
      hint.className = 'panel-hint'; hint.textContent = '基地でユニットを選択して「出撃！」してください';
      btnsEl.appendChild(hint);
    } else {
      const btn = document.createElement('button');
      btn.className = 'act-btn atk-btn';
      btn.textContent = '⚔️ 攻撃進軍（⚡1消費）';
      btn.disabled = noEnergy;
      btn.addEventListener('click', () => startMarch('attack', terr.id));
      btnsEl.appendChild(btn);
    }
  } else if (terr.state === 'captured' && terr.type !== 'home') {
    if (noUnits) {
      const hint = document.createElement('div');
      hint.className = 'panel-hint'; hint.textContent = '基地でユニットを選択して「出撃！」してください';
      btnsEl.appendChild(hint);
    } else {
      const btn = document.createElement('button');
      btn.className = 'act-btn col-btn';
      btn.textContent = `⛏️ 採集進軍（⚡1消費）💰+${terr.gold}`;
      btn.disabled = noEnergy;
      btn.addEventListener('click', () => startMarch('collect', terr.id));
      btnsEl.appendChild(btn);
    }
  }
}

// ==================== MARCH SYSTEM ====================

function calcDeployPower(targetType) {
  let total = 0;
  for (const idx of S.deployed) {
    const unit = S.board[idx];
    if (!unit) continue;
    let pow = unit.level * unit.level * 10 * (unit.hp / 100);
    // Advantage
    if (targetType !== 'home') {
      if (ADVANTAGE[unit.type] === targetType)          pow *= 1.5;
      else if (ADVANTAGE[targetType] === unit.type)     pow *= 0.75;
    }
    // Hero bonuses
    for (const h of S.heroes) {
      if (h.type === unit.type) pow *= (1 + h.mult);
      if (h.type === 'all')     pow *= (1 + h.mult);
    }
    total += pow;
  }
  return total;
}

function startMarch(type, targetId) {
  if (S.energy < 1) { showToast('エネルギーが不足しています', 'err'); return; }
  const marchingSet = new Set(S.marches.flatMap(m => m.unitIdx));
  const available = [...S.deployed].filter(i => S.board[i] !== null && !marchingSet.has(i));
  if (available.length === 0) { showToast('選択ユニットが進軍中です', 'err'); return; }

  const terr = S.territories[targetId];
  const power = calcDeployPower(terr.type);

  // Dominant type
  const tc = {};
  for (const i of available) { const u = S.board[i]; if (u) tc[u.type] = (tc[u.type]||0)+1; }
  const unitType = Object.entries(tc).sort((a,b)=>b[1]-a[1])[0][0];

  S.energy--;
  S.marches.push({ id: S.marchCounter++, type, targetId, unitIdx: available, unitType, startTime: Date.now(), power });
  S.deployed.clear();
  syncUI(); renderBoard(); updateTerrPanel();
  startMarchLoop();
}

function startMarchLoop() {
  if (S.rafId) return;
  function loop() {
    drawWorldMap();
    updateMarchBar();
    const now = Date.now();
    const done = S.marches.filter(m => now >= m.startTime + MARCH_MS);
    S.marches = S.marches.filter(m => now < m.startTime + MARCH_MS);
    for (const m of done) completeMarch(m);
    if (S.marches.length > 0) {
      S.rafId = requestAnimationFrame(loop);
    } else {
      S.rafId = null;
      drawWorldMap(); updateMarchBar();
    }
  }
  S.rafId = requestAnimationFrame(loop);
}

function completeMarch(march) {
  const terr = S.territories[march.targetId];
  if (march.type === 'attack') {
    if (march.power >= terr.req) {
      // Victory
      terr.state = 'captured';
      S.gold += terr.gold;
      S.rp   += terr.rp;
      S.streak++;
      for (const adj of getAdjacent(march.targetId)) {
        if (S.territories[adj].state === 'fog') S.territories[adj].state = 'visible';
      }
      showToast(`🎉 ${terr.name}を占領！ 💰+${terr.gold}G  🔬+${terr.rp}pt`, 'ok');
      if (S.streak % 3 === 0 && S.heroes.length < 3) grantHero();
      checkWin();
    } else {
      // Defeat
      S.streak = 0;
      for (const i of march.unitIdx) {
        if (S.board[i]) S.board[i].hp = Math.max(5, S.board[i].hp - 30);
      }
      showToast(`💥 攻撃失敗！ユニットがダメージを受けた（要求:${terr.req} / 自軍:${Math.round(march.power)}）`, 'err');
    }
  } else {
    // Collect
    S.gold += terr.gold;
    showToast(`⛏️ 採集完了！ 💰+${terr.gold}G`, 'ok');
  }
  syncUI(); renderBoard(); updateTerrPanel();
}


// ==================== ENERGY TIMER ====================

function startEnergyTimer() {
  if (S.energyInterval) clearInterval(S.energyInterval);
  S.energyInterval = setInterval(() => {
    if (S.energy < S.maxEnergy) {
      S.energy = Math.min(S.maxEnergy, S.energy + 1 + S.research.energyBonus);
      syncUI();
      // Refresh terr panel button states
      if (document.getElementById('worldmap-screen').classList.contains('active')) {
        updateTerrPanel();
      }
    }
  }, 3000);
}

// ==================== HEROES ====================

function grantHero() {
  const available = HERO_POOL.filter(h => !S.heroes.some(e => e.id === h.id));
  if (!available.length) return;
  const hero = available[Math.floor(Math.random() * available.length)];
  S.heroes.push(hero);
  renderHeroes();
  showToast(`🦸 ヒーロー獲得：${hero.emoji} ${hero.name}`, 'hero');
}

function renderHeroes() {
  for (let i = 0; i < 3; i++) {
    const slot = document.getElementById('hs' + i);
    if (!slot) continue;
    const hero = S.heroes[i];
    if (hero) {
      slot.textContent = hero.emoji + ' ' + hero.name;
      slot.classList.remove('empty');
    } else {
      slot.textContent = '空';
      slot.classList.add('empty');
    }
  }
}

// ==================== RESEARCH ====================

function openResearch() {
  const modal = document.getElementById('research-modal');
  if (modal) modal.classList.remove('hidden');
  renderResearch();
}

function closeResearch() {
  const modal = document.getElementById('research-modal');
  if (modal) modal.classList.add('hidden');
}

function renderResearch() {
  setText('modal-rp-val', S.rp);
  const list = document.getElementById('research-list');
  if (!list) return;
  list.innerHTML = '';
  for (const item of RESEARCH_ITEMS) {
    const done    = S.research.unlocked.has(item.id);
    const reqMet  = !item.req || S.research.unlocked.has(item.req);
    const canBuy  = !done && reqMet && S.rp >= item.cost;
    const locked  = !done && !reqMet;
    const el = document.createElement('div');
    el.className = 'ri' + (done ? ' done' : '') + (locked ? ' locked' : '');
    const reqLabel = item.req ? RESEARCH_ITEMS.find(r => r.id === item.req) : null;
    el.innerHTML =
      `<div class="ri-info">` +
        `<div class="ri-name">${item.label}</div>` +
        `<div class="ri-desc">${item.desc}</div>` +
        (locked && reqLabel ? `<div class="ri-req">要: ${reqLabel.label}</div>` : '') +
      `</div>` +
      `<div class="ri-cost">${done ? '✅' : '🔬' + item.cost + 'pt'}</div>`;
    if (!done) {
      const btn = document.createElement('button');
      btn.className = 'ri-buy';
      btn.textContent = '研究';
      btn.disabled = !canBuy;
      btn.addEventListener('click', () => buyResearch(item.id));
      el.appendChild(btn);
    }
    list.appendChild(el);
  }
}

function buyResearch(id) {
  const item = RESEARCH_ITEMS.find(r => r.id === id);
  if (!item || S.research.unlocked.has(id)) return;
  if (item.req && !S.research.unlocked.has(item.req)) { showToast('前提研究が必要です', 'err'); return; }
  if (S.rp < item.cost) { showToast('研究ポイント不足', 'err'); return; }
  S.rp -= item.cost;
  S.research.unlocked.add(id);
  if (id === 'lv6')    S.research.maxLv = 6;
  if (id === 'lv7')    S.research.maxLv = 7;
  if (id === 'lv8')    S.research.maxLv = 8;
  if (id === 'cost')   S.research.costReduction = 2;
  if (id === 'energy') S.research.energyBonus = 1;
  showToast('🔬 研究完了: ' + item.label, 'ok');
  renderResearch();
  syncUI();
}

// ==================== WIN CHECK ====================

function checkWin() {
  const cap = S.territories.filter(t => t.state === 'captured' && t.type !== 'home').length;
  if (cap >= 14) setTimeout(() => showResult('win'), 600);
}

function showResult(outcome) {
  const icon  = document.getElementById('res-icon');
  const title = document.getElementById('res-title');
  const msg   = document.getElementById('res-msg');
  if (outcome === 'win') {
    if (icon)  icon.textContent  = '🏆';
    if (title) { title.textContent = '全領地制圧！'; title.className = 'win'; }
    if (msg)   msg.textContent   = 'すべての敵領地を占領しました！おめでとう！';
  }
  showScreen('result-screen');
}

// ==================== TOAST ====================

let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast-show' + (type ? ' toast-' + type : '');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 2600);
}

// ==================== GAME START ====================

function startGame() {
  initState();
  renderBoard();
  renderHeroes();
  syncUI();
  startEnergyTimer();
  showScreen('base-screen');
}

// ==================== EVENT LISTENERS ====================

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-start')         .addEventListener('click', startGame);
  document.getElementById('btn-help')          .addEventListener('click', () => showScreen('help-screen'));
  document.getElementById('btn-help-back')     .addEventListener('click', () => showScreen('title-screen'));
  document.getElementById('btn-retry')         .addEventListener('click', startGame);
  document.getElementById('btn-to-title')      .addEventListener('click', () => showScreen('title-screen'));
  document.getElementById('btn-deploy')        .addEventListener('click', goToWorldMap);
  document.getElementById('btn-research-close').addEventListener('click', closeResearch);

  document.querySelectorAll('.prod-btn').forEach(btn => {
    btn.addEventListener('click', () => produceUnit(btn.dataset.type));
  });

  document.querySelectorAll('.tab-btn[data-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      if (target === 'research') {
        openResearch();
        return;
      }
      showScreen(target);
      if (target === 'worldmap-screen') {
        drawWorldMap();
        updateTerrPanel();
      }
      // Update active state within same nav
      btn.closest('.nav-tabs').querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b === btn);
      });
    });
  });

  // Close modal on backdrop click
  document.getElementById('research-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeResearch();
  });
});

// ==================== BOOT ====================
showScreen('title-screen');
