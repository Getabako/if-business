import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// アップロード設定
const UPLOAD_URL = 'https://images.if-juku.net/upload.php';
const UPLOAD_PASSWORD = 'IFjuku19841121';

// カラーパレット（20色）
const COLOR_PALETTE = [
  '#FF6B6B', // 赤
  '#4ECDC4', // ターコイズ
  '#45B7D1', // 青
  '#FFA07A', // サーモン
  '#98D8C8', // ミント
  '#FFD93D', // 黄色
  '#6BCF7F', // 緑
  '#C7B3FF', // 薄紫
  '#FF8FAB', // ピンク
  '#95E1D3', // 水色
  '#F38181', // コーラル
  '#AA96DA', // 紫
  '#FCBAD3', // ローズ
  '#A8E6CF', // ライムグリーン
  '#FFD3B6', // ピーチ
  '#FFAAA5', // ライトコーラル
  '#FF8B94', // ローズレッド
  '#A8D8EA', // スカイブルー
  '#AA7DCE', // ラベンダー
  '#FFC8DD'  // ライトピンク
];

// 前回使用した色を記憶
let lastTitleColor = null;
let lastContentColor = null;

/**
 * フォントを登録
 */
function registerFonts() {
  try {
    console.log('🔍 フォント検索中...');

    // Noto Sans CJK用のパス（タイトル用）
    const notoPaths = [
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
      '/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc',
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
      '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
      // macOS
      '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc',
      '/Library/Fonts/BIZ UDGothic Bold.ttf'
    ];

    // M+ フォント用のパス（コンテンツ用）
    const mplusPaths = [
      '/usr/share/fonts/truetype/mplus/mplus-2c-bold.ttf',
      '/usr/share/fonts/truetype/mplus/mplus-2c-regular.ttf',
      '/usr/share/fonts/truetype/mplus/mplus-1c-bold.ttf',
      '/usr/share/fonts/truetype/mplus/mplus-1c-regular.ttf'
    ];

    let titleFontRegistered = false;
    let contentFontRegistered = false;

    // タイトルフォント登録
    for (const path of notoPaths) {
      if (existsSync(path)) {
        try {
          GlobalFonts.registerFromPath(path, 'TitleFont');
          console.log(`✅ タイトルフォント登録成功: ${path}`);
          titleFontRegistered = true;
          break;
        } catch (e) {
          console.warn(`⚠️  フォント登録失敗: ${path} - ${e.message}`);
        }
      }
    }

    // コンテンツフォント登録
    for (const path of mplusPaths) {
      if (existsSync(path)) {
        try {
          GlobalFonts.registerFromPath(path, 'ContentFont');
          console.log(`✅ コンテンツフォント登録成功: ${path}`);
          contentFontRegistered = true;
          break;
        } catch (e) {
          console.warn(`⚠️  フォント登録失敗: ${path} - ${e.message}`);
        }
      }
    }

    // フォールバック: 両方とも同じフォントを使用
    if (!titleFontRegistered || !contentFontRegistered) {
      const fallbackPaths = [...notoPaths, ...mplusPaths];
      for (const path of fallbackPaths) {
        if (existsSync(path)) {
          try {
            if (!titleFontRegistered) {
              GlobalFonts.registerFromPath(path, 'TitleFont');
              console.log(`✅ タイトルフォント（フォールバック）登録成功: ${path}`);
              titleFontRegistered = true;
            }
            if (!contentFontRegistered) {
              GlobalFonts.registerFromPath(path, 'ContentFont');
              console.log(`✅ コンテンツフォント（フォールバック）登録成功: ${path}`);
              contentFontRegistered = true;
            }
            if (titleFontRegistered && contentFontRegistered) break;
          } catch (e) {
            // 次を試す
          }
        }
      }
    }

    if (!titleFontRegistered || !contentFontRegistered) {
      console.error('❌ 日本語フォントが見つかりません！');
      console.error('   fonts-noto-cjkとfonts-mplusがインストールされているか確認してください。');
    }

    // 登録されているフォント一覧を表示
    const families = GlobalFonts.families;
    console.log(`📝 登録フォント: ${families.length > 0 ? families.join(', ') : 'なし'}`);

  } catch (error) {
    console.error('❌ フォント登録エラー:', error.message);
  }
}

/**
 * ランダムな色を選択（前回と異なる色）
 */
