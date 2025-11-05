import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * CSV行をパース（クォート対応）
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * キャラクターフォルダから全キャラクター名を取得
 */
function getCharacterNames() {
  const characterDir = join(__dirname, '..', 'character');

  if (!existsSync(characterDir)) {
    console.log('⚠️  キャラクターフォルダが見つかりません');
    return [];
  }

  const folders = readdirSync(characterDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  return folders;
}

/**
 * プロンプト内にキャラクター名が含まれているか検出
 */
function detectCharacterInPrompt(prompt) {
  const characters = getCharacterNames();

  for (const character of characters) {
    if (prompt.includes(character)) {
      console.log(`  🎭 キャラクター検出: ${character}`);
      return character;
    }
  }

  return null;
}

/**
 * キャラクター画像を全て読み込んでBase64配列に変換
 * フォルダ内の全ての.png/.jpg/.jpeg画像を読み込む
 * @returns {Array} [{ data: base64String, mimeType: string }, ...] または null
 */
function loadCharacterImages(characterName) {
  const characterDir = join(__dirname, '..', 'character', characterName);

  if (!existsSync(characterDir)) {
    console.log(`  ⚠️  キャラクターフォルダが見つかりません: ${characterDir}`);
    return null;
  }

  try {
    // フォルダ内の全ファイルを取得
    const files = readdirSync(characterDir);

    // 画像ファイルのみをフィルタ（.png, .jpg, .jpeg）
    const imageFiles = files.filter(file => {
      const ext = file.toLowerCase();
      return ext.endsWith('.png') || ext.endsWith('.jpg') || ext.endsWith('.jpeg');
    });

    if (imageFiles.length === 0) {
      console.log(`  ⚠️  キャラクター画像が見つかりません: ${characterDir}`);
      return null;
    }

    // 全画像を読み込んでBase64に変換
    const images = [];
    for (const file of imageFiles) {
      const imagePath = join(characterDir, file);
      const imageBuffer = readFileSync(imagePath);
      const base64Data = imageBuffer.toString('base64');

      // MIMEタイプを判定
      let mimeType = 'image/png';
      if (file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.jpeg')) {
        mimeType = 'image/jpeg';
      }

      images.push({
        data: base64Data,
        mimeType: mimeType,
        filename: file
      });
    }

    console.log(`  📸 ${images.length}枚の参照画像を読み込みました: ${imageFiles.join(', ')}`);
    return images;

  } catch (error) {
    console.error(`  ❌ キャラクター画像の読み込みに失敗: ${error.message}`);
    return null;
  }
}

/**
 * Gemini APIで画像を生成（fetchを直接使用）
 * @param {string} apiKey - Gemini API key
 * @param {string} prompt - 画像生成プロンプト
 * @param {number} index - 画像インデックス
 * @param {string|null} characterName - キャラクター名（image-to-imageの場合）
 */
async function generateImage(apiKey, prompt, index, characterName = null) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;

    // パーツ配列を準備
    const parts = [];

    // キャラクター名が指定されている場合、image-to-imageで生成
    if (characterName) {
      const characterImages = loadCharacterImages(characterName);

      if (characterImages && characterImages.length > 0) {
        console.log(`  📸 Image-to-Image モード: ${characterName}を使用（${characterImages.length}枚の参照画像）`);

        // 全てのキャラクター画像をパーツに追加
        for (const image of characterImages) {
          parts.push({
            inlineData: {
              mimeType: image.mimeType,
              data: image.data
            }
          });
        }

        // プロンプトを強化（キャラクターの特徴を維持）
        const enhancedPrompt = `CRITICAL: Keep the person EXACTLY as shown in the reference images. DO NOT change their face, facial features, hairstyle, hair color, skin tone, or clothing style. The person's identity and appearance must remain 100% identical across all reference images. Only change the background, setting, and pose to match this scene: ${prompt}. IMPORTANT: NO TEXT, NO LETTERS, NO WORDS, NO WRITING, NO SIGNS WITH TEXT in the image, use blank signs and clean surfaces without any text or characters.`;
        parts.push({ text: enhancedPrompt });
      } else {
        // キャラクター画像が見つからない場合は通常のtext-to-imageにフォールバック
        console.log(`  ⚠️  キャラクター画像が見つからないため、text-to-imageで生成します`);
        const enhancedPrompt = `Modern Japanese people, ${prompt}. IMPORTANT: NO TEXT, NO LETTERS, NO WORDS, NO WRITING, NO SIGNS WITH TEXT, blank signs, clean surfaces without any text or characters`;
        parts.push({ text: enhancedPrompt });
      }
    } else {
      // キャラクターなし - text-to-imageで生成
      console.log(`  🎨 Text-to-Image モード`);
      const enhancedPrompt = `Modern Japanese people, ${prompt}. IMPORTANT: NO TEXT, NO LETTERS, NO WORDS, NO WRITING, NO SIGNS WITH TEXT, blank signs, clean surfaces without any text or characters`;
      parts.push({ text: enhancedPrompt });
    }

    const requestBody = {
      contents: [{
        parts: parts
      }],
      generationConfig: {
        responseModalities: ["image"],
        temperature: characterName ? 0.4 : 1.0,  // キャラクター時は低温度で忠実に再現
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();

    // Extract base64 image from response
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const parts = data.candidates[0].content.parts;
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          return Buffer.from(part.inlineData.data, 'base64');
        }
      }
    }

    throw new Error('画像データが見つかりません');
  } catch (error) {
    console.error(`  ❌ 画像${index}の生成に失敗:`, error.message);
    return null;
  }
}

