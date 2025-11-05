import { readFileSync, writeFileSync } from 'fs';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * ホームページ（HTML）から事業情報を抽出
 */
async function analyzeHomepage() {
  try {
    console.log('🔍 ホームページを解析中...\n');

    // ホームページのHTMLファイルを読み込む
    const homepagePath = join(__dirname, '..', '..', 'index.html');
    const htmlContent = readFileSync(homepagePath, 'utf-8');

    // JSDOMでHTMLをパース
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;

    // 事業情報を抽出
    const businessInfo = {
      title: '',
      description: '',
      services: [],
      features: [],
      instructors: [],
      allText: ''
    };

    // タイトル抽出
    const titleElement = document.querySelector('title');
    if (titleElement) {
      businessInfo.title = titleElement.textContent.trim();
    }

    // メタディスクリプション抽出
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      businessInfo.description = metaDesc.getAttribute('content') || '';
    }

    // セクションタイトルとコンテンツを抽出
    const sections = document.querySelectorAll('section');
    sections.forEach((section, index) => {
      const sectionTitle = section.querySelector('.section-title, h2, h3');
      const sectionContent = section.textContent.trim();

      if (sectionTitle) {
        const title = sectionTitle.textContent.trim();

        // サービス情報
        if (title.includes('サービス') || title.includes('コース') || title.includes('プログラム')) {
          const items = section.querySelectorAll('.course-card, .service-item, li');
          items.forEach(item => {
            const text = item.textContent.trim();
            if (text.length > 10) {
              businessInfo.services.push(text);
            }
          });
        }

        // 特徴・強み
        if (title.includes('特徴') || title.includes('強み') || title.includes('選ばれる理由')) {
          const items = section.querySelectorAll('li, .feature-item, p');
          items.forEach(item => {
            const text = item.textContent.trim();
            if (text.length > 10 && text.length < 200) {
              businessInfo.features.push(text);
            }
          });
        }

        // 講師情報
        if (title.includes('講師') || title.includes('メンバー') || title.includes('チーム')) {
          const items = section.querySelectorAll('.instructor-card, .member-card, .team-member');
          items.forEach(item => {
            const name = item.querySelector('h3, h4, .name');
            const bio = item.querySelector('p, .bio, .description');
            if (name) {
              businessInfo.instructors.push({
                name: name.textContent.trim(),
                bio: bio ? bio.textContent.trim() : ''
              });
            }
          });
        }
      }
    });

    // 全テキストコンテンツを抽出（改行で区切り）
    const bodyText = document.body.textContent
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
    businessInfo.allText = bodyText;

    // 主要キーワードを抽出
    const keywords = extractKeywords(bodyText);
    businessInfo.keywords = keywords;

    // 結果を保存
    const outputPath = join(__dirname, '..', 'output', 'business-info.json');
    writeFileSync(outputPath, JSON.stringify(businessInfo, null, 2), 'utf-8');

    console.log('✅ 事業情報の抽出完了\n');
    console.log(`タイトル: ${businessInfo.title}`);
    console.log(`サービス数: ${businessInfo.services.length}件`);
    console.log(`特徴: ${businessInfo.features.length}件`);
    console.log(`講師: ${businessInfo.instructors.length}名`);
    console.log(`\n💾 保存先: ${outputPath}`);

    // サマリーを作成（プロンプト用）
    const summary = createBusinessSummary(businessInfo);
    const summaryPath = join(__dirname, '..', 'output', 'business-summary.txt');
    writeFileSync(summaryPath, summary, 'utf-8');
    console.log(`📝 サマリー保存: ${summaryPath}\n`);

    return businessInfo;
  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    process.exit(1);
  }
}

/**
 * キーワード抽出（頻出単語分析）
 */
function extractKeywords(text) {
  // ストップワード（除外する一般的な単語）
  const stopWords = new Set([
    'の', 'に', 'は', 'を', 'た', 'が', 'で', 'て', 'と', 'し', 'れ', 'さ', 'ある', 'いる',
    'も', 'する', 'から', 'な', 'こと', 'として', 'い', 'や', 'れる', 'など', 'なっ', 'ない',
    'この', 'ため', 'その', 'あっ', 'よう', 'また', 'もの', 'という', 'あり', 'まで', 'られ'
  ]);

  // 2文字以上の単語を抽出
  const words = text
    .split(/[\s、。！？,.!?]+/)
    .filter(word => word.length >= 2 && !stopWords.has(word));

  // 頻度カウント
  const freq = {};
  words.forEach(word => {
    freq[word] = (freq[word] || 0) + 1;
  });

  // 頻度順にソートして上位20個を返す
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));
}

/**
 * 事業サマリーを作成（AIプロンプト用）
 */
function createBusinessSummary(info) {
  let summary = `# 事業情報サマリー\n\n`;

  summary += `## 基本情報\n`;
  summary += `タイトル: ${info.title}\n`;
  if (info.description) {
    summary += `説明: ${info.description}\n`;
  }
  summary += `\n`;

  if (info.services.length > 0) {
    summary += `## 提供サービス・コース\n`;
    info.services.slice(0, 10).forEach((service, i) => {
      summary += `${i + 1}. ${service}\n`;
    });
    summary += `\n`;
  }

  if (info.features.length > 0) {
    summary += `## 特徴・強み\n`;
    info.features.slice(0, 10).forEach((feature, i) => {
      summary += `${i + 1}. ${feature}\n`;
    });
    summary += `\n`;
  }

  if (info.instructors.length > 0) {
    summary += `## 講師・メンバー\n`;
    info.instructors.forEach((instructor, i) => {
      summary += `${i + 1}. ${instructor.name}\n`;
      if (instructor.bio) {
        summary += `   ${instructor.bio.substring(0, 100)}...\n`;
      }
    });
    summary += `\n`;
  }

  if (info.keywords && info.keywords.length > 0) {
    summary += `## 主要キーワード\n`;
    info.keywords.slice(0, 15).forEach((kw, i) => {
      summary += `${i + 1}. ${kw.word} (${kw.count}回)\n`;
    });
    summary += `\n`;
  }

  return summary;
}

// メイン処理
analyzeHomepage();
