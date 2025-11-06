import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { JSDOM } from 'jsdom';
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
 * characterフォルダから全キャラクター情報を読み込む
 */
function loadAllCharacters() {
  const characterDir = join(__dirname, '..', 'character');
  if (!existsSync(characterDir)) return [];

  const folders = readdirSync(characterDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  const characters = [];
  for (const folderName of folders) {
    const csvPath = join(characterDir, folderName, `${folderName}.csv`);
    if (existsSync(csvPath)) {
      try {
        const content = readFileSync(csvPath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        if (lines.length > 1) {
          characters.push({ name: folderName, csv: lines[1] });
        }
      } catch (error) {
        console.warn(`⚠️  ${folderName}の読み込みをスキップ:`, error.message);
      }
    }
  }
  return characters;
}

/**
 * HTMLから事業名を抽出
 */
function extractBusinessName(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // タイトルタグから取得を試みる
  const title = document.querySelector('title')?.textContent || '';
  // h1タグから取得を試みる
  const h1 = document.querySelector('h1')?.textContent || '';

  // より短い方を事業名とする（長すぎる説明文を避ける）
  const candidate = title.length > 0 && title.length < h1.length ? title : h1;

  // クリーンアップ
  return candidate.replace(/\s+/g, '').substring(0, 50) || '事業';
}

/**
 * imageruleを自動生成
 */
async function generateImageRule() {
  try {
    console.log('🎨 画像一貫性ルールを自動生成中...\n');

    // APIキーの確認
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEYが設定されていません。.envファイルを確認してください。');
    }

    // 修正プロンプトの取得（環境変数から）
    const customPrompt = process.env.CUSTOM_PROMPT || '';
    if (customPrompt) {
      console.log(`📝 カスタムプロンプト: ${customPrompt}\n`);
    }

    // index.htmlの読み込み
    const indexPath = join(__dirname, '..', 'index.html');
    if (!existsSync(indexPath)) {
      throw new Error('index.htmlが見つかりません。WorkFlow_origin/index.htmlを配置してください。');
    }

    const htmlContent = readFileSync(indexPath, 'utf-8');
    console.log('✅ index.htmlを読み込みました\n');

    // キャラクター情報の読み込み
    const characters = loadAllCharacters();
    console.log(`✅ キャラクター情報を読み込みました（${characters.length}人）\n`);

    // /imagesフォルダの画像一覧
    const imagesDir = join(__dirname, '..', '..', 'images');
    let imagesList = [];
    if (existsSync(imagesDir)) {
      imagesList = readdirSync(imagesDir).filter(file => isImageFile(file));
      console.log(`✅ ホームページ画像を確認しました（${imagesList.length}枚）\n`);
    }

    // 事業名を固定
    const businessName = 'if-business';
    console.log(`📝 事業名: ${businessName}\n`);

    // business-summary.txtの読み込み（既に分析済みの場合）
    const businessSummaryPath = join(__dirname, '..', 'output', 'business-summary.txt');
    let businessSummary = '';

    if (existsSync(businessSummaryPath)) {
      businessSummary = readFileSync(businessSummaryPath, 'utf-8');
      console.log('✅ 既存の事業分析を読み込みました\n');
    } else {
      console.log('⚠️  business-summary.txtが見つかりません。index.htmlから直接分析します\n');
    }

    // Gemini APIクライアントの初期化
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    // キャラクター情報をフォーマット
    const charactersSection = characters.length > 0
      ? `\n# 登場人物の特徴\n以下のキャラクターが利用可能です:\n${characters.map(c => `- ${c.name}: ${c.csv}`).join('\n')}\n`
      : '';

    // 画像情報をフォーマット
    const imagesSection = imagesList.length > 0
      ? `\n# ホームページで使用されている画像\n${imagesList.join(', ')}\n（これらの画像の雰囲気やスタイルを参考にしてください）\n`
      : '';

    // プロンプトの作成
    const basePrompt = `
あなたはビジュアルブランディングの専門家です。以下の事業内容を分析して、Instagram投稿用の画像一貫性ルールを3〜5個作成してください。

${customPrompt ? `\n# 追加の指示\n${customPrompt}\n` : ''}

# 事業情報
${businessSummary || htmlContent}
${charactersSection}
${imagesSection}

# 画像一貫性ルールの目的
- ブランドの統一感を保つ
- 投稿ごとに適切なシーンを選べるようにする
- 視覚的な多様性を持たせる

# ルールの種類（例）
- メインのオフィス/教室/店舗風景
- オンライン/リモート環境
- カジュアルな雰囲気のシーン
- フォーマルな雰囲気のシーン
- 特徴的な空間（この事業ならではの場所）

# 各ルールに含める要素
- name: ルールの名前（20文字以内）
- location: 場所の説明（具体的に）
- characters: 登場するキャラクター数の範囲や種類
- lighting: 照明の特徴（自然光、暖色照明、ネオンなど）
- style: 全体的なスタイル・雰囲気
- additional: 追加の特徴や注意点

# 出力フォーマット
以下のCSV形式で、3〜5個のルールを出力してください。**1行目にヘッダーは不要です。データ行のみを出力してください。**

各ルールは1行で、カンマ区切り、フィールドにカンマが含まれる場合はダブルクォートで囲んでください。

例（ヘッダーなし、データ行のみ）:
明るい教室,広々とした明るい教室空間,1-3人の生徒と講師,自然光が差し込む明るい照明,清潔感があり学習に集中できる雰囲気,ホワイトボードやPC画面が背景に見える
オンライン環境,自宅やカフェからのオンライン参加,1-2人,柔らかい間接照明,リラックスした親しみやすい雰囲気,画面越しのコミュニケーションを強調
サイバーパンク空間,未来的でデジタルな空間,1-2人の開発者,ネオンカラーの照明でダークトーン,先進的でクールな雰囲気,ホログラムやデジタルエフェクトが特徴

**重要: ヘッダー行（name,location,...）は出力しないでください。データ行のみを出力してください。**
**重要: 事業の特徴に合わせて、3〜5個のユニークなルールを作成してください。**
`;

    console.log('🤖 Gemini AIで画像一貫性ルールを生成中...\n');

    const result = await model.generateContent(basePrompt);
    const response = await result.response;
    let rulesCSV = response.text().trim();

    // コードブロックのマークダウンを削除
    rulesCSV = rulesCSV.replace(/```csv\n/g, '').replace(/```\n/g, '').replace(/```/g, '');

    // ヘッダー行を追加
    const header = 'name,location,characters,lighting,style,additional';
    const fullCSV = header + '\n' + rulesCSV;

    // imageruleフォルダに保存
    const imageruleDir = join(__dirname, '..', 'imagerule');
    if (!existsSync(imageruleDir)) {
      mkdirSync(imageruleDir, { recursive: true });
      console.log('📁 imageruleフォルダを作成しました\n');
    }
    const rulePath = join(imageruleDir, `${businessName}.csv`);

    writeFileSync(rulePath, fullCSV, 'utf-8');

    console.log('✅ 画像一貫性ルールを生成しました');
    console.log(`💾 保存先: ${rulePath}\n`);

    // 生成されたルール数を表示
    const lines = rulesCSV.split('\n').filter(line => line.trim());
    console.log(`📊 生成されたルール数: ${lines.length}個\n`);

    // サンプルを表示
    if (lines.length > 0) {
      console.log('📝 生成されたルールのプレビュー:');
      lines.slice(0, 3).forEach((line, idx) => {
        const fields = parseCSVLine(line);
        console.log(`\n${idx + 1}. ${fields[0]}`);
        console.log(`   場所: ${fields[1]}`);
        console.log(`   照明: ${fields[3]}`);
        console.log(`   スタイル: ${fields[4]}`);
      });
    }

    return rulePath;
  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    process.exit(1);
  }
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

// メイン処理
generateImageRule();
