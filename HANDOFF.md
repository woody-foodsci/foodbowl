# Food Science Bowl — 引き継ぎドキュメント（フェーズ4着手前）

## プロジェクト概要

IFT Food Science College Bowl の練習用PWA。  
UGA食品科学博士課程学生（ポスドクでUWに移籍予定）が個人開発。

| 項目 | 内容 |
|------|------|
| 公開URL | https://woody-foodsci.github.io/foodbowl |
| リポジトリ | https://github.com/woody-foodsci/foodbowl |
| ローカル | ~/Documents/GitHub/foodbowl/ |
| デプロイ | git push → GitHub Pages（1〜2分で自動反映） |

---

## ファイル構成

```
foodbowl/
├── index.html      ← アプリ本体（HTML/CSS/JS）
├── questions.js    ← 問題データ（QUESTIONS配列・DIFFICULTIES配列）
├── sw.js           ← Service Worker（オフライン対応）
├── manifest.json   ← PWAマニフェスト
└── HANDOFF.md      ← このファイル
```

**重要：** フェーズ4（Supabase導入）で questions.js をDBに移行する。それまでは questions.js に問題を追加していく。

---

## 技術スタック

- **言語：** HTML / CSS / JavaScript（フレームワークなし）
- **PWA：** Service Worker + Web App Manifest
- **ホスティング：** GitHub Pages（SSH経由でpush済み）
- **データ保存：** localStorage（3キー使用中 → 後述）
- **音声：** Web Speech API（ブラウザ内蔵TTS、英語）
- **フォント：** Google Fonts（Syne + JetBrains Mono）

### カラーパレット

```css
--bg:      #0a0f0d   /* 背景 */
--surface: #111a16   /* カード背景 */
--border:  #1e2e26   /* ボーダー */
--accent:  #00c896   /* メインカラー（緑） */
--accent2: #00ffb3   /* ホバー */
--danger:  #ff4f5e   /* 不正解・警告 */
--text:    #e8f5f0   /* テキスト */
--muted:   #5a7a6e   /* サブテキスト */
--font-d:  'Syne', sans-serif
--font-m:  'JetBrains Mono', monospace
```

---

## localStorage キー一覧

| キー | 内容 | 形式 |
|------|------|------|
| `foodbowl_tracking` | カテゴリ別累積正答率 | `{ chemistry: { correct, total }, ... }` |
| `foodbowl_history` | 過去ラウンド履歴（最新20件） | `[{ ts, score, total, cat, diff, pct }]` |
| `foodbowl_wrong` | 不正解問題の問題文リスト | `["問題文", ...]` |
| `foodbowl_settings` | ホーム画面の設定（永続化） | `{ category, timerSec, qType, qCount, difficulty }` |

新しいデータを追加する場合は**必ず別キーを使う**（既存キーを上書きしない）。

---

## 問題データ

### 構成（計148問）

| カテゴリ | MCQ | SA | 合計 |
|---------|-----|----|------|
| Food Chemistry | 31 | 1 | 32 |
| Microbiology | 26 | 1 | 27 |
| Processing | 26 | 1 | 27 |
| Regulations | 20 | 1 | 21 |
| Sensory Science | 20 | 1 | 21 |
| Nutrition | 20 | 0 | 20 |
| **合計** | **143** | **5** | **148** |

### 問題フォーマット（MCQ）

```js
{
  cat: 'chemistry',           // カテゴリ（小文字）
  q: '問題文',
  opts: ['A', 'B', 'C', 'D'], // 選択肢（シャッフルされる）
  ans: 0,                     // 正解インデックス（0-3、シャッフル前）
  exp: '解説文',
  type: 'mcq',                // forEach で自動付与（省略可）
  diff: 2                     // 1=Easy / 2=Medium / 3=Hard（DIFFICULTIES配列で設定）
}
```

### 問題フォーマット（SA）

```js
{
  cat: 'chemistry',
  q: '問題文',
  answers: ['正解1', '正解2', '略語'],  // 正規化後に照合（大小文字・記号無視）
  exp: '解説文',
  type: 'sa',                           // 必須（明示的に指定）
  diff: 1                               // 必須（DIFFICULTIES配列に含まれないので直書き）
}
```

### 難易度設定の仕組み

```js
const DIFFICULTIES = [/* 143個の数値（MCQ分のみ） */];

QUESTIONS.forEach((q, i) => {
  q.diff = q.diff || DIFFICULTIES[i] || 2;  // SA問題はdiff直書きなので上書きされない
  if (!q.type) q.type = 'mcq';
});
```

**注意：** SA問題（インデックス143〜）は `DIFFICULTIES[i]` が `undefined` になるため、`diff` を問題オブジェクト内に直書きすること。

---

## stateオブジェクト

```js
let state = {
  category:     'all',    // 選択中カテゴリ
  difficulty:   'all',    // 'all'|'1'|'2'|'3'|'adaptive'
  qType:        'mcq',    // 'mcq'|'sa'|'both'
  qCount:       20,       // 出題数（0=All In）
  timerSec:     30,       // 0|15|30|60
  deck:         [],       // 出題順に並んだ問題配列
  idx:          0,        // 現在の問題インデックス
  score:        0,
  streak:       0,
  bestStreak:   0,
  answered:     false,
  timerInterval: null,
  adaptiveDiff: 2,        // adaptive モードの現在難易度
  recentAnswers: [],      // 直近の正誤（adaptive判定用）
  reviewMode:   false,
  _copyText:    ''        // 結果コピー用の文字列（内部用）
};
```

