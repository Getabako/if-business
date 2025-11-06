import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 画像ファイルかどうかを判定
 */
function isImageFile(filename) {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

/**
 * 画像をBase64エンコード
 */
function imageToBase64(imagePath) {
  const imageBuffer = readFileSync(imagePath);
  return imageBuffer.toString('base64');
}

/**
 * 画像のMIMEタイプを取得
 */
function getImageMimeType(filename) {
  const ext = filename.toLowerCase();
  if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) return 'image/jpeg';
  if (ext.endsWith('.png')) return 'image/png';
  if (ext.endsWith('.gif')) return 'image/gif';
  if (ext.endsWith('.webp')) return 'image/webp';
  if (ext.endsWith('.bmp')) return 'image/bmp';
  return 'image/jpeg'; // デフォルト
}

/**
 * 画像から人物/キャラクター/素材の特徴を抽出してCSVを生成
 */
async function analyzeImageAndGenerateCSV(imagePath, characterName, genAI, customPrompt = '') {
  try {
    console.log(`   📸 画像を分析中: ${imagePath}`);

    const imageBase64 = imageToBase64(imagePath);
    const mimeType = getImageMimeType(imagePath);

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const basePrompt = `
この画像を詳細に分析して、以下の情報をCSV形式で出力してください。

${customPrompt ? `\n# 追加の指示\n${customPrompt}\n` : ''}

# 分析対象
画像に写っている人物、キャラクター、または素材の視覚的特徴を抽出してください。

# 出力項目（CSV形式）
1. name: 名前（${characterName}）
2. appearance: 外見の概要（年齢層、性別、全体的な印象）
3. hair: 髪の特徴（色、長さ、スタイル）
4. eyes: 目の特徴（色、形、印象）
5. face: 顔の特徴（表情、特徴的な部分）
6. body: 体型（背の高さ、体格）
7. clothing: 服装（色、スタイル、特徴）
8. personality: 性格や雰囲気（画像から推測される印象）
9. additional: その他の特徴（アクセサリー、小物、背景など）

# 重要な注意点
- **日本語で記述してください**
- **具体的で詳細な描写をしてください**（AIが画像生成できるレベルの詳細さ）
- フィールドにカンマが含まれる場合は、全体をダブルクォートで囲んでください
- **ヘッダー行は不要です。データ行のみを1行で出力してください**
- 人物以外の素材（ロゴ、オブジェクトなど）の場合も、視覚的特徴を同じフォーマットで記述

# 出力例（ヘッダーなし、データ行のみ）
${characterName},20代後半男性,黒髪短髪,黒い瞳,優しい笑顔,中肉中背,紺色ポロシャツ,穏やかで教育熱心,プログラミング講師として活動

**重要: ヘッダー行（name,appearance,...）は出力しないでください。データ行のみを1行で出力してください。**
`;

    const result = await model.generateContent([
      basePrompt,
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType
        }
      }
    ]);

    const response = await result.response;
    let csvData = response.text().trim();

    // コードブロックのマークダウンを削除
    csvData = csvData.replace(/```csv\n/g, '').replace(/```\n/g, '').replace(/```/g, '');

    // 改行を削除（1行にする）
    csvData = csvData.split('\n').filter(line => {
      const trimmed = line.trim();
      // ヘッダー行をスキップ
      return trimmed && !trimmed.startsWith('name,');
    }).join('');

    return csvData;
  } catch (error) {
    console.error(`   ❌ 画像分析エラー: ${error.message}`);
    return null;
  }
}

/**
 * characterフォルダを走査してCSVを生成
 */