function getRandomColor(isTitle) {
  let color;
  const lastColor = isTitle ? lastTitleColor : lastContentColor;
  const otherLastColor = isTitle ? lastContentColor : lastTitleColor;

  do {
    color = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
  } while (color === lastColor || color === otherLastColor);

  if (isTitle) {
    lastTitleColor = color;
  } else {
    lastContentColor = color;
  }

  return color;
}

/**
 * GitリポジトリのURLからリポジトリ名を取得
 */
function getRepositoryName() {
  try {
    const gitConfigPath = join(__dirname, '..', '..', '.git', 'config');
    if (existsSync(gitConfigPath)) {
      const gitConfig = readFileSync(gitConfigPath, 'utf-8');
      const urlMatch = gitConfig.match(/url\s*=\s*.*\/([^\/\s]+?)(\.git)?\s*$/m);
      if (urlMatch && urlMatch[1]) {
        return urlMatch[1];
      }
    }
  } catch (error) {
    console.warn('⚠️  リポジトリ名の取得に失敗:', error.message);
  }
  return 'repository';
}

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
 * テキストを行分割（\\nで分割）し、短い行を結合、長い行を9文字ごとに折り返し
 * 3文字以下の行は次の行（または前の行）と結合して不要な改行を防ぐ
 * 9文字を超える行は9文字ごとに自動的に折り返す
 */
function splitText(text) {
  if (!text) return [];

  const lines = text.split('\\n');
  const optimizedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i].trim();

    if (!currentLine) {
      // 空行はスキップ
      continue;
    }

    // 現在の行が3文字以下で、次の行がある場合
    if (currentLine.length <= 3 && i < lines.length - 1) {
      const nextLine = lines[i + 1].trim();
      if (nextLine) {
        // 次の行と結合
        lines[i + 1] = currentLine + nextLine;
        continue;
      }
    }

    // 現在の行が3文字以下で、次の行がない場合（最後の行）
    if (currentLine.length <= 3 && optimizedLines.length > 0) {
      // 前の行と結合
      optimizedLines[optimizedLines.length - 1] += currentLine;
      continue;
    }

    optimizedLines.push(currentLine);
  }

  // 9文字を超える行を折り返し
  const wrappedLines = [];
  for (const line of optimizedLines) {
    if (line.length <= 9) {
      wrappedLines.push(line);
    } else {
      // 9文字ごとに分割
      for (let i = 0; i < line.length; i += 9) {
        wrappedLines.push(line.substring(i, i + 9));
      }
    }
  }

  return wrappedLines;
}

/**
 * テキストをCanvas上に描画
 */
function drawText(ctx, text, font, fontSize, color, alignment, effect, posY, canvasWidth, canvasHeight) {
  if (!text || !text.trim()) return;

  const textLines = splitText(text);

  ctx.save();
  ctx.font = `bold ${fontSize}px "${font}"`;
  ctx.textAlign = alignment;
  ctx.textBaseline = 'middle';

  const lineHeight = fontSize * 1.2;
  const startY = posY;

  let x;
  switch (alignment) {
    case 'left':
      x = 50;
      break;
    case 'center':
      x = canvasWidth / 2;
      break;
    case 'right':
      x = canvasWidth - 50;
      break;
    default:
      x = canvasWidth / 2;
  }

  textLines.forEach((line, index) => {
    if (!line.trim()) return;

    const lineY = startY + (index * lineHeight);

    ctx.save();

    // アウトライン効果
    if (effect === 'outline') {
      // 白の外側のアウトライン
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 20;
      ctx.strokeText(line, x, lineY);

      // 黒のアウトライン
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 12;
      ctx.strokeText(line, x, lineY);

      // メインテキスト（カラー）
      ctx.fillStyle = color;
      ctx.fillText(line, x, lineY);
    } else {
      // エフェクトなし
      ctx.fillStyle = color;
      ctx.fillText(line, x, lineY);
    }

    ctx.restore();
  });

  ctx.restore();
}

/**
 * 画像にテキストを重ねて3:4にリサイズ
 */