/**
 * カレンダーCSVから画像を自動生成
 */
async function generateImagesFromCalendar() {
  try {
    console.log('🖼️  カレンダーから画像を自動生成中...\n');

    // APIキーの確認
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEYが設定されていません。.envファイルを確認してください。');
    }

    // カレンダーCSVを読み込む
    const calendarPath = join(__dirname, '..', 'output', 'calendar.csv');
    if (!existsSync(calendarPath)) {
      throw new Error('calendar.csvが見つかりません。先にgenerate-calendar.jsを実行してください。');
    }

    const calendarContent = readFileSync(calendarPath, 'utf-8');
    const lines = calendarContent.split('\n').filter(line => line.trim());

    console.log(`📊 カレンダー行数: ${lines.length}日分\n`);

    // 出力ディレクトリの作成
    const imagesDir = join(__dirname, '..', 'output', 'images');
    if (!existsSync(imagesDir)) {
      mkdirSync(imagesDir, { recursive: true });
    }

    let totalGenerated = 0;
    let totalFailed = 0;

    // 各日の画像を生成（各日4枚: A, D, G, J列）
    for (let dayIndex = 0; dayIndex < lines.length; dayIndex++) {
      const line = lines[dayIndex];
      const columns = parseCSVLine(line);

      if (columns.length < 13) {
        console.log(`⚠️  日${dayIndex + 1}: 列数が不足（${columns.length}列）- スキップ`);
        continue;
      }

      console.log(`\n📅 日${dayIndex + 1}の画像生成中...`);

      // A, D, G, J列の画像説明（インデックス0, 3, 6, 9）
      const imagePrompts = [
        { index: 0, name: '表紙' },
        { index: 3, name: '内容1' },
        { index: 6, name: '内容2' },
        { index: 9, name: '内容3' }
      ];

      for (let i = 0; i < imagePrompts.length; i++) {
        const { index, name } = imagePrompts[i];
        const prompt = columns[index].trim();

        if (!prompt) {
          console.log(`  ⚠️  ${name}の説明が空 - スキップ`);
          continue;
        }

        console.log(`  🎨 ${name}を生成中...`);
        console.log(`     プロンプト: ${prompt.substring(0, 60)}...`);

        // キャラクター検出
        const characterName = detectCharacterInPrompt(prompt);

        // 画像生成（キャラクター名を渡す）
        const imageBuffer = await generateImage(process.env.GEMINI_API_KEY, prompt, i + 1, characterName);

        if (imageBuffer) {
          // ファイル名: day01_01.png, day01_02.png, ...
          const dayNum = String(dayIndex + 1).padStart(2, '0');
          const imgNum = String(i + 1).padStart(2, '0');
          const filename = `day${dayNum}_${imgNum}.png`;
          const filepath = join(imagesDir, filename);

          writeFileSync(filepath, imageBuffer);
          console.log(`  ✅ ${filename} 保存完了`);
          totalGenerated++;
        } else {
          totalFailed++;
        }

        // API制限を考慮して少し待機
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ 画像生成完了`);
    console.log(`📊 生成成功: ${totalGenerated}枚`);
    console.log(`❌ 生成失敗: ${totalFailed}枚`);
    console.log(`💾 保存先: ${imagesDir}\n`);

    return imagesDir;
  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    process.exit(1);
  }
}

// メイン処理
generateImagesFromCalendar();
