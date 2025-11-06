import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * CSVファイルをパース
 */
function parseCSV(content) {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return null;

  const headers = lines[0].split(',');
  const values = lines[1].split(',');

  const result = {};
  headers.forEach((header, i) => {
    result[header.trim()] = values[i] ? values[i].trim().replace(/^"|"$/g, '') : '';
  });

  return result;
}

/**
 * characterフォルダのサブフォルダ（キャラクター）をリストアップ
 */
function listCharacters() {
  const characterDir = join(__dirname, '..', 'character');
  if (!existsSync(characterDir)) return [];

  return readdirSync(characterDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
}

/**
 * imageruleフォルダのCSVファイルをリストアップ
 */
function listImageRules() {
  const imageruleDir = join(__dirname, '..', 'imagerule');
  if (!existsSync(imageruleDir)) return [];

  return readdirSync(imageruleDir)
    .filter(file => file.endsWith('.csv'))
    .map(file => file.replace('.csv', ''));
}

/**
 * キャラクター設定を読み込み
 */
function loadCharacter(characterName) {
  // サブフォルダ内のCSVファイルを探す
  const characterPath = join(__dirname, '..', 'character', characterName, `${characterName}.csv`);
  if (!existsSync(characterPath)) {
    throw new Error(`キャラクター設定が見つかりません: ${characterName}`);
  }

  const content = readFileSync(characterPath, 'utf-8');
  return parseCSV(content);
}

/**
 * 画像一貫性ルールを読み込み
 */
function loadImageRule(ruleName) {
  const rulePath = join(__dirname, '..', 'imagerule', `${ruleName}.csv`);
  if (!existsSync(rulePath)) {
    throw new Error(`一貫性ルールが見つかりません: ${ruleName}`);
  }

  const content = readFileSync(rulePath, 'utf-8');
  return parseCSV(content);
}

/**
 * 全てのキャラクター設定を読み込み
 */
function loadAllCharacters() {
  const characterDir = join(__dirname, '..', 'character');
  if (!existsSync(characterDir)) return [];

  // サブフォルダをリストアップ
  const folders = readdirSync(characterDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  const characters = [];

  for (const characterName of folders) {
    try {
      const character = loadCharacter(characterName);
      characters.push(character);
    } catch (error) {
      console.warn(`⚠️  ${characterName}の読み込みをスキップ:`, error.message);
    }
  }

  return characters;
}

/**
 * 全ての画像一貫性ルールを読み込み
 */
function loadAllImageRules() {
  const imageruleDir = join(__dirname, '..', 'imagerule');
  if (!existsSync(imageruleDir)) return [];

  const files = readdirSync(imageruleDir).filter(file => file.endsWith('.csv'));
  const rules = [];

  for (const file of files) {
    const ruleName = file.replace('.csv', '');
    try {
      const rule = loadImageRule(ruleName);
      rules.push(rule);
    } catch (error) {
      console.warn(`⚠️  ${ruleName}の読み込みをスキップ:`, error.message);
    }
  }

  return rules;
}

/**
 * 既存のカレンダーを読み込む
 */
function loadExistingCalendars() {
  const calendarDir = join(__dirname, '..', 'calendar');
  if (!existsSync(calendarDir)) {
    mkdirSync(calendarDir, { recursive: true });
    console.log('📁 calendarフォルダを作成しました');
    return [];
  }

  const files = readdirSync(calendarDir)
    .filter(file => file.startsWith('calendar_') && file.endsWith('.csv'))
    .sort()
    .reverse(); // 最新のファイルを先に

  const existingPosts = [];

  for (const file of files) {
    try {
      const filePath = join(calendarDir, file);
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      lines.forEach((line, index) => {
        const fields = parseCSVLine(line);
        if (fields.length >= 13) {
          existingPosts.push({
            file: file,
            day: index + 1,
            coverImage: fields[0],
            postText: fields[12]
          });
        }
      });
    } catch (error) {
      console.warn(`⚠️  ${file}の読み込みをスキップ:`, error.message);
    }
  }

  return existingPosts;
}

/**
 * AIで投稿カレンダー（CSV）を生成
 */
async function generateCalendar() {
  try {
    console.log('📅 Instagram投稿カレンダーを生成中...\n');

    // APIキーの確認
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEYが設定されていません。.envファイルを確認してください。');
    }

    // 投稿数の設定（環境変数から取得、デフォルトは30日）
    const calendarDays = parseInt(process.env.CALENDAR_DAYS) || 30;
    console.log(`📆 生成する投稿数: ${calendarDays}日分\n`);

    // 既存のカレンダーを読み込む
    const existingPosts = loadExistingCalendars();
    console.log(`📚 既存のカレンダーから${existingPosts.length}件の投稿を読み込みました\n`);

    // 事業情報の読み込み
    const businessSummaryPath = join(__dirname, '..', 'output', 'business-summary.txt');
    if (!existsSync(businessSummaryPath)) {
      throw new Error('business-summary.txtが見つかりません。先にanalyze-homepage.jsを実行してください。');
    }
    const businessSummary = readFileSync(businessSummaryPath, 'utf-8');

    // 全てのキャラクター設定と一貫性ルールの読み込み
    const characters = loadAllCharacters();
    const imageRules = loadAllImageRules();

    console.log('✅ 事業情報を読み込みました');
    console.log(`✅ キャラクター設定を読み込みました（${characters.length}人）`);
    console.log(`✅ 一貫性ルールを読み込みました（${imageRules.length}個）\n`);

    if (characters.length === 0) {
      throw new Error('キャラクター設定が見つかりません。characterフォルダにCSVファイルを配置してください。');
    }

    if (imageRules.length === 0) {
      throw new Error('一貫性ルールが見つかりません。imageruleフォルダにCSVファイルを配置してください。');
    }

    // キャラクター情報を表示
    console.log('👥 読み込んだキャラクター:');
    characters.forEach(char => {
      console.log(`   - ${char.name}`);
    });

    console.log('\n🎨 読み込んだ一貫性ルール:');
    imageRules.forEach(rule => {
      console.log(`   - ${rule.name}`);
    });
    console.log();

    // Gemini APIクライアントの初期化
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // キャラクター情報をプロンプト用にフォーマット
    const charactersSection = characters.map((char, idx) => `
## キャラクター${idx + 1}: ${char.name}
- 外見: ${char.appearance}
- 髪: ${char.hair}
- 目: ${char.eyes}
- 顔: ${char.face}
- 体型: ${char.body}
- 服装: ${char.clothing}
- 性格: ${char.personality}
- 追加情報: ${char.additional}
`).join('\n');

    // 画像ルール情報をプロンプト用にフォーマット
    const imageRulesSection = imageRules.map((rule, idx) => `
## 一貫性ルール${idx + 1}: ${rule.name}
- 場所: ${rule.location}
- キャラクター: ${rule.characters}
- 照明: ${rule.lighting}
- スタイル: ${rule.style}
- 追加情報: ${rule.additional}
`).join('\n');

    // 既存投稿情報をプロンプト用にフォーマット
    let existingPostsSection = '';
    if (existingPosts.length > 0) {
      const recentPosts = existingPosts.slice(0, 30); // 最新30件
      existingPostsSection = `
# 既存の投稿内容（重複を避けるための参考情報）
以下は、既に作成された投稿の内容です。これらと似た内容や重複するテーマを避けて、新しいユニークな投稿を生成してください。

${recentPosts.map((post, idx) => `
## 既存投稿${idx + 1}
- ファイル: ${post.file}
- 表紙画像: ${post.coverImage.substring(0, 100)}...
- 投稿テキスト: ${post.postText.substring(0, 150)}...
`).join('\n')}

**重要: 上記の既存投稿と内容が重複しないよう、新しい視点やテーマで投稿を作成してください。**
`;
    }

    // カレンダー生成用プロンプト
    const prompt = `
あなたはInstagramマーケティングの専門家です。以下の情報をもとに、${calendarDays}日分のInstagram投稿カレンダー（カルーセル形式）を作成してください。

# 事業情報
${businessSummary}

${existingPostsSection}

# キャラクター設定（登場人物の一貫性）
以下の${characters.length}人のキャラクターが利用可能です。投稿内容に応じて適切なキャラクターを選んで使用してください。複数人を1つの投稿に登場させることも可能です。
${charactersSection}

# 画像一貫性ルール
以下の${imageRules.length}個の一貫性ルールが利用可能です。投稿内容に応じて適切なルールを選んで使用してください。
${imageRulesSection}

# カルーセル投稿の構成
各日の投稿は4枚の画像で構成されます：
1. 表紙（キャッチー）
2. 内容1（詳細説明）
3. 内容2（詳細説明）
4. 内容3（まとめ・CTA）

# CSVフォーマット（13列）
A列: 表紙画像説明（日本語）
B列: 表紙テキストエリア1
C列: 表紙テキストエリア2
D列: 内容1画像説明（日本語）
E列: 内容1テキストエリア1
F列: 内容1テキストエリア2
G列: 内容2画像説明（日本語）
H列: 内容2テキストエリア1
I列: 内容2テキストエリア2
J列: 内容3画像説明（日本語）
K列: 内容3テキストエリア1
L列: 内容3テキストエリア2
M列: 投稿のテキスト+ハッシュタグ

## 画像説明（A,D,G,J列）の作成ルール
- **必ず日本語で記述**
- **重要: 架空のキャラクターを作成しないでください。必ず上記の「キャラクター設定」から選択してください**
- 上記の「キャラクター設定」から適切なキャラクターを選んで登場させる（複数人も可）
- **中年男性が必要な場合は、必ず「塾頭高崎翔太」を使用してください**
- 上記の「画像一貫性ルール」から投稿内容に適したルールを選んで適用
- 人物が登場する場合は、選んだキャラクターの外見・服装・性格を正確に描写
- 場所・照明・スタイルは選んだ一貫性ルールに従う
- 具体的で詳細な描写（AIが画像生成できるレベルの詳細さ）
- 各画像は異なる構図・アングルにする
- ${calendarDays}日分の投稿全体で、全てのキャラクターと全てのルールがバランス良く登場するようにする

## テキストエリア1（B,E,H,K列）のルール
- 1行あたり最大8文字
- 最大2行まで
- 単語の途中では改行しない
- 改行は単語の区切り目で行う
- **改行は「\\n」で表現する**（例: "AIと\\n起業"）
- キャッチーで短いフレーズ

## テキストエリア2（C,F,I,L列）のルール
- 1行あたり最大12文字
- 最大4行まで
- 単語の途中では改行しない
- 改行は単語の区切り目で行う
- **改行は「\\n」で表現する**（例: "プログラミング\\nオンライン塾\\nif(塾)へ\\nようこそ！"）
- より詳細な説明

## 投稿テキスト+ハッシュタグ（M列）のルール
- 投稿テキストは改行を使わず、句読点（、。）で区切る
- 200文字程度の魅力的な文章
- 投稿テキストの後にハッシュタグを続ける（スペースで区切る）
- ハッシュタグは#で始め、5〜10個程度

## 投稿テーマ例（${calendarDays}日分に多様性を）
- サービス紹介
- 生徒の成功事例
- 学習Tips
- 業界トレンド
- イベント告知
- Q&A
- ビフォーアフター
- 講師紹介
- お客様の声
- 豆知識
- プログラミング基礎
- AI活用事例
- 起業家精神
- マインクラフト活用
- 無料体験案内

## 重要な制約
- **1日=1行**（必ず13列を1行にまとめる）
- **各日の行の最後には必ず改行を入れる**（${calendarDays}日分=${calendarDays}行にする）
- ヘッダーは不要、データ行のみ${calendarDays}行出力
- フィールドにカンマが含まれる場合はダブルクォートで囲む
- **画像説明は必ず日本語**
- **テキスト内の改行は必ず「\\n」で表現**
- **全てのキャラクター設定と全ての一貫性ルールを活用すること**
- **${calendarDays}日分で、全キャラクターと全ルールがバランス良く登場するように配分する**
- **架空のキャラクターは絶対に作成しないこと。必ず上記のキャラクター設定リストから選択すること**

## 出力フォーマット
以下のように、**必ず各日の行の後に改行を入れて、${calendarDays}行で出力してください**:

1日目の13列データ
2日目の13列データ
3日目の13列データ
${calendarDays > 3 ? '...（中略）...\n' + calendarDays + '日目の13列データ' : ''}

## 出力例（3日分）
"明るい教室でプログラミングを教える山﨑琢己塾長。紺のポロシャツ姿で笑顔。背景にマインクラフト画面。自然光が差し込む明るい雰囲気。","AIと\\n起業","プログラミング\\nオンライン塾\\nif(塾)へ\\nようこそ！","生徒がマインクラフトで遊びながらプログラミング学習。画面にはコードブロック。山﨑塾長がサポート。明るい教室。","遊びが\\n学び","マインクラフトで\\n探求する力\\nAI先生が\\nサポート","思考を巡らせる生徒。ホワイトボードにビジネスモデル図。山﨑塾長が助言。暖かい照明。","未来を\\n創る","AI活用で\\nビジネス\\nモデル構築\\n体験","オンラインで山﨑塾長とメンターが生徒をサポート。画面越しに笑顔。多様な生徒が参加。","実践力\\nを育む","メンターと\\n仕事体験\\n収益化も\\n経験","if(塾)はAIと起業を学ぶオンラインプログラミング塾です。マインクラフトで楽しく学び、AI先生のサポートを受けながら、未来を創る力を養います。 #if塾 #オンラインプログラミング #AI学習"
"サイバーパンクな空間でCTO井上陽斗が開発する様子。ネオンカラーの照明。ダークトーン背景。マインクラフトワールドが画面に映る。","天才\\n開発者","井上CTOが\\n創る未来の\\n学習空間","ゆうまがビジネスモデルについてプレゼンしている。ホログラムでデータが表示される。明るい笑顔。","起業\\n体験","AIで学ぶ\\nビジネスの\\n基礎","塾頭高崎翔太が生徒の心のケアをしている様子。温かい雰囲気。タブレットで個別サポート。","心の\\nサポート","元臨床心理士が\\n寄り添う\\n学習支援","渡辺ゆづきがオンライン会議で生徒と交流している。笑顔で会話。画面越しのコミュニケーション。","繋がり\\nを大切","オンラインで\\n広がる仲間と\\nの絆","if(塾)の個性豊かな講師陣が、それぞれの強みを活かして生徒をサポートします。開発力、起業経験、心のケア、交流促進など、多角的なサポート体制。 #if塾 #講師紹介 #メンター"
"マインクラフトで創造的な建築をする生徒たち。ネオンカラーの光がアクセント。楽しそうな表情。","創造力\\n無限","マインクラフトで\\n世界を創る\\n喜び","AI先生のアバターが生徒にヒントを提示している。ホログラム風のUI。デジタル空間。","AI先生\\nと学ぶ","24時間\\nいつでも質問\\nできる","生徒が自分のプロジェクトを発表している。達成感に満ちた笑顔。画面には自作アプリ。","成果\\n発表","自分の手で\\n創ったもの\\nを披露","オンラインで多様な生徒が学んでいる様子。全国から参加。画面越しの交流。","全国\\n対応","どこからでも\\n学べる\\nオンライン塾","if(塾)では、マインクラフト、AI先生、オンライン環境を活用し、全国どこからでも質の高い教育を受けられます。自分のプロジェクトを創り上げる喜びを体験。 #if塾 #マインクラフト #AI教育

**上記のように、必ず${calendarDays}日分、${calendarDays}行のCSVを出力してください。各行の最後には改行を入れてください。**
`;

    console.log('🤖 Gemini AIでカレンダーを生成中...');
    console.log('⏳ 処理には1〜2分かかる場合があります\n');

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let calendarCSV = response.text().trim();

    // コードブロックのマークダウンを削除
    calendarCSV = calendarCSV.replace(/```csv\n/g, '').replace(/```\n/g, '').replace(/```/g, '');

    // タイムスタンプを生成
    const now = new Date();
    const timestamp = now.toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];

    // calendarフォルダに保存
    const calendarDir = join(__dirname, '..', 'calendar');
    if (!existsSync(calendarDir)) {
      mkdirSync(calendarDir, { recursive: true });
    }
    const calendarPath = join(calendarDir, `calendar_${timestamp}.csv`);
    writeFileSync(calendarPath, calendarCSV, 'utf-8');

    // outputフォルダにも保存（後方互換性のため）
    const csvPath = join(__dirname, '..', 'output', 'calendar.csv');
    writeFileSync(csvPath, calendarCSV, 'utf-8');

    console.log('✅ カレンダーCSVを生成しました');
    console.log(`💾 保存先（メイン）: ${calendarPath}`);
    console.log(`💾 保存先（バックアップ）: ${csvPath}\n`);

    // CSVをパースして検証
    const lines = calendarCSV.split('\n').filter(line => line.trim());
    console.log(`📊 生成された投稿数: ${lines.length}日分\n`);

    // サンプルを表示
    if (lines.length > 0) {
      console.log('📝 最初の投稿のプレビュー:');
      const firstLine = parseCSVLine(lines[0]);
      console.log(`  列数: ${firstLine.length}列`);
      console.log('  表紙画像: ', firstLine[0]?.substring(0, 60) + '...');
      console.log('  表紙テキスト1: ', firstLine[1]);
      console.log('  表紙テキスト2: ', firstLine[2]);
      console.log('  投稿テキスト: ', firstLine[12]?.substring(0, 80) + '...');
    }

    return csvPath;
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
generateCalendar();