async function composeImage(imagePath, titleText, contentText) {
  const canvasWidth = 1080;
  const canvasHeight = 1440; // 3:4の比率

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // 背景画像を読み込み
  const img = await loadImage(imagePath);

  // 背景を白で塗りつぶし
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 画像を3:4にフィットさせる
  let sourceX = 0, sourceY = 0;
  let sourceWidth = img.width;
  let sourceHeight = img.height;

  // 正方形の画像を3:4にトリミング
  if (img.width === img.height) {
    sourceHeight = img.width * (4/3);
    if (sourceHeight > img.height) {
      sourceHeight = img.height;
      sourceWidth = img.height * (3/4);
      sourceX = (img.width - sourceWidth) / 2;
    }
  }

  const scale = Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const drawX = (canvasWidth - drawWidth) / 2;
  const drawY = (canvasHeight - drawHeight) / 2;

  ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, drawX, drawY, drawWidth, drawHeight);

  // ランダムな色を取得（タイトルとコンテンツで異なる色）
  const titleColor = getRandomColor(true);
  const contentColor = getRandomColor(false);

  // タイトルを描画（上部10%固定）
  if (titleText && titleText.trim()) {
    const titlePosY = canvasHeight * 0.1;
    drawText(
      ctx,
      titleText,
      'TitleFont',
      120,
      titleColor,
      'center',
      'outline',
      titlePosY,
      canvasWidth,
      canvasHeight
    );
  }

  // コンテンツを描画（縦位置45%）
  if (contentText && contentText.trim()) {
    const contentPosY = canvasHeight * 0.45;
    drawText(
      ctx,
      contentText,
      'ContentFont',
      90,
      contentColor,
      'center',
      'outline',
      contentPosY,
      canvasWidth,
      canvasHeight
    );
  }

  return canvas.toBuffer('image/png');
}


/**
 * キャラクターフォルダからベース画像を取得（image-to-image用）
 */
function getCharacterBaseImage(imageDescription) {
  try {
    const characterDir = join(__dirname, '..', 'character');
    if (!existsSync(characterDir)) {
      return null;
    }

    // キャラクター名を検出
    const characterNames = ['井上', '山﨑', '山崎', '高崎'];
    const detectedCharacter = characterNames.find(name => imageDescription.includes(name));

    if (!detectedCharacter) {
      return null;
    }

    console.log(`     👤 キャラクター「${detectedCharacter}」を検出`);

    // characterフォルダ内のサブフォルダを検索
    const folders = readdirSync(characterDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const folder of folders) {
      if (folder.includes(detectedCharacter)) {
        const characterPath = join(characterDir, folder);
        const files = readdirSync(characterPath).filter(file =>
          file.toLowerCase().endsWith('.png') ||
          file.toLowerCase().endsWith('.jpg') ||
          file.toLowerCase().endsWith('.jpeg')
        );

        if (files.length > 0) {
          // ランダムに画像を選択
          const randomFile = files[Math.floor(Math.random() * files.length)];
          const imagePath = join(characterPath, randomFile);
          console.log(`     📸 ベース画像: ${randomFile}`);
          return imagePath;
        }
      }
    }

    return null;
  } catch (error) {
    console.log(`     ⚠️  キャラクター画像取得エラー: ${error.message}`);
    return null;
  }
}

/**
 * Gemini APIでtext-to-image画像生成
 */
async function generateImageWithGemini(imageDescription, baseImagePath = null) {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    if (baseImagePath) {
      // Image-to-image: キャラクター画像をベースに生成
      console.log(`     🎨 Gemini APIでimage-to-image生成中...`);

      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      // ベース画像を読み込み
      const imageBuffer = readFileSync(baseImagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = baseImagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

      // プロンプト作成
      const prompt = `この画像をベースに、以下の説明に従った画像を生成してください。人物の特徴は維持しつつ、背景やシチュエーションを説明に合わせてください。

画像説明:
${imageDescription}

要件:
- 人物の顔や特徴は元の画像を維持
- 背景とシチュエーションは説明に従う
- ビジネスシーンに適したプロフェッショナルな雰囲気
- 1080x1080pxの正方形画像
- 写実的で高品質`;

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Image
          }
        },
        { text: prompt }
      ]);

      const response = await result.response;
      const text = response.text();

      // Gemini 2.0では画像生成の方法が異なるため、imagen-3を使用
      const imagenModel = genAI.getGenerativeModel({ model: 'imagen-3.0-generate-001' });
      const imagenResult = await imagenModel.generateContent(prompt);

      // 画像データを取得
      const imageData = imagenResult.response.candidates[0].content.parts[0].inlineData;
      const generatedImageBuffer = Buffer.from(imageData.data, 'base64');

      console.log(`     ✅ Gemini APIでimage-to-image生成完了`);
      return generatedImageBuffer;

    } else {
      // Text-to-image: 説明文のみから生成
      console.log(`     🎨 Gemini APIでtext-to-image生成中...`);

      const model = genAI.getGenerativeModel({ model: 'imagen-3.0-generate-001' });

      // プロンプト作成
      const prompt = `以下の説明に従った画像を生成してください:

${imageDescription}

要件:
- 1080x1080pxの正方形画像
- ビジネスシーンに適したプロフェッショナルな雰囲気
- 写実的で高品質
- 日本のビジネス環境に適した内容`;

      const result = await model.generateContent(prompt);

      // 画像データを取得
      const imageData = result.response.candidates[0].content.parts[0].inlineData;
      const generatedImageBuffer = Buffer.from(imageData.data, 'base64');

      console.log(`     ✅ Gemini APIでtext-to-image生成完了`);
      return generatedImageBuffer;
    }

  } catch (error) {
    console.log(`     ❌ Gemini API画像生成エラー: ${error.message}`);
    throw error;
  }
}