---

## 主要関数

| 関数 | 役割 |
|------|------|
| `init()` | イベントリスナー登録・設定復元・起動 |
| `startQuiz()` | デッキ構築→quiz画面へ |
| `startReviewMode()` | 不正解問題だけでデッキ構築 |
| `renderQuestion()` | MCQ/SAを判別して問題を描画 |
| `handleAnswer(btn, chosen, correct, opts, exp)` | MCQ回答処理 |
| `handleSASubmit()` | SA回答処理 |
| `applyResult(correct)` | 共通スコア更新（MCQ/SA両方から呼ぶ） |
| `timeUp()` | タイムアウト処理 |
| `nextQuestion()` | 次へ or showResult() |
| `quitToResult()` | 途中終了→回答済み分で結果表示 |
| `showResult()` | 結果画面描画 |
| `evaluateAdaptive()` | 5問ごとにadaptive難易度を調整 |
| `normalizeAnswer(str)` | SA照合用テキスト正規化 |
| `checkSAAnswer(input, answers)` | SA正誤判定 |
| `saveSettings()` | ホーム設定をlocalStorageに保存 |
| `applySavedSettings()` | 起動時に設定を復元しボタンに反映 |
| `recordRound(...)` | ラウンド履歴をlocalStorageに記録 |
| `renderHistoryChart()` | SVG折れ線グラフを描画 |
| `recordAnswer(cat, correct)` | カテゴリ別正答率を更新 |
| `addWrong(q)` / `removeWrong(q)` | 不正解リストの追加・削除 |

---

## 実装済み機能（フェーズ1〜3完了）

### フェーズ1：ゲーム基本機能 ✅
- カテゴリ選択（6カテゴリ）
- タイマーモード（Off / 15s / 30s / 60s）
- ストリーク表示（連続正解、アニメーション付き）
- 音声読み上げ（Web Speech API）
- 回答後に解説表示
- 問題・選択肢のシャッフル
- 結果画面（スコア・ベストストリーク）

### フェーズ2：コンテンツ ✅
- 問題数 148問（MCQ 143 + SA 5）
- カテゴリフィルター

### フェーズ3：学習支援 ✅
- カテゴリ別累積正答率トラッキング（バーグラフ、色分け）
- スコア履歴グラフ（SVG折れ線、最新10ラウンド）
- 難易度タグ（1/2/3）+ 適応型出題（5問ごとに自動調整）
- 間違い復習モード（不正解問題のみ再出題）
- 問題数セレクター（10/20/30/50/All In）
- 途中終了ボタン（回答済み分で結果表示）
- Short Answer（SA）問題タイプ（自動正誤判定・略語対応）
- 設定の永続化（リロードしても設定が保持される）
- キーボードショートカット（A/B/C/D選択、Space次へ）
- 結果クリップボードコピー

---

## フェーズ4：ユーザー機能（次のフェーズ）

**使用予定サービス：** Supabase（無料プランで開始）  
**このフェーズで index.html の1ファイル原則を終了する**

### 4-1. ユーザー登録・ログイン
- メール or Google OAuth でサインアップ
- Supabase Auth を使用

### 4-2. 問題の投稿・レビュー機能
- ログインユーザーが問題を作成・投稿
- 投稿問題は `status: pending` で保存
- 管理者（開発者）が承認 → `status: published` で公開
- 投稿フォーマット：`{ cat, q, opts, ans, exp, type, diff, status, author_id }`

### 4-3. ランキング機能
- 全ユーザーのラウンドスコアをSupabaseに保存
- カテゴリ別・全体・週間/全期間でフィルター

---

## フェーズ5：ソーシャル（発展）

### 5-1. チーム対戦モード
- Supabase Realtime を使用した早押しシミュレーション

### 5-2. スコアシェア・OGP
- SNSシェアボタン
- OGP画像の自動生成

---

## 開発時の注意事項

1. **1ファイル原則：** フェーズ4着手まで index.html にすべて集約
2. **localStorage：** 新データは必ず新キーを使う（既存4キーは触らない）
3. **SA問題の diff：** 問題オブジェクト内に直書き（DIFFICULTIES配列は143個でSA分がない）
4. **MCQ問題の diff：** DIFFICULTIES配列で一括管理（インデックス順に対応）
5. **sw.js キャッシュ：** 現在 `foodbowl-v2`。ファイル構成変更時はバージョンを上げる
6. **GitHub Pages：** SSH経由でpush（`git push origin main`）、1〜2分で反映

---

## コミット履歴

| コミット | 内容 |
|---------|------|
| `8d5bf4e` | 設定永続化・キーボードショートカット・クリップボードコピー |
| `90d78ff` | SA問題のdiff値が上書きされるバグを修正 |
| `5502e52` | Short Answerタイプ追加（自動正誤判定） |
| `8548349` | 問題数セレクター・途中終了機能 |
| `8ace154` | フェーズ3全機能（履歴グラフ・適応難易度・復習モード） |
| `4eea87f` | Initial Version（フェーズ1-2完成） |
