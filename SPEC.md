# ビビッドアーミー風 マージ戦略ゲーム — 仕様書

---

## 概要

**ゲーム名**: ビビッドアーミー (VIVID ARMY)  
**ジャンル**: マージ戦略ゲーム  
**技術スタック**: HTML / CSS / Vanilla JavaScript（サーバー不要、ブラウザで直接動作）  
**ファイル構成**: `index.html`（完成済） / `style.css`（完成済） / `game.js`（要書き直し）

---

## 画面構成

| 画面ID | 説明 |
|---|---|
| `#title-screen` | タイトル・メニュー |
| `#help-screen` | 遊び方説明 |
| `#base-screen` | 基地画面（ユニット生産・マージ） |
| `#worldmap-screen` | 世界マップ（領地攻略） |
| `#result-screen` | ゲームクリア / ゲームオーバー |
| `#research-modal` | 研究モーダル（オーバーレイ） |

---

## コアゲームループ

1. **生産**: ゴールド5Gを消費してLv.1ユニットをマージボードに配置
2. **マージ**: 同じ兵種・同じレベルのユニットをD&Dで合成 → Lv.UP
3. **出撃**: ユニットをクリック選択（青枠）→ 世界マップへ移動
4. **攻撃**: 敵領地を選択 → 攻撃進軍 → 勝利で領地占領・報酬獲得
5. **採集**: 占領済み領地に資源採集進軍 → ゴールド獲得
6. **研究**: 研究ポイントを消費してアップグレードをアンロック
7. **クリア**: 全14敵領地占領でゲームクリア

---

## ユニットシステム

### 兵種

| 兵種 | 絵文字 | カラー | 基礎戦力 | 生産コスト |
|---|---|---|---|---|
| 陸軍 | 🪖 | `#4499ff` | 10 | 5G |
| 海軍 | 🚢 | `#00ffaa` | 10 | 5G |
| 空軍 | ✈️ | `#aa44ff` | 10 | 5G |

### レベルと戦力

```
power = level² × basePower(10)
Lv.1 = 10 / Lv.2 = 40 / Lv.3 = 90 / Lv.4 = 160 / Lv.5 = 250 ...
```

- 最大マージレベル: デフォルトLv.5 / 研究でLv.8まで拡張可能
- 合成条件: 同一兵種 + 同一レベル + レベル < 上限

### 三すくみ（属性相性）

```
陸軍🪖 → 空軍✈️（×1.5強） → 海軍🚢（×0.75弱）
海軍🚢 → 陸軍🪖（×1.5強） → 空軍✈️（×0.75弱）
空軍✈️ → 海軍🚢（×1.5強） → 陸軍🪖（×0.75弱）
```

---

## マージボード

- **5列×4行 = 20セル**のグリッド
- 各セル: ユニットカード（兵種アイコン・レベルバッジ・HPバー）
- **ドラッグ&ドロップ**で合成（`draggable="true"` + DataTransfer API）
- **クリック**で出撃ユニット選択（青枠 `.cell-deployed`）
- 合成成功時: `.merge-flash` CSSアニメーション（スケール+グロー）
- 進軍中ユニット: `.cell-marching` クラスでグレーアウト

---

## 世界マップ

### Canvas仕様

- サイズ: `550px × 330px`
- 背景色: `#05050f`（濃紺黒）
- タイル: 110px × 110px（5列×3行 = 15マス）
- タイル中心座標:
  ```
  x = (id % 5) * 110 + 55
  y = Math.floor(id / 5) * 110 + 55
  ```

### 領地ID配置

```
[ 0][ 1][ 2][ 3][ 4]   ← 上段（row 0）
[ 5][ 6][ 7][ 8][ 9]   ← 中段（row 1）
[10][11][12][13][14]   ← 下段（row 2）
 ↑
ID10 = プレイヤー本拠地（左下、最初から占領済み）
```

### 領地の状態

| 状態 | 説明 | 表示 |
|---|---|---|
| `fog` | 未探索 | 暗い `?` マーク、霧エフェクト |
| `visible` | 攻撃可能 | 敵建物・敵戦力表示、赤枠 |
| `captured` | 占領済み | 自軍建物・緑枠 |

- 初期状態: ID10のみ `captured`、隣接する ID11・ID5 が `visible`
- 占領後: 隣接する `fog` 領地が `visible` に変化

### SF建物デザイン（Canvas 2D描画）

各建物は**台形ベースプラットフォーム**の上に描画。`shadowBlur`でネオングロー効果。

| 領地種別 | 建物形状 | メインカラー |
|---|---|---|
| 本拠地(HOME) | 六角ベース＋中央タワー＋ドーム＋アンテナ | `#00ffff` シアン |
| 陸軍領地 | 矩形要塞＋城壁凸部＋砲台 | `#4499ff` ブルー |
| 海軍領地 | 楕円プラットフォーム＋ドーム＋レーダー | `#00ffaa` ティール |
| 空軍領地 | 台形基台＋縦長タワー＋管制室＋十字アンテナ | `#aa44ff` パープル |
| 未探索 | 薄暗い霧＋`?`マーク | `#1a1a3a` |

---

## 進軍アニメーション

- エンジン: `requestAnimationFrame`（60fps、進軍中のみループ）
- 進軍中は `#march-status-bar` にステータス表示