/**
 * AI画像を生成
 * カレンダーの画像説明から Gemini API で画像を生成
 */
async function generateAIImage(imageDescription, dayNum, imgNum) {
  console.log(`     🤖 AI画像を生成中...`);
  console.log(`     📝 画像説明: ${imageDescription}`);

  // 1. キャラクター名が含まれている場合、image-to-imageで生成
  const baseImagePath = getCharacterBaseImage(imageDescription);

  try {
    if (baseImagePath) {
      console.log(`     🎯 Image-to-Image モード（キャラクター画像ベース）`);
      const imageBuffer = await generateImageWithGemini(imageDescription, baseImagePath);
      return imageBuffer;
    } else {
      console.log(`     🎯 Text-to-Image モード`);
      const imageBuffer = await generateImageWithGemini(imageDescription, null);
      return imageBuffer;
    }
  } catch (error) {
    console.log(`     ❌ Gemini API画像生成失敗: ${error.message}`);
    throw new Error(`画像生成に失敗しました: ${error.message}`);
  }
}


/**
 * 画像をサーバーにアップロード
 */
async function uploadImage(imageBuffer, path) {
  try {
    const formData = new FormData();
    formData.append('file', imageBuffer, { filename: 'image.png' });
    formData.append('path', path);
    formData.append('password', UPLOAD_PASSWORD);

    const response = await fetch(UPLOAD_URL, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result.success) {
      return result.url;
    } else {
      throw new Error(result.error || 'アップロード失敗');
    }
  } catch (error) {
    throw new Error(`アップロードエラー: ${error.message}`);
  }
}

/**
 * カレンダーCSVから画像を合成してアップロード
 */
