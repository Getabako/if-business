import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * ホームページを解析して事業サマリーを生成
 */
async function analyzeHomepage() {
  try {
    console.log('🔍 ホームページ解析を開始します...\n');

    // APIキーの確認
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEYが設定されていません。.envファイルを確認してください。');
    }

    // index.htmlの読み込み（if-Business直下）
    const indexPath = join(__dirname, '..', '..', 'index.html');
    console.log(`📄 index.htmlを読み込んでいます: ${indexPath}\n`);

    if (!existsSync(indexPath)) {
      throw new Error(`index.htmlが見つかりません。if-Business直下にindex.htmlを配置してください。\n確認パス: ${indexPath}`);
    }

    const htmlContent = readFileSync(indexPath, 'utf-8');
    console.log('✅ index.htmlを読み込みました\n');

    // 出力ディレクトリの作成
    const outputDir = join(__dirname, '..', 'output');
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
      console.log('📁 outputフォルダを作成しました\n');
    }

    // 既存のbusiness-summary.txtをチェック
    const businessSummaryPath = join(outputDir, 'business-summary.txt');
    if (existsSync(businessSummaryPath)) {
      console.log('ℹ️  既存のbusiness-summary.txtが見つかりました\n');
      console.log('📄 既存ファイル: ' + businessSummaryPath + '\n');

      // 既存の内容を表示
      const existingContent = readFileSync(businessSummaryPath, 'utf-8');
      console.log('📝 既存の事業サマリー:');
      console.log('---');
      console.log(existingContent.substring(0, 500) + '...');
      console.log('---\n');

      console.log('✅ 既存のbusiness-summary.txtを使用します（再生成はスキップ）\n');
      return businessSummaryPath;
    }

    // Gemini APIクライアントの初期化
    console.log('🤖 Gemini AIでホームページを分析中...\n');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    // プロンプトの作成
    const prompt = `
以下のHTMLから、この事業の特徴を詳しく分析してください。

# HTML内容
${htmlContent}

# 分析項目
以下の項目について、日本語で詳細に分析してください：

1. **事業内容**: どのようなサービス・商品を提供しているか
2. **ターゲット顧客**: 主な顧客層（年齢、属性、ニーズ）
3. **事業の強み**: 他社と差別化できるポイント
4. **提供価値**: 顧客にどのような価値を提供しているか
5. **ブランドイメージ**: どのような印象・雰囲気を打ち出しているか
6. **重要なキーワード**: 事業を表すキーワード（5-10個）

# 出力形式
箇条書きと段落を組み合わせた、読みやすい日本語のテキストで出力してください。
Instagram投稿のコンテンツ企画に使用するため、具体的かつ詳細に記述してください。
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const businessSummary = response.text().trim();

    // business-summary.txtに保存
    writeFileSync(businessSummaryPath, businessSummary, 'utf-8');

    console.log('✅ 事業サマリーを生成しました');
    console.log(`💾 保存先: ${businessSummaryPath}\n`);

    // サマリーのプレビューを表示
    console.log('📝 生成された事業サマリーのプレビュー:');
    console.log('---');
    console.log(businessSummary.substring(0, 500) + '...');
    console.log('---\n');

    return businessSummaryPath;
  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    process.exit(1);
  }
}

// メイン処理
analyzeHomepage();