| 進軍種別 | ライン | カラー |
|---|---|---|
| 攻撃進軍 | 実線＋矢印ヘッド＋グロー | `#ff2244` 赤 |
| 資源採集 | 破線＋矢印ヘッド＋グロー | `#2299ff` 青 |

- 兵種アイコン（🪖/🚢/✈️）が**円形バッジ**（色付きグロー）でライン上を移動
- バッジ直下に**プログレスバー**を描画

---

## バトル計算

```
playerPower = Σ ( unitLevel² × 10 × (hp%) × heroBonuses × advantageMultiplier )

advantageMultiplier:
  強い相手 → ×1.5
  弱い相手 → ×0.75
  普通     → ×1.0

if playerPower >= territory.requiredPower:
  WIN → 領地占領 + goldReward + researchReward獲得 + battleStreak++
else:
  LOSE → 出撃ユニットHP -30% + battleStreak = 0
```

---

## ゲーム状態（State）

```javascript
state = {
  gold: 50,
  energy: 10, maxEnergy: 20,
  researchPts: 0,
  board: Array(20).fill(null),   // null | { type, level, id, hp }
  nextUnitId: 1,
  territories: [...],            // 15エントリ
  selectedTerritory: null,
  deployedIndices: new Set(),    // 出撃選択中のboard index
  research: {
    maxMergeLevel: 5,
    unlocked: new Set(),
    costReduction: 0,
    energyBonus: 0
  },
  heroes: [],
  battleStreak: 0,
  marches: [],                   // 進軍中データリスト
  marchIdCounter: 0,
}
```

---

## 研究ツリー

| ID | 内容 | コスト |
|---|---|---|
| `lv6` | Lv.6合成アンロック | 20pt |
| `lv7` | Lv.7合成アンロック | 40pt |
| `lv8` | Lv.8合成アンロック | 80pt |
| `cost` | 生産コスト -2G | 30pt |
| `energy` | エネルギー回復速度 +1 | 25pt |

---

## ヒーローシステム

- **戦闘3連勝**でランダムヒーロー獲得（最大3体スロット）
- ヒーローは**パッシブボーナス**をバトル計算に適用

| ヒーロー名 | ボーナス |
|---|---|
| 陸将ガルシア | 陸軍戦力 +20% |
| 海将アクア | 海軍戦力 +20% |
| 空将ストーム | 空軍戦力 +20% |
| 名将オメガ | 全ユニット戦力 +10% |
| 合成師ミント | 合成コスト -1G |

---

## エネルギー・リソース

| リソース | 用途 | 回復 |
|---|---|---|
| ゴールド | ユニット生産コスト | 採集進軍・領地報酬 |
| エネルギー | 進軍時消費（1進軍=1） | 3秒ごとに+1自動回復（上限20） |
| 研究ポイント | 研究アンロック | 領地占領報酬 |

---

## 勝利・敗北条件

- **ゲームクリア**: 全14敵領地を占領
- **ゲームオーバー**: 現時点では設定なし（継続型）

---

## デザインシステム

- **背景**: `#0a0a1a`（濃紺黒）
- **アクセント**: ピンク `#ff44aa` / シアン `#00ffff`
- **フォント**: モノスペース系
- **グロー効果**: `text-shadow` / `box-shadow` / Canvas `shadowBlur`
- **モバイル対応**: 720px / 400px ブレークポイント

---

## 主要関数一覧

| 関数名 | 役割 |
|---|---|
| `initGame()` | ゲーム初期化、領地・ボード・イベント設定 |
| `showScreen(id)` | 画面切り替え（`-screen` サフィックス付与） |
| `produceUnit(type)` | ゴールド消費、Lv.1ユニットをボードに配置 |
| `renderBoard()` | 20セルをDOMレンダリング、D&D・クリック設定 |
| `attemptMerge(from, to)` | 合成判定・実行、merge-flashアニメーション |
| `renderWorldmap()` | Canvasに全領地描画 |
| `drawHomeBase(ctx,cx,cy)` | 本拠地建物描画 |
| `drawArmyFortress(ctx,cx,cy,color,friendly)` | 陸軍建物描画 |
| `drawNavyDome(ctx,cx,cy,color,friendly)` | 海軍建物描画 |
| `drawAirTower(ctx,cx,cy,color,friendly)` | 空軍建物描画 |
| `launchAttack(territoryId)` | 攻撃進軍開始 |
| `launchGather(territoryId)` | 資源採集進軍開始 |
| `marchLoop(now)` | rAFループ、進行度更新・描画・完了判定 |
| `drawMarch(march,now)` | 進軍ライン・バッジ・プログレスバー描画 |
| `resolveMarch(march)` | 進軍完了処理（バトル計算 or 採集報酬） |
| `calculateBattle(units, td)` | 戦力計算・勝敗判定 |
| `revealNeighbors(id)` | 隣接領地のfog解除 |
| `showResearchModal()` | 研究モーダル表示 |
| `unlockResearch(id)` | 研究アンロック処理 |
| `checkHeroUnlock()` | 3連勝ヒーロー獲得チェック |
| `addLog(msg, cls, screen)` | 基地/マップログに追記 |
| `startEnergyRegen()` | エネルギー自動回復タイマー開始 |

---

*最終更新: 2026-04-05*
