const { GoogleGenerativeAI } = require("@google/generative-ai");

const VALID_COURSES = [
  "AI人材育成プラン",
  "AIマーケティングプラン",
  "AIアプリ開発講座",
];

const MAX_LENGTH = 2000;

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
    return res.status(500).json({ error: "サーバー設定エラーが発生しました。" });
  }

  const { companyName, businessOverview, challenges, futurePlan, course, employeeRole } = req.body || {};

  // Validation
  if (!companyName || !businessOverview || !challenges || !futurePlan || !course || !employeeRole) {
    return res.status(400).json({ error: "すべての項目を入力してください。" });
  }

  if (
    companyName.length > MAX_LENGTH ||
    businessOverview.length > MAX_LENGTH ||
    challenges.length > MAX_LENGTH ||
    futurePlan.length > MAX_LENGTH ||
    employeeRole.length > MAX_LENGTH
  ) {
    return res
      .status(400)
      .json({ error: `各項目は${MAX_LENGTH}文字以内で入力してください。` });
  }

  if (!VALID_COURSES.includes(course)) {
    return res.status(400).json({ error: "無効なコースが選択されています。" });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const systemPrompt = `あなたは、厚生労働省の「人材開発支援助成金（事業展開等リスキリング支援コース）」申請書類作成のプロフェッショナルです。

以下のユーザー入力に基づき、様式第1-2号「事業展開等実施計画」のドラフトを作成してください。

【出力ルール】
- 文体は「だ・である」調の公的ビジネス文書とする
- 具体的な数値目標や期待効果を含める
- 助成金審査員が納得する論理的な構成にする
- 以下のJSON形式で出力する（マークダウンやコードブロックは使わず、純粋なJSONのみ出力せよ）:

{
  "current_situation": "事業展開等を行う理由（300〜500文字程度）：現在の経営環境・課題を踏まえ、なぜ事業展開やDX推進が必要なのかを説得力ある文章で記述",
  "business_plan": "事業展開等の内容（300〜500文字程度）：具体的にどのような事業展開・DX施策を実施するのか、その計画内容を詳細に記述",
  "training_relevance": "訓練と事業展開の関連性（300〜500文字程度）：受講する訓練が事業展開等にどう直結するのか、訓練内容と事業計画の関連性を明確に記述"
}`;

    const userPrompt = `【会社名・代表者名】
${companyName}

【現在の主な事業内容】
${businessOverview}

【現在の課題】
${challenges}

【今後の取り組み・DX計画】
${futurePlan}

【受講予定コース】
${course}

【受講する従業員の職務内容】
${employeeRole}`;

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: systemPrompt + "\n\n" + userPrompt }],
        },
      ],
    });

    const responseText = result.response.text();

    // Parse JSON - handle markdown code block wrapping
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      // Try extracting JSON from markdown code block
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1].trim());
      } else {
        // Try finding JSON object in text
        const braceMatch = responseText.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          parsed = JSON.parse(braceMatch[0]);
        } else {
          throw new Error("Failed to parse AI response as JSON");
        }
      }
    }

    // Validate response structure
    if (
      !parsed.current_situation ||
      !parsed.business_plan ||
      !parsed.training_relevance
    ) {
      throw new Error("Incomplete AI response");
    }

    return res.status(200).json(parsed);
  } catch (error) {
    console.error("Gemini API error:", error);
    return res.status(500).json({
      error:
        "AI生成中にエラーが発生しました。しばらく時間をおいて再度お試しください。",
    });
  }
};
