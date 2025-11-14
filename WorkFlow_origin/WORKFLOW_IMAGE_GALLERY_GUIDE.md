# 📸 ワークフローに画像ギャラリー機能を追加する手順

このガイドでは、GitHub Actionsワークフローに画像ギャラリー機能を追加する方法を説明します。
画像をダウンロードせずに、GitHub上で直接一覧表示できるようになります。

---

## 📋 手順1: 画像生成スクリプトに画像URL保存機能を追加

画像を生成・アップロードするJavaScriptファイル（例: `src/compose-images.js`）の末尾付近に、以下のコードを追加してください。

### 追加場所
画像アップロード処理の最後、`return composedDir;` の前に追加します。

### コピペ用コード

```javascript
    // ========================================
    // 画像ギャラリー用: 画像URLリストをJSONファイルに保存
    // ========================================
    const imageUrlsData = {
      folderName: folderName,
      serverUrl: `https://images.if-juku.net/${folderName}/`,
      totalImages: uploadedImageUrls.length,
      composedImages: uploadedImageUrls,
      thanksMessages: thanksMessageUrls || [],
      generatedAt: new Date().toISOString()
    };

    const imageUrlsPath = join(__dirname, '..', 'output', 'image-urls.json');
    writeFileSync(imageUrlsPath, JSON.stringify(imageUrlsData, null, 2), 'utf-8');
    console.log(`📄 画像URLリストを保存: ${imageUrlsPath}\n`);
```

**注意事項:**
- `uploadedImageUrls` 変数が画像URL配列として存在していることを確認してください
- `folderName` 変数がサーバー上のフォルダ名として存在していることを確認してください
- `serverUrl` のドメインは、実際のサーバーURLに合わせて変更してください

---

## 📋 手順2: ワークフローYAMLファイルに画像URLのArtifactアップロードを追加

`.github/workflows/あなたのワークフロー.yml` ファイルに、以下のステップを追加します。

### 追加場所
他のArtifactアップロードステップの後、結果をコミットするステップの前に追加します。

### コピペ用コード

```yaml
      # 画像URLリストをアップロード
      - name: 画像URLリストをアップロード
        if: ${{ github.event.inputs.generate_images == 'true' || github.event_name == 'push' }}
        uses: actions/upload-artifact@v4
        with:
          name: image-urls
          path: WorkFlow_origin/output/image-urls.json
          retention-days: 90
```

**注意事項:**
- `if` 条件は、画像生成が実行される条件に合わせて変更してください
- `path` は、手順1で保存した `image-urls.json` のパスに合わせてください

---

## 📋 手順3: ワークフローYAMLファイルに画像ギャラリー生成ステップを追加

同じYAMLファイルに、以下のステップを追加します。

### 追加場所
結果をコミットするステップの後、完了メッセージのステップの前に追加します。

### コピペ用コード（4枚ずつ表示版）

```yaml
      # 画像ギャラリーをJob Summaryに表示
      - name: 画像ギャラリーを生成
        if: ${{ github.event.inputs.generate_images == 'true' || github.event_name == 'push' }}
        working-directory: WorkFlow_origin
        run: |
          echo "# 📸 生成された画像ギャラリー" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY

          # image-urls.jsonが存在するか確認
          if [ -f "output/image-urls.json" ]; then
            # JSONから情報を取得
            FOLDER_NAME=$(cat output/image-urls.json | grep -o '"folderName": "[^"]*"' | cut -d'"' -f4)
            SERVER_URL=$(cat output/image-urls.json | grep -o '"serverUrl": "[^"]*"' | cut -d'"' -f4)
            TOTAL_IMAGES=$(cat output/image-urls.json | grep -o '"totalImages": [0-9]*' | grep -o '[0-9]*')

            echo "## 📊 概要" >> $GITHUB_STEP_SUMMARY
            echo "" >> $GITHUB_STEP_SUMMARY
            echo "- **サーバーフォルダ**: \`${FOLDER_NAME}\`" >> $GITHUB_STEP_SUMMARY
            echo "- **合成画像数**: ${TOTAL_IMAGES}枚" >> $GITHUB_STEP_SUMMARY
            echo "- **サーバーURL**: [${SERVER_URL}](${SERVER_URL})" >> $GITHUB_STEP_SUMMARY
            echo "" >> $GITHUB_STEP_SUMMARY

            echo "## 🖼️ 画像プレビュー（4枚ずつ表示）" >> $GITHUB_STEP_SUMMARY
            echo "" >> $GITHUB_STEP_SUMMARY

            # 画像URLを配列として読み込み
            URLS=$(cat output/image-urls.json | grep -o '"https://images.if-juku.net/[^"]*"' | tr -d '"')

            # カウンター
            COUNT=0
            POST_NUM=1

            # 各画像URLをループ
            for URL in $URLS; do
              # 4枚ごとに投稿番号を表示
              if [ $((COUNT % 4)) -eq 0 ]; then
                if [ $COUNT -gt 0 ]; then
                  echo "" >> $GITHUB_STEP_SUMMARY
                fi
                echo "### 📅 投稿 ${POST_NUM}" >> $GITHUB_STEP_SUMMARY
                echo "" >> $GITHUB_STEP_SUMMARY
                echo "| 表紙 | 内容1 | 内容2 | 内容3 |" >> $GITHUB_STEP_SUMMARY
                echo "|------|-------|-------|-------|" >> $GITHUB_STEP_SUMMARY
                echo -n "| " >> $GITHUB_STEP_SUMMARY
                POST_NUM=$((POST_NUM + 1))
              fi

              # 画像を表示（サムネイル）
              echo -n "[![]($URL)]($URL) | " >> $GITHUB_STEP_SUMMARY

              # 4枚目の後に改行
              if [ $((COUNT % 4)) -eq 3 ]; then
                echo "" >> $GITHUB_STEP_SUMMARY
              fi

              COUNT=$((COUNT + 1))
            done

            echo "" >> $GITHUB_STEP_SUMMARY
            echo "" >> $GITHUB_STEP_SUMMARY
            echo "---" >> $GITHUB_STEP_SUMMARY
            echo "" >> $GITHUB_STEP_SUMMARY
            echo "💡 **画像をクリックすると拡大表示されます**" >> $GITHUB_STEP_SUMMARY
          else
            echo "⚠️ 画像URLリストが見つかりませんでした" >> $GITHUB_STEP_SUMMARY
          fi
