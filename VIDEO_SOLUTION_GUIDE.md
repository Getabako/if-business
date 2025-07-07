# 動画ファイル管理の解決策

## 現在の問題
- 動画ファイルサイズが大きすぎてGitHubにプッシュできない
- lpmoviepc.mp4: 21MB
- lpmoviesp.mp4: 16MB

## 推奨解決策

### 方法1: 動画圧縮（推奨）
**目標:** 各ファイル5MB以下に圧縮

**オンライン圧縮ツール:**
- HandBrake（無料ソフト）
- CloudConvert（オンライン）
- Compressor.io（オンライン）

**設定例:**
- 解像度: 1920x1080 → 1280x720（PC版）
- 解像度: 720x1280 → 480x854（SP版）
- ビットレート: 1-2Mbps
- フォーマット: H.264/MP4

### 方法2: 外部CDNサービス
**Cloudflare R2（推奨）:**
- 月10GB無料
- 高速配信
- 簡単セットアップ

**AWS S3:**
- 信頼性が高い
- 従量課金

**Vercel対応CDN:**
- Uploadcare
- Cloudinary

### 方法3: Git LFS使用
```bash
# Git LFSのインストールと設定
git lfs install
git lfs track "*.mp4"
git add .gitattributes
git add public/videos/*.mp4
git commit -m "Add videos with Git LFS"
git push origin main
```

### 方法4: 動画ホスティングサービス
- Vimeo（プライベート動画対応）
- YouTube（限定公開）
- JW Player

## 実装手順（圧縮を選択した場合）

1. **動画を圧縮**
   - 各ファイルを5MB以下に圧縮
   - 品質をチェック

2. **ファイル置き換え**
   ```bash
   # 圧縮後のファイルをpublic/videos/に配置
   cp compressed_lpmoviepc.mp4 public/videos/lpmoviepc.mp4
   cp compressed_lpmoviesp.mp4 public/videos/lpmoviesp.mp4
   ```

3. **Gitにコミット**
   ```bash
   git add public/videos/*.mp4
   git commit -m "Add compressed video files"
   git push origin main
   ```

## 緊急対応：サーバー動画の修正
現在のサーバー動画が動作しない場合：

1. **CORS設定確認**
   - エックスサーバーの.htaccessでCORS許可
   
2. **ファイルパス確認**
   - https://if-juku.net/wp-content/uploads/videos/lpmoviepc.mp4
   - ブラウザで直接アクセスして確認

3. **一時的にHeroSectionを修正**
   ```typescript
   const getVideoSrc = () => {
     // 動画が読み込めない場合の代替パス
     return null; // 動画を無効化して画像のみ表示
   }
   ```

## 推奨アクション
1. **まず動画圧縮を試す**（最も簡単で効果的）
2. **圧縮後にGitHubにプッシュ**
3. **Vercelで動作確認**