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

    // リポジトリ名を取得
    const repositoryName = getRepositoryName();
    console.log(`📝 リポジトリ名: ${repositoryName}\n`);

    // 既存のCSVファイルをチェック
    const imageruleDir = join(__dirname, '..', 'imagerule');
    const rulePath = join(imageruleDir, `${repositoryName}.csv`);
    const existingCSV = existsSync(rulePath);

    // 既存CSVがあり、カスタムプロンプトがない場合はスキップ
    if (existingCSV && !customPrompt) {
      console.log('ℹ️  既存の画像ルールCSVがあります。カスタムプロンプトが指定されていないため、生成をスキップします。\n');
      console.log(`💡 既存のルールを更新したい場合は、カスタムプロンプトで修正内容を指定してください。\n`);
      console.log(`📄 既存ファイル: ${rulePath}\n`);
      return;
    }

    // 既存CSVがある場合は内容を読み込む
    let existingRules = '';
    if (existingCSV) {
      const csvContent = readFileSync(rulePath, 'utf-8');
      const lines = csvContent.split('\n').filter(line => line.trim() && !line.startsWith('setting_name,'));
      if (lines.length > 0) {
        existingRules = lines.join('\n');
        console.log(`📄 既存の画像ルール（${lines.length}個）を読み込みました\n`);
      }
    }

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

    // 既存ルールがある場合のセクション
    const existingRulesSection = existingRules
      ? `\n# 既存の画像一貫性ルール\n以下は既に設定されているルールです:\n\n${existingRules}\n\n上記の既存ルールに対して、以下の指示を反映して修正・追記してください:\n`
      : '';

    // プロンプトの作成
    const basePrompt = `
あなたはビジュアルブランディングの専門家です。${existingRules ? '既存の画像一貫性ルールを修正・更新してください。' : '以下の事業内容を分析して、Instagram投稿用の画像一貫性ルールを3〜5個作成してください。'}

${existingRulesSection}${customPrompt ? `\n# ${existingRules ? '修正' : '追加'}の指示\n${customPrompt}\n` : ''}

# 事業情報
${businessSummary || htmlContent}
${charactersSection}
${imagesSection}

# 分析項目
各ルールについて、以下の6項目を詳細に日本語で記述してください：

1. **設定名**: ルールの簡潔な名前（20文字以内、日本語）
2. **場所・環境**: 建物、部屋の特徴、家具、小道具、色調など（具体的かつ詳細に日本語で記述）
3. **キャラクター・人物**: 年齢、性別、人数、髪型、服装、特徴的な要素（具体的に日本語で記述）
4. **時間帯・照明**: 自然光/人工光、時間帯、影の雰囲気（具体的に日本語で記述）
5. **雰囲気・スタイル**: 写実的/イラスト風、明るさ、感情、全体的な印象（具体的に日本語で記述）
6. **追加の詳細設定**: カメラアングル、被写界深度、色調、構図など（具体的に日本語で記述）

# 出力フォーマット
以下のCSV形式で、3〜5個のルールを出力してください。**1行目にヘッダーは不要です。データ行のみを出力してください。**

各ルールは1行で、カンマ区切り、フィールドにカンマが含まれる場合はダブルクォートで囲んでください。

例（ヘッダーなし、データ行のみ）:
明るい教室,"広々とした明るい教室空間、白を基調とした内装、木目調の机と椅子、ホワイトボードとプロジェクター、窓から見える緑の景色、整理整頓された学習教材","1-3人の生徒（中高生、私服）と講師（20-30代、ポロシャツまたはシャツ）、明るい表情で学習に集中、ノートPCやタブレットを使用","午前中から午後の自然光、窓から柔らかい光が差し込む、影は柔らかく、暖かみのある照明","明るく清潔感のある雰囲気、集中できる学習環境、希望に満ちた前向きな印象、写実的なスタイル","斜め上からのアングル、被写界深度は中程度で背景も適度にボケる、色調は明るく暖色系、構図は対角線を意識した配置"
オンライン環境,"自宅の書斎またはカフェ、ノートPCやタブレットが画面中央、背景には本棚や観葉植物、落ち着いた色調のインテリア、カフェの場合は温かみのある木目調のテーブル","1-2人（学生または社会人、20-40代）、カジュアルな服装（Tシャツやパーカー）、リラックスした表情、画面を見ながら学習中","夕方から夜の間接照明、デスクライトや暖色系の照明、柔らかく温かみのある光、画面の光が顔を照らす","親しみやすくリラックスした雰囲気、在宅学習の快適さを表現、集中しつつも柔らかい印象、写実的なスタイル","正面または斜めからのアングル、被写界深度は浅めで背景を適度にぼかす、色調は暖色系でやや暗め、画面の光を強調した構図"
未来的な空間,"サイバーパンク風の未来的な空間、ネオンの光が反射するガラスや金属、ホログラム画面が浮かぶ、ダークトーンの背景に鮮やかな青や紫の光、デジタルエフェクトやグリッド線","1-2人の開発者（20-30代）、黒やダークトーンの服装、集中した表情でコーディング中、複数のモニターに囲まれている","夜または暗い環境、ネオンカラーの照明（青、紫、ピンク）、強いコントラスト、影は濃く明暗がはっきり","先進的でクールな雰囲気、ハイテクで未来的な印象、緊張感と集中力を表現、やや非現実的でスタイリッシュ","斜め下またはローアングル、被写界深度は浅めで主要人物に焦点、色調は寒色系で彩度高め、対角線構図で動きを強調"

**重要: ヘッダー行は出力しないでください。データ行のみを出力してください。**
**重要: 各項目は具体的かつ詳細に日本語で記述してください。**
**重要: 事業の特徴に合わせて、3〜5個のユニークなルールを作成してください。**
`;

    if (existingCSV) {
      console.log('🤖 Gemini AIで画像一貫性ルールを更新中...\n');
    } else {
      console.log('🤖 Gemini AIで画像一貫性ルールを生成中...\n');
    }

    const result = await model.generateContent(basePrompt);
    const response = await result.response;
    let rulesCSV = response.text().trim();

    // コードブロックのマークダウンを削除
    rulesCSV = rulesCSV.replace(/```csv\n/g, '').replace(/```\n/g, '').replace(/```/g, '');

    // ヘッダー行を追加
    const header = 'setting_name,location_environment,characters_people,time_lighting,atmosphere_style,additional_details';
    const fullCSV = header + '\n' + rulesCSV;

    // imageruleフォルダに保存
    if (!existsSync(imageruleDir)) {
      mkdirSync(imageruleDir, { recursive: true });
      console.log('📁 imageruleフォルダを作成しました\n');
    }

    writeFileSync(rulePath, fullCSV, 'utf-8');

    if (existingCSV) {
      console.log('✅ 画像一貫性ルールを更新しました');
    } else {
      console.log('✅ 画像一貫性ルールを生成しました');
    }
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
        console.log(`   場所・環境: ${fields[1].substring(0, 50)}...`);
        console.log(`   キャラクター: ${fields[2].substring(0, 50)}...`);
        console.log(`   時間帯・照明: ${fields[3].substring(0, 50)}...`);
        console.log(`   雰囲気・スタイル: ${fields[4].substring(0, 50)}...`);
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