```

**注意事項:**
- `working-directory` は、`image-urls.json` が存在するディレクトリに合わせてください
- `URLS=$(cat output/image-urls.json | grep -o '"https://images.if-juku.net/[^"]*"' | tr -d '"')` の部分で、ドメインを実際のサーバーURLに変更してください
- 表のヘッダー（`| 表紙 | 内容1 | 内容2 | 内容3 |`）は、任意のテキストに変更できます

---

## 🎨 カスタマイズオプション

### 1列に表示する枚数を変更する

**3枚ずつ表示したい場合:**

```yaml
# 以下の3箇所を変更
if [ $((COUNT % 3)) -eq 0 ]; then    # 4 → 3
echo "| 画像1 | 画像2 | 画像3 |" >> $GITHUB_STEP_SUMMARY    # 列数を3つに
if [ $((COUNT % 3)) -eq 2 ]; then    # 4 → 3, 3 → 2 (0-indexedなので)
```

**5枚ずつ表示したい場合:**

```yaml
# 以下の3箇所を変更
if [ $((COUNT % 5)) -eq 0 ]; then    # 4 → 5
echo "| 画像1 | 画像2 | 画像3 | 画像4 | 画像5 |" >> $GITHUB_STEP_SUMMARY    # 列数を5つに
if [ $((COUNT % 5)) -eq 4 ]; then    # 4 → 5, 3 → 4 (0-indexedなので)
```

### 表のヘッダーを変更する

```yaml
# 任意のテキストに変更可能
echo "| 1枚目 | 2枚目 | 3枚目 | 4枚目 |" >> $GITHUB_STEP_SUMMARY
echo "| Image A | Image B | Image C | Image D |" >> $GITHUB_STEP_SUMMARY
```

### グループ名を変更する

```yaml
# 「投稿」を別の名前に変更
echo "### 📅 投稿 ${POST_NUM}" >> $GITHUB_STEP_SUMMARY
# ↓
echo "### 📸 画像セット ${POST_NUM}" >> $GITHUB_STEP_SUMMARY
echo "### 🎨 デザイン ${POST_NUM}" >> $GITHUB_STEP_SUMMARY
```

---

## ✅ 動作確認

1. 上記3つの手順をすべて完了したら、GitHubにプッシュします
2. GitHub Actionsでワークフローを実行します
3. ワークフロー実行後、「Summary」タブを開きます
4. 📸 生成された画像ギャラリーが表示されることを確認します

---

## 📚 参考実装

実装済みのワークフロー: `.github/workflows/content-generation.yml`

- 手順1の実装: `WorkFlow_origin/src/compose-images.js` (882-894行目)
- 手順2の実装: `.github/workflows/content-generation.yml` (115-121行目)
- 手順3の実装: `.github/workflows/content-generation.yml` (141-205行目)

---

## 🔧 トラブルシューティング

### 画像が表示されない場合

1. `image-urls.json` が正しく生成されているか確認
2. ワークフローログで「画像URLリストを保存」のログが出力されているか確認
3. `grep` のURLパターンが実際の画像URLと一致しているか確認

### JSONファイルが見つからない場合

1. 手順1の `writeFileSync` が実行されているか確認
2. `output` フォルダが存在しているか確認
3. ワークフローの `working-directory` が正しいか確認

### 画像URLが取得できない場合

1. `grep -o '"https://images.if-juku.net/[^"]*"'` のドメイン部分を実際のサーバーURLに変更
2. `image-urls.json` の中身を確認して、URLのフォーマットが正しいか確認

---

**作成日**: 2025-11-14
**対応ワークフロー**: GitHub Actions (Ubuntu runner)