async function generateCharacterCSVs() {
  try {
    console.log('👤 キャラクター/素材のCSVを自動生成中...\n');

    // APIキーの確認
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEYが設定されていません。.envファイルを確認してください。');
    }

    // 修正プロンプトの取得（環境変数から）
    const customPrompt = process.env.CUSTOM_PROMPT || '';
    if (customPrompt) {
      console.log(`📝 カスタムプロンプト: ${customPrompt}\n`);
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // characterフォルダのパス
    const characterDir = join(__dirname, '..', 'character');
    if (!existsSync(characterDir)) {
      mkdirSync(characterDir, { recursive: true });
      console.log('📁 characterフォルダを作成しました\n');
      console.log('⚠️  characterフォルダ内にサブフォルダと画像を配置してから再度実行してください。');
      return;
    }

    // サブフォルダをリストアップ
    const folders = readdirSync(characterDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    if (folders.length === 0) {
      console.log('⚠️  characterフォルダ内にサブフォルダが見つかりませんでした。');
      return;
    }

    console.log(`📁 ${folders.length}個のフォルダを発見しました\n`);

    let processedCount = 0;
    let skippedCount = 0;
    let updatedCount = 0;

    for (const folderName of folders) {
      const folderPath = join(characterDir, folderName);
      const csvPath = join(folderPath, `${folderName}.csv`);

      console.log(`\n📂 処理中: ${folderName}`);

      // 既存のCSVファイルをチェック
      const existingCSV = existsSync(csvPath);

      // 既存CSVがあり、カスタムプロンプトがない場合はスキップ
      if (existingCSV && !customPrompt) {
        console.log(`   ℹ️  既存のCSVがあります。カスタムプロンプトが指定されていないためスキップします。`);
        skippedCount++;
        continue;
      }

      // フォルダ内の画像ファイルを探す
      const files = readdirSync(folderPath);
      const imageFiles = files.filter(file => isImageFile(file));

      if (imageFiles.length === 0) {
        console.log(`   ⚠️  画像ファイルが見つかりません。スキップします。`);
        skippedCount++;
        continue;
      }

      // 最初の画像を使用
      const imagePath = join(folderPath, imageFiles[0]);
      console.log(`   🖼️  使用する画像: ${imageFiles[0]}`);

      // 既存CSVがある場合は内容を読み込む
      let existingContent = '';
      if (existingCSV) {
        const csvContent = readFileSync(csvPath, 'utf-8');
        const lines = csvContent.split('\n').filter(line => line.trim() && !line.startsWith('name,'));
        if (lines.length > 0) {
          existingContent = lines[0];
          console.log(`   📄 既存のCSV内容を読み込みました`);
        }
      }

      // プロンプトを調整（既存内容がある場合）
      let finalPrompt = customPrompt;
      if (existingContent && customPrompt) {
        finalPrompt = `既存のキャラクター情報:\n${existingContent}\n\n上記の既存情報に以下の指示を反映して、内容を修正・追記してください:\n${customPrompt}`;
        console.log(`   ✏️  既存内容の更新モード`);
      }

      // 画像を分析してCSVデータを生成
      const csvData = await analyzeImageAndGenerateCSV(imagePath, folderName, genAI, finalPrompt);

      if (!csvData) {
        console.log(`   ❌ CSV生成に失敗しました。スキップします。`);
        skippedCount++;
        continue;
      }

      // CSVファイルを保存
      const header = 'name,appearance,hair,eyes,face,body,clothing,personality,additional';
      const fullCSV = header + '\n' + csvData;

      writeFileSync(csvPath, fullCSV, 'utf-8');

      if (existingCSV) {
        console.log(`   ✅ CSVを更新しました: ${csvPath}`);
        updatedCount++;
      } else {
        console.log(`   ✅ CSVを生成しました: ${csvPath}`);
        processedCount++;
      }

      // APIレート制限を避けるため、少し待機
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n\n📊 処理結果:');
    console.log(`   ✅ 新規作成: ${processedCount}個`);
    console.log(`   ✏️  更新: ${updatedCount}個`);
    console.log(`   ⚠️  スキップ: ${skippedCount}個`);
    console.log(`   📁 合計: ${folders.length}個\n`);

    if (processedCount > 0 || updatedCount > 0) {
      console.log('✨ キャラクター/素材のCSV生成が完了しました！\n');
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    process.exit(1);
  }
}

// メイン処理
generateCharacterCSVs();
