# セットアップガイド

このガイドに従って、ワークフローを新しいプロジェクトでセットアップしてください。

## ✅ セットアップチェックリスト

### ステップ1: WorkFlow_originフォルダを新しいプロジェクトに配置

- [ ] **このWorkFlow_originフォルダごと**新しいプロジェクトにコピー

```bash
# 方法1: 手動でコピー
cp -r WorkFlow_origin /path/to/your/new-project/

# 方法2: GitHubから直接クローン（既にアップロード済みの場合）
git clone <your-repository-url>
cd <repository-name>/WorkFlow_origin
```

- [ ] WorkFlow_originフォルダ内に移動

```bash
cd WorkFlow_origin
```

**重要: 以降の全ての作業はWorkFlow_originフォルダ内で行います**

### ステップ2: 必須ファイルの配置

#### 2.1 index.html（必須）

- [ ] 事業のホームページ（index.html）をWorkFlow_originフォルダのルートに配置
- [ ] 事業内容、サービス、特徴などが記載されていることを確認

#### 2.2 .envファイルの作成（必須）

- [ ] WorkFlow_originフォルダ内で`.env.example`をコピーして`.env`を作成

```bash
cp .env.example .env
```

- [ ] Gemini APIキーを取得: https://makersuite.google.com/app/apikey
- [ ] `.env`ファイルに APIキーを記入

```env
GEMINI_API_KEY=あなたのAPIキー
CALENDAR_DAYS=30
```

### ステップ3: キャラクター設定（簡単！画像を配置するだけ）

**方法A: 画像から自動生成（推奨・簡単）**

- [ ] `character/`フォルダに新しいサブフォルダを作成
- [ ] サブフォルダ内に画像ファイルを配置

**例:**
```
character/
  ├── 山﨑琢己/
  │   └── 山﨑琢己.png（または .jpg）
  ├── 井上陽斗/
  │   └── 井上陽斗.png
  └── 加賀屋結真/
      └── 加賀屋結真.png
```

その後、以下のコマンドでCSVを自動生成：
```bash
npm run generate-character-csv
```

**方法B: 手動でCSVを作成**

- [ ] `character/`フォルダに新しいサブフォルダを作成
- [ ] サブフォルダ内にCSVファイルを配置

**CSVフォーマット:**
```csv
name,appearance,hair,eyes,face,body,clothing,personality,additional
山﨑琢己,20代後半男性,黒髪短髪,黒い瞳,優しい笑顔,中肉中背,紺色ポロシャツ,穏やかで教育熱心,プログラミング講師
```

### ステップ4: 画像一貫性ルールの設定（自動生成可能）

**方法A: 自動生成（推奨・簡単）**

- [ ] index.htmlを配置済みであることを確認

以下のコマンドで自動生成：
```bash
npm run generate-imagerule
```

事業内容に基づいて、3〜5個の画像一貫性ルールが`imagerule/事業名.csv`として自動生成されます。

**方法B: 手動でCSVを作成**

- [ ] `imagerule/`フォルダにCSVファイルを配置

**例:**
```
imagerule/
  ├── 教室風景.csv
  ├── オンライン環境.csv
  └── サイバーパンク空間.csv
```

**CSVフォーマット:**
```csv
name,location,characters,lighting,style,additional
教室風景,明るい教室,1-3人,自然光,明るく清潔感のある,ホワイトボードやPC画面が見える
```

### ステップ5: 依存パッケージのインストール

- [ ] Node.jsがインストールされていることを確認（v16以上推奨）
- [ ] WorkFlow_originフォルダ内で依存パッケージをインストール

```bash
npm install
```

### ステップ6: 動作確認

**全てのコマンドはWorkFlow_originフォルダ内で実行してください**

#### 6.1 クイックセットアップのテスト（推奨）

```bash
npm run setup
```

**期待される結果:**
- `output/business-summary.txt`ファイルが作成される
- `imagerule/事業名.csv`ファイルが作成される
- `character/キャラクター名/キャラクター名.csv`ファイルが作成される（画像がある場合）

#### 6.2 個別テスト

**ホームページ分析:**
```bash
npm run analyze-homepage
```
期待: `output/business-summary.txt`が作成される

**画像ルール生成:**
```bash
npm run generate-imagerule
```
期待: `imagerule/事業名.csv`が作成される

**キャラクターCSV生成:**
```bash
npm run generate-character-csv
```
期待: 各キャラクターフォルダ内にCSVが作成される

**カレンダー生成:**
```bash
npm run generate-calendar
```
期待: `calender/calendar_YYYY-MM-DD_HH-mm-ss.csv`が作成される

## 🎉 セットアップ完了

全てのステップが完了したら、以下のコマンドでワークフローを実行できます：

```bash
# カレンダーまで生成
npm run workflow

# 画像生成・合成まで全て実行（時間がかかります）
npm run workflow-with-images
```

## ❓ トラブルシューティング

### エラー: "GEMINI_API_KEYが設定されていません"

→ `.env`ファイルが作成されているか、APIキーが正しく設定されているか確認してください。

### エラー: "business-summary.txtが見つかりません"

→ 先に`npm run analyze-homepage`を実行してください。

### エラー: "キャラクター設定が見つかりません"

→ `character/`フォルダにサブフォルダとCSVファイルが正しく配置されているか確認してください。

### エラー: "一貫性ルールが見つかりません"

→ `imagerule/`フォルダにCSVファイルが配置されているか確認してください。

## 📧 サポート

さらに質問がある場合は、READMEファイルを参照するか、リポジトリのIssuesで質問してください。