async function composeAndUploadImages() {
  try {
    console.log('🎨 画像合成とアップロードを開始...\n');

    // フォント登録
    registerFonts();
    console.log();

    // カレンダーCSVを読み込む
    const calendarPath = join(__dirname, '..', 'output', 'calendar.csv');
    if (!existsSync(calendarPath)) {
      throw new Error('calendar.csvが見つかりません。先にgenerate-calendar.jsを実行してください。');
    }

    const calendarContent = readFileSync(calendarPath, 'utf-8');
    const lines = calendarContent.split('\n').filter(line => line.trim());

    console.log(`📊 カレンダー行数: ${lines.length}日分\n`);

    // AI生成画像のディレクトリ
    const imagesDir = join(__dirname, '..', 'output', 'images');
    if (!existsSync(imagesDir)) {
      throw new Error('output/images/が見つかりません。先にgenerate-images.jsを実行してください。');
    }

    // 合成画像の出力ディレクトリ
    const composedDir = join(__dirname, '..', 'output', 'composed');
    if (!existsSync(composedDir)) {
      mkdirSync(composedDir, { recursive: true });
    }

    // リポジトリ名を取得
    const repositoryName = getRepositoryName();

    // 日本時間（JST）を取得（フォルダ名用）
    // UTCから9時間を加算
    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000; // 9時間をミリ秒に変換
    const jstTime = new Date(now.getTime() + jstOffset);

    const year = jstTime.getUTCFullYear();
    const month = String(jstTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(jstTime.getUTCDate()).padStart(2, '0');
    const hour = String(jstTime.getUTCHours()).padStart(2, '0');
    const minute = String(jstTime.getUTCMinutes()).padStart(2, '0');
    const folderName = `${repositoryName}_post_${year}_${month}_${day}_${hour}_${minute}`;

    console.log(`📁 フォルダ名: ${folderName}（日本時間）`);

    let totalComposed = 0;
    let totalUploaded = 0;
    let totalFailed = 0;

    // アップロードされた画像URLを記録（一括投稿CSV用）
    const uploadedImageUrls = [];
    const thanksMessageUrls = [];

    // 各日の画像を合成
    for (let dayIndex = 0; dayIndex < lines.length; dayIndex++) {
      const line = lines[dayIndex];
      const columns = parseCSVLine(line);

      if (columns.length < 13) {
        console.log(`⚠️  日${dayIndex + 1}: 列数が不足（${columns.length}列）- スキップ`);
        continue;
      }

      console.log(`\n📅 日${dayIndex + 1}の画像合成中...`);

      // 各日4枚の画像
      const imageConfigs = [
        { index: 1, titleCol: 1, contentCol: 2, name: '表紙' },     // B列、C列
        { index: 2, titleCol: 4, contentCol: 5, name: '内容1' },    // E列、F列
        { index: 3, titleCol: 7, contentCol: 8, name: '内容2' },    // H列、I列
        { index: 4, titleCol: 10, contentCol: 11, name: '内容3' }   // K列、L列
      ];

      for (const config of imageConfigs) {
        const dayNum = String(dayIndex + 1).padStart(2, '0');
        const imgNum = String(config.index).padStart(2, '0');

        // AI生成画像のパス
        const aiImagePath = join(imagesDir, `day${dayNum}_${imgNum}.png`);

        // AI生成画像が存在しない場合は生成する
        if (!existsSync(aiImagePath)) {
          console.log(`  🎨 ${config.name}: AI画像が見つかりません - 生成中...`);

          // 画像説明を取得（A,D,G,J列）
          const imageDescriptionCol = config.index === 1 ? 0 :
                                       config.index === 2 ? 3 :
                                       config.index === 3 ? 6 : 9;
          const imageDescription = columns[imageDescriptionCol] || '';

          console.log(`     画像説明: ${imageDescription.substring(0, 60)}...`);

          try {
            // AI画像を生成（Unsplashまたはプレースホルダー）
            const generatedImage = await generateAIImage(imageDescription, dayNum, imgNum);
            writeFileSync(aiImagePath, generatedImage);
            console.log(`  ✅ AI画像を生成しました: day${dayNum}_${imgNum}.png`);

            // Gemini API制限を考慮して待機（2秒）
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (error) {
            console.log(`  ❌ AI画像生成に失敗: ${error.message} - スキップ`);
            totalFailed++;
            continue;
          }
        }

        // テキストを取得
        const titleText = columns[config.titleCol].trim();
        const contentText = columns[config.contentCol].trim();

        console.log(`  🎨 ${config.name}を合成中...`);
        console.log(`     タイトル: ${titleText}`);
        console.log(`     コンテンツ: ${contentText.substring(0, 30)}...`);

        try {
          // 画像を合成
          const composedBuffer = await composeImage(aiImagePath, titleText, contentText);

          // ローカルに保存
          const composedFilename = `${String(totalComposed).padStart(3, '0')}.png`;
          const composedPath = join(composedDir, composedFilename);
          writeFileSync(composedPath, composedBuffer);

          console.log(`  💾 ${composedFilename} 保存完了`);
          totalComposed++;

          // サーバーにアップロード
          const uploadPath = `${folderName}/${composedFilename}`;
          console.log(`  ⬆️  アップロード中...`);

          const uploadedUrl = await uploadImage(composedBuffer, uploadPath);
          console.log(`  ✅ アップロード完了: ${uploadedUrl}`);
          totalUploaded++;

          // URLを記録
          uploadedImageUrls.push(uploadedUrl);

        } catch (error) {
          console.error(`  ❌ エラー:`, error.message);
          totalFailed++;
        }

        // API制限を考慮して少し待機
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // サンクスメッセージ画像をアップロード
    console.log('\n📮 サンクスメッセージ画像をアップロード中...');
    const thanksMessageDir = join(__dirname, '..', 'thanks_message');

    // thanks_messageフォルダが存在しない場合は作成
    if (!existsSync(thanksMessageDir)) {
      mkdirSync(thanksMessageDir, { recursive: true });
      console.log('  📁 thanks_messageフォルダを作成しました');
    }

    if (existsSync(thanksMessageDir)) {
      const thanksFiles = readdirSync(thanksMessageDir).filter(file =>
        file.toLowerCase().endsWith('.png') ||
        file.toLowerCase().endsWith('.jpg') ||
        file.toLowerCase().endsWith('.jpeg')
      );

      for (const file of thanksFiles) {
        try {
          const thanksImagePath = join(thanksMessageDir, file);
          const thanksImageBuffer = readFileSync(thanksImagePath);

          // サーバーにアップロード（同じフォルダに）
          const uploadPath = `${folderName}/${file}`;
          console.log(`  ⬆️  ${file}をアップロード中...`);

          const uploadedUrl = await uploadImage(thanksImageBuffer, uploadPath);
          console.log(`  ✅ アップロード完了: ${uploadedUrl}`);
          totalUploaded++;

          // サンクスメッセージURLを記録
          thanksMessageUrls.push(uploadedUrl);

          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`  ❌ ${file}のアップロードに失敗:`, error.message);
        }
      }
    } else {
      console.log('  ℹ️  thanks_messageフォルダが見つかりません - スキップ');
    }

    // 一括投稿データ.CSV作成
    console.log('\n📝 一括投稿データ.CSV作成中...');
    const bulkPostCsvPath = join(__dirname, '..', 'output', '一括投稿データ.csv');

    try {
      // 投稿日数を計算（合成画像枚数 / 4）
      const postsCount = Math.floor(uploadedImageUrls.length / 4);
      console.log(`  📊 合成画像: ${uploadedImageUrls.length}枚 → ${postsCount}日分の投稿`);

      if (postsCount === 0) {
        console.log('  ⚠️  投稿データがありません - スキップ');
      } else {
        // CSVヘッダー
        const csvLines = ['Date,Text,Link(s),Media URL(s)'];

        // 各日の投稿データを作成
        for (let i = 0; i < postsCount; i++) {
          // 投稿日時（日本時間の今日から順番に18:00で設定）
          const postDate = new Date(jstTime.getTime());
          postDate.setUTCDate(postDate.getUTCDate() + i);
          postDate.setUTCHours(18, 0, 0, 0);
          const dateStr = `${postDate.getUTCFullYear()}-${String(postDate.getUTCMonth() + 1).padStart(2, '0')}-${String(postDate.getUTCDate()).padStart(2, '0')} 18:00`;

          // カレンダーのM列（13列目）のテキストを取得
          const calendarLine = lines[i];
          const columns = parseCSVLine(calendarLine);
          const postText = columns[12] || ''; // M列（0-indexed で12）

          // この日の4枚の画像URL
          const dayImageUrls = uploadedImageUrls.slice(i * 4, i * 4 + 4);

          // サンクスメッセージURLを追加
          const mediaUrls = [...dayImageUrls, ...thanksMessageUrls].join(',');

          // CSV行を作成（テキストにカンマが含まれるのでダブルクォートで囲む）
          const csvLine = `${dateStr},"${postText.replace(/"/g, '""')}",,"${mediaUrls}"`;
          csvLines.push(csvLine);
        }

        // CSVファイルを保存
        writeFileSync(bulkPostCsvPath, csvLines.join('\n'), 'utf-8');
        console.log(`  ✅ 一括投稿データ.CSV作成完了: ${postsCount}日分`);
        console.log(`  💾 保存先: ${bulkPostCsvPath}`);
      }
    } catch (error) {
      console.error('  ❌ 一括投稿データ.CSV作成エラー:', error.message);
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ 画像合成・アップロード完了`);
    console.log(`📊 合成成功: ${totalComposed}枚`);
    console.log(`⬆️  アップロード成功: ${totalUploaded}枚`);
    console.log(`❌ 失敗: ${totalFailed}枚`);
    console.log(`💾 ローカル保存先: ${composedDir}`);
    console.log(`🌐 サーバー保存先: https://images.if-juku.net/${folderName}/\n`);

    // GitHub Actions用の画像URLリストをJSONファイルに保存
    const imageUrlsData = {
      folderName: folderName,
      serverUrl: `https://images.if-juku.net/${folderName}/`,
      totalImages: uploadedImageUrls.length,
      composedImages: uploadedImageUrls,
      thanksMessages: thanksMessageUrls,
      generatedAt: new Date().toISOString()
    };

    const imageUrlsPath = join(__dirname, '..', 'output', 'image-urls.json');
    writeFileSync(imageUrlsPath, JSON.stringify(imageUrlsData, null, 2), 'utf-8');
    console.log(`📄 画像URLリストを保存: ${imageUrlsPath}\n`);

    return composedDir;
  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    process.exit(1);
  }
}

// メイン処理
composeAndUploadImages();
