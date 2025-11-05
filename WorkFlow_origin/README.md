# Instagram SNS投稿自動化ワークフロー

このフォルダには、Instagram投稿を自動化するための汎用的なワークフローが含まれています。
index.htmlとキャラクター・画像ルールを用意するだけで、自動的に投稿カレンダーと画像を生成できます。

## 📋 概要

このワークフローは以下の機能を提供します：

1. **事業情報の分析**: index.htmlからビジネス情報を抽出
2. **画像ルール自動生成**: 事業内容からInstagram投稿用の画像一貫性ルールを自動生成（NEW!）
3. **キャラクターCSV自動生成**: 画像を分析して人物/キャラクター/素材の特徴を自動抽出（NEW!）
4. **投稿カレンダー生成**: AIを使用して30日分の投稿計画を作成
5. **画像自動生成**: カレンダーに基づいて画像を自動生成
6. **画像合成**: テキストと画像を組み合わせてInstagram用の投稿画像を作成
7. **既存投稿の考慮**: 過去の投稿内容を加味して重複を避けた新しい投稿を生成

## 🚀 セットアップ手順

### 1. このフォルダを新しいプロジェクトに配置

**このWorkFlow_originフォルダごと**新しいプロジェクトのリポジトリにコピーします。

```bash
# 方法1: WorkFlow_originフォルダごとコピー
cp -r WorkFlow_origin /path/to/your/new-project/

# 方法2: GitHubから直接クローン（このフォルダが既にGitHubにある場合）
git clone <your-repository-url>
cd <repository-name>/WorkFlow_origin
```

### 2. WorkFlow_originフォルダ内で作業

**重要: 以降の全ての作業はWorkFlow_originフォルダ内で行います**

```bash
cd WorkFlow_origin
```

### 3. 必要なファイルを配置

#### a. index.html（必須）
WorkFlow_originフォルダのルートに`index.html`を配置してください。
このファイルから事業内容が自動的に抽出されます。

#### b. キャラクター設定（簡単！画像を配置するだけ）

**方法1: 画像から自動生成（推奨・簡単）**

`character/`フォルダにサブフォルダを作成し、画像ファイルを配置：

```
character/
  ├── 山﨑琢己/
  │   └── 山﨑琢己.png（または .jpg）
  └── 井上陽斗/
      └── 井上陽斗.png
```

その後、以下のコマンドでCSVを自動生成：
```bash
npm run generate-character-csv
```

**方法2: 手動でCSVを作成**

CSVファイルを手動で作成することも可能：

```
character/
  └── キャラクター名/
      └── キャラクター名.csv
```

**CSVフォーマット（ヘッダー行必須）:**
```csv
name,appearance,hair,eyes,face,body,clothing,personality,additional
山﨑琢己,20代後半男性,黒髪短髪,黒い瞳,優しい笑顔,中肉中背,紺色ポロシャツ,穏やかで教育熱心,プログラミング講師
```

#### c. 画像一貫性ルール（自動生成可能）

**方法1: 自動生成（推奨・簡単）**

index.htmlを配置した後、以下のコマンドで自動生成：
```bash
npm run generate-imagerule
```

事業内容に基づいて、3〜5個の画像一貫性ルールが`imagerule/事業名.csv`として自動生成されます。

**方法2: 手動でCSVを作成**

`imagerule/`フォルダにCSVファイルを手動で作成：

```
imagerule/
  ├── 教室風景.csv
  └── オンライン環境.csv
```

**CSVフォーマット（ヘッダー行必須）:**
```csv
name,location,characters,lighting,style,additional
教室風景,明るい教室,1-3人,自然光,明るく清潔感のある,ホワイトボードやPC画面が見える
```

#### d. ブログ記事（オプション）
`posts/`フォルダにブログ記事のHTMLファイルを配置すると、内容が参考にされます。

### 4. 環境変数の設定

`.env`ファイルをWorkFlow_originフォルダのルートに作成し、以下を設定：

```env
# Gemini API Key（必須）
GEMINI_API_KEY=your_gemini_api_key_here

# カレンダー生成日数（デフォルト: 30）
CALENDAR_DAYS=30
```

