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

  const { company, issue, plan, course } = req.body || {};

  // Validation
  if (!company || !issue || !plan || !course) {
    return res.status(400).json({ error: "すべての項目を入力してください。" });
  }

  if (
    company.length > MAX_LENGTH ||
    issue.length > MAX_LENGTH ||
    plan.length > MAX_LENGTH
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

    const systemPrompt = `あなたは助成金申請書類の作成を支援する専門家である。
以下のユーザー入力に基づき、「事業展開等実施計画書」のドラフトを作成せよ。

【出力ルール】
- 文体は「だ・である」調の公的ビジネス文書とする
- 具体的な数値目標や期待効果を含める
- 助成金審査員が納得する論理的な構成にする
- 以下のJSON形式で出力する（マークダウンやコードブロックは使わず、純粋なJSONのみ出力せよ）:

{
  "business_plan_summary": "事業計画の概要（300〜500文字程度）",
  "training_necessity": "人材育成の必要性と具体的な訓練内容（300〜500文字程度）",
  "expected_outcome": "期待される成果と数値目標（200〜400文字程度）"
}`;

    const userPrompt = `【会社名・事業概要】
${company}

【現在の課題】
${issue}

【今後やりたいこと・DX計画】
${plan}

【受講予定コース】
${course}`;

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
      !parsed.business_plan_summary ||
      !parsed.training_necessity ||
      !parsed.expected_outcome
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
