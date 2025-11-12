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
      console.log(`   - ${rule.setting_name || rule.name}`);
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
## 一貫性ルール${idx + 1}: ${rule.setting_name || rule.name}
- 場所・環境: ${rule.location_environment || rule.location}
- キャラクター・人物: ${rule.characters_people || rule.characters}
- 時間帯・照明: ${rule.time_lighting || rule.lighting}
- 雰囲気・スタイル: ${rule.atmosphere_style || rule.style}
- 追加の詳細設定: ${rule.additional_details || rule.additional}
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
あなたはAIビジネス・BtoB向けInstagramマーケティングの専門家です。以下の情報をもとに、${calendarDays}日分のInstagram投稿カレンダー（カルーセル形式）を作成してください。

**重要**: この事業はAI導入支援、AI研修、AIワークフロー開発を提供する企業です。投稿内容は、AI導入事例、お客様の声、最新AI技術トレンド、業務効率化のヒント、DX推進など、ビジネス向けAIサービスに関連するテーマに限定してください。

# 事業情報
${businessSummary}

${existingPostsSection}

# 登場人物の参考情報（オプション）
以下の${characters.length}人のキャラクター設定が利用可能です（オプション）。ビジネスシーンで人物を登場させる場合、これらを参考にすることも、一般的なビジネスパーソン（企業担当者、経営者、コンサルタントなど）を描写することもできます。
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
- **ビジネスパーソンを登場させる場合**:
  - 企業の担当者、経営者、コンサルタント、社員など、ビジネスシーンに適した人物
  - 上記の「キャラクター設定」があれば、そこから選択可能
  - 年齢層や服装はビジネスシーンに適したものに（スーツ、ビジネスカジュアルなど）
- 上記の「画像一貫性ルール」から投稿内容に適したルールを選んで適用
- 人物が登場する場合は、ビジネスシーンに適した外見・服装・雰囲気を描写
- 場所・照明・スタイルは選んだ一貫性ルールに従う
- 具体的で詳細な描写（AIが画像生成できるレベルの詳細さ）
- 各画像は異なる構図・アングルにする
- ${calendarDays}日分の投稿全体で、多様なビジネスシーンと全てのルールがバランス良く登場するようにする

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
- AI導入事例紹介
- お客様の声・成功事例
- 最新AI技術トレンド
- 業務効率化のヒント
- AI活用Tips
- サービス紹介
- Q&A
- ビフォーアフター（AI導入前後）
- AI豆知識
- ChatGPT活用術
- AIワークフロー事例
- AI研修のメリット
- 企業のDX推進
- 初心者向けAI導入ガイド
- 無料相談案内

## 重要な制約
- **1日=1行**（必ず13列を1行にまとめる）
- **各日の行の最後には必ず改行を入れる**（${calendarDays}日分=${calendarDays}行にする）
- ヘッダーは不要、データ行のみ${calendarDays}行出力
- フィールドにカンマが含まれる場合はダブルクォートで囲む
- **画像説明は必ず日本語**
- **テキスト内の改行は必ず「\\n」で表現**
- **全ての一貫性ルールを活用すること**
- **${calendarDays}日分で、多様なビジネスシーンと全ルールがバランス良く登場するように配分する**
- **投稿内容は、AI導入事例、お客様の声、AI情報、業務効率化のヒントなど、AIビジネスに関連するテーマに限定すること**

## 出力フォーマット
以下のように、**必ず各日の行の後に改行を入れて、${calendarDays}行で出力してください**:

1日目の13列データ
2日目の13列データ
3日目の13列データ
${calendarDays > 3 ? '...（中略）...\n' + calendarDays + '日目の13列データ' : ''}

## 出力例（3日分）
"明るいオフィスで企業の担当者がAIツールを使っている様子。笑顔でパソコン画面を見る。背景には業務効率化のグラフ。自然光が差し込む明るい雰囲気。","AI導入で\\n変わる","業務効率が\\n70%アップ！\\n導入事例を\\nご紹介","担当者がChatGPTを使って資料作成している画面。作業時間が大幅に短縮。データが整理される様子。","時間を\\n削減","資料作成が\\n10分に！\\nAIで変わる\\n日常業務","企業の会議室でAI研修を受ける社員たち。講師が丁寧に説明。ノートPCで実践中。暖かい照明。","スキル\\nアップ","初心者でも\\n安心の研修\\nプログラム","オンラインで全国の企業とつながる様子。画面越しに笑顔。多様な業種が参加。","全国\\n対応","どこからでも\\nAI導入\\nサポート","if(Business)は初心者でも安心なAI導入支援サービスです。企業のDX推進、業務効率化、AI研修まで、包括的にサポートします。 #AI導入 #業務効率化 #DX推進"
"サイバーパンクな空間でAI開発の様子。ネオンカラーの照明。ダークトーン背景。複数のモニターにコードとAI画面。","最新\\nAI技術","AIワークフロー\\n開発で\\nビジネスを\\n加速","企業の経営者がAIコンサルタントと相談している様子。ホログラムでデータが表示される。明るい笑顔。","経営の\\n右腕","AIパーソナル\\n顧問プランで\\n伴走支援","お客様の声。満足そうな表情の企業担当者。タブレットで成果を確認。温かい雰囲気。","お客様\\nの声","導入3ヶ月で\\nコスト30%\\n削減を実現","オンライン会議でAI活用の相談をしている様子。笑顔で会話。画面越しのコミュニケーション。","無料\\n相談","まずは気軽に\\nご相談\\nください","if(Business)の包括的なAI導入支援で、企業のDX推進を加速します。AIパーソナル顧問、AI研修、AIワークフロー開発まで、ワンストップでサポート。 #AIコンサル #AI研修 #DX支援"
"明るいオフィスで社員がAIツールで業務をしている様子。効率的に作業。笑顔でコミュニケーション。","業務\\n革新","AIで変わる\\n働き方\\n改革","ChatGPTの画面が表示され、質問に回答している様子。ホログラム風のUI。デジタル空間。","ChatGPT\\n活用","生成AIで\\n業務を\\n効率化","企業が自社のAIワークフローを運用している画面。達成感に満ちた表情。画面には自動化されたプロセス。","成果\\n実感","自社に最適な\\nAIシステム\\nを構築","全国の企業がオンラインでAI導入支援を受けている様子。多様な業種。画面越しの交流。","全国\\n展開","100社以上の\\n導入実績\\nあり","if(Business)では、最新AI技術を活用した業務効率化支援を全国に提供しています。初心者でも安心して導入できる伴走型サポートが特徴です。 #AI活用 #業務自動化 #生成AI

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