**Gemini APIキーの取得方法:**
1. [Google AI Studio](https://makersuite.google.com/app/apikey)にアクセス
2. 「Get API Key」をクリック
3. 生成されたAPIキーをコピーして`.env`ファイルに貼り付け

### 5. 依存パッケージのインストール

WorkFlow_originフォルダ内で実行：

```bash
npm install
```

## 🤖 GitHub Actionsでの自動実行（推奨）

### セットアップ手順

新しいリポジトリでGitHub Actionsを使って自動実行する場合：

**ステップ1: WorkFlow_originフォルダを配置**
```bash
# リポジトリのルートにWorkFlow_originフォルダを配置
cp -r WorkFlow_origin /path/to/your/new-repository/
cd /path/to/your/new-repository
```

**ステップ2: GitHub Actionsワークフローをセットアップ**
```bash
# セットアップスクリプトを実行
cd WorkFlow_origin
./setup-github-actions.sh
```

このスクリプトは自動的に：
- リポジトリのルートに `.github/workflows/` ディレクトリを作成
- ワークフローファイルをコピー

**ステップ3: Gemini APIキーを設定**
1. GitHubリポジトリの `Settings` > `Secrets and variables` > `Actions` へ移動
2. `New repository secret` をクリック
3. 名前: `GEMINI_API_KEY`
4. 値: あなたのGemini APIキーを貼り付け

**ステップ4: プッシュ**
```bash
cd ..  # リポジトリのルートに戻る
git add .github/workflows/content-generation.yml WorkFlow_origin/
git commit -m "Add Instagram content generation workflow"
git push
```

### GitHub Actionsワークフローの使い方

ワークフローは以下の3つの方法で実行されます：

1. **手動実行**:
   - GitHubの `Actions` タブ > `Instagram投稿コンテンツ生成` を選択
   - `Run workflow` をクリック
   - パラメータ設定:
     - 生成する投稿日数: デフォルト30日
     - 画像も自動生成する: チェックでGemini API使用

2. **スケジュール実行**: 毎月1日の午前9時（JST）に自動実行

3. **自動実行**: `WorkFlow_origin/index.html` を更新してプッシュすると自動実行

### 生成結果の取得

実行完了後、Artifactsから以下をダウンロード可能：
- `calendar-csv`: 投稿カレンダー（CSV形式）
- `business-summary`: ビジネスサマリー
- `ai-generated-images`: AI生成画像（画像生成を有効にした場合）
- `composed-images`: 合成済み画像（Instagram投稿用）
- `bulk-post-csv`: 一括投稿データ.CSV

## 📖 ローカルでの使い方

### 🚀 クイックスタート（自動セットアップ）

index.htmlと画像を配置したら、以下のコマンドで自動セットアップ：

```bash
npm run setup
```

このコマンドは以下を自動実行：
1. 事業情報の分析
2. 画像一貫性ルールの自動生成
3. キャラクターCSVの自動生成（画像がある場合）

### 基本的な使い方（個別実行）

#### 1. 事業情報を分析
```bash
npm run analyze-homepage
```
`index.html`を分析し、`output/business-summary.txt`に事業情報を保存します。

#### 2. 画像一貫性ルールを自動生成（NEW!）
```bash
npm run generate-imagerule
```
事業内容に基づいて画像一貫性ルールを自動生成し、`imagerule/事業名.csv`に保存します。
既存のCSVファイルがある場合は上書きされます。

#### 3. キャラクターCSVを自動生成（NEW!）
```bash
npm run generate-character-csv
```
`character/`フォルダ内の各サブフォルダにある画像を分析し、人物/キャラクター/素材の特徴を抽出してCSVを生成します。
既存のCSVファイルがある場合は上書きされます。

#### 4. 投稿カレンダーを生成
```bash
npm run generate-calendar
```
AIを使用して投稿カレンダーを生成します。
- 生成されたカレンダーは`calender/calendar_YYYY-MM-DD_HH-mm-ss.csv`に保存
- `output/calendar.csv`にもバックアップを保存
- 既存のカレンダーがある場合は、その内容を考慮して重複を避けた投稿を生成

#### 3. 画像を生成（オプション）
```bash
npm run generate-images
```
カレンダーに基づいて画像を生成します。

#### 4. 画像を合成（オプション）
```bash
npm run compose-images
```
生成した画像とテキストを合成してInstagram用の投稿画像を作成します。

### ワンコマンドで実行

```bash
# カレンダーまで生成
npm run workflow

# 画像生成・合成まで全て実行
npm run workflow-with-images
```

## 📁 フォルダ構造

**このWorkFlow_originフォルダごと新しいプロジェクトに配置します**

```
your-new-project/                  # 新しいプロジェクトのルート
└── WorkFlow_origin/               # このフォルダごと配置
    ├── README.md                  # このファイル
    ├── package.json               # Node.js設定
    ├── .env.example              # 環境変数のサンプル
    ├── .env                      # 環境変数（作成が必要）
    ├── index.html                # 事業内容のホームページ（要配置）
    ├── src/                      # スクリプトフォルダ
    │   ├── analyze-homepage.js      # ホームページ分析
    │   ├── generate-imagerule.js    # 画像ルール自動生成（NEW!）
    │   ├── generate-character-csv.js # キャラクターCSV自動生成（NEW!）
    │   ├── generate-calendar.js     # カレンダー生成
    │   ├── generate-images.js       # 画像生成
    │   └── compose-images.js        # 画像合成
    ├── character/                # キャラクター設定フォルダ
    │   └── キャラクター名/
    │       └── キャラクター名.csv
    ├── imagerule/                # 画像一貫性ルールフォルダ
    │   └── ルール名.csv
    ├── posts/                    # ブログ記事フォルダ（オプション）
    ├── calender/                 # 生成されたカレンダーの保存先
    ├── output/                   # 生成されたファイルの保存先
    └── thanksmessage/            # サンクスメッセージ画像（オプション）
```

## 💡 使用例

### 例1: プログラミング塾の場合（自動生成を活用）

1. WorkFlow_originフォルダを新しいプロジェクトにコピー
2. WorkFlow_originフォルダ内で作業: `cd WorkFlow_origin`
3. プログラミング塾のホームページを`index.html`として配置
4. 講師の写真を`character/山﨑琢己/山﨑琢己.png`として配置
5. `npm install`を実行
6. `npm run setup`を実行（画像ルールとキャラクターCSVが自動生成される）
7. `npm run generate-calendar`を実行
8. 30日分の投稿カレンダーが自動生成される

### 例1-2: 手動でCSVを作成する場合

1. WorkFlow_originフォルダを新しいプロジェクトにコピー
2. WorkFlow_originフォルダ内で作業: `cd WorkFlow_origin`
3. プログラミング塾のホームページを`index.html`として配置
4. 講師のキャラクター設定を`character/山﨑琢己/山﨑琢己.csv`に手動で作成
5. 教室の雰囲気ルールを`imagerule/教室風景.csv`に手動で作成
6. `npm install`を実行
7. `npm run workflow`を実行
8. 30日分の投稿カレンダーが自動生成される

### 例2: 既存の投稿を考慮した新しい投稿の生成

1. 一度カレンダーを生成すると`calender/calendar_2025-11-05_09-46-30.csv`のように保存される
2. 2回目以降にカレンダーを生成すると、既存の投稿内容を読み込んで重複を避けた新しい投稿が生成される
3. 過去の投稿テーマと異なる新しい視点での投稿が自動的に作成される

## 🔧 カスタマイズ

### カレンダー生成日数の変更

`.env`ファイルで`CALENDAR_DAYS`を変更：

```env
CALENDAR_DAYS=60  # 60日分生成
```

### キャラクターの追加

`character/`フォルダに新しいサブフォルダとCSVファイルを追加するだけで、自動的に認識されます。

### 画像ルールの追加

`imagerule/`フォルダに新しいCSVファイルを追加するだけで、自動的に認識されます。

## ⚠️ 注意事項

1. **APIキーの管理**: `.env`ファイルは`.gitignore`に含めて、GitHubにコミットしないようにしてください
2. **画像生成**: 画像生成には時間がかかる場合があります（1投稿あたり数秒〜数十秒）
3. **料金**: Gemini APIの使用には料金が発生する可能性があります

## 📞 サポート

問題が発生した場合は、以下を確認してください：

1. `npm install`が正常に完了したか
2. `.env`ファイルが正しく設定されているか
3. `index.html`が配置されているか
4. キャラクターCSVと画像ルールCSVのフォーマットが正しいか

## 📄 ライセンス

MIT License
