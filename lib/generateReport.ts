import OpenAI from "openai";

// 리포트에 넘기는 기간 지표 (서버에서 DB 집계로 계산해 전달)
export type ReportMetrics = {
  period: "week" | "month";
  rangeLabel: string; // 예: "6.13 ~ 6.19"
  weightStart: number | null;
  weightEnd: number | null;
  weightChange: number | null; // end - start (kg, 소수점 2자리)
  avgIntake: number | null; // 일평균 섭취 kcal
  avgBurn: number | null; // 일평균 소모 kcal
  exerciseCount: number; // 기간 내 운동 횟수
  daysLogged: number; // 기록한 날 수
};

// AI가 작성하는 평가 리포트 본문
export type ReportBody = {
  verdict: string; // 한 줄 총평 (이모지 가능)
  highlights: string[]; // 데이터 근거 핵심 2~3개
  coaching: string; // 다음 기간 가벼운 제안 1~2문장
  encouragement: string; // 짧은 응원 한마디
};

const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY ?? "",
  baseURL: process.env.LLM_BASE_URL,
});
const MODEL = process.env.LLM_MODEL ?? "gemini-2.5-flash";

const SYSTEM = `너는 다정하지만 솔직한 한국어 다이어트 코치다.
한 기간의 지표를 받아서 아래 JSON으로만 평가 리포트를 쓴다.

{
  "verdict": "한 줄 총평(이모지 1개 정도 가능). 감량/유지/증가를 데이터에 근거해 솔직하게.",
  "highlights": ["데이터 근거 핵심 2~3개. 예: '몸무게 0.6kg 감소', '일평균 섭취 1850kcal로 안정적', '운동 2회'"],
  "coaching": "다음 기간을 위한 구체적이고 가벼운 제안 1~2문장.",
  "encouragement": "짧고 따뜻한 응원 한마디."
}

규칙:
- 오직 위 JSON만 출력. 설명·마크다운·코드펜스 금지.
- 주어진 수치 안에서만 말한다. 데이터에 없는 수치를 지어내지 않는다.
- 너는 의료인이 아니다. 진단·치료·약물·극단적 단식이나 무리한 감량(주 1kg 초과 권장 등)을 권하지 않는다.
- 칼로리 데이터가 비어 있으면(기록 안 함) 그 점을 부드럽게 짚되 비난하지 않는다.
- 톤은 격려 중심. 잘한 점 먼저, 개선점은 부드럽게.`;

export async function generateReport(metrics: ReportMetrics): Promise<ReportBody> {
  const label = metrics.period === "week" ? "최근 7일" : "최근 30일";
  const user = `기간: ${label} (${metrics.rangeLabel})
몸무게: 시작 ${metrics.weightStart ?? "기록없음"}kg → 현재 ${metrics.weightEnd ?? "기록없음"}kg (변화 ${
    metrics.weightChange === null ? "기록없음" : `${metrics.weightChange}kg`
  })
일평균 섭취: ${metrics.avgIntake === null ? "기록없음" : `${metrics.avgIntake}kcal`}
일평균 소모(운동): ${metrics.avgBurn === null ? "기록없음" : `${metrics.avgBurn}kcal`}
운동 횟수: ${metrics.exerciseCount}회
기록한 날: ${metrics.daysLogged}일`;

  const completion = await client.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("리포트를 만들지 못했어요. 다시 시도해 주세요.");
  const jsonText = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

  let data: Partial<ReportBody>;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error("리포트 결과를 읽지 못했어요. 다시 시도해 주세요.");
  }

  return {
    verdict: typeof data.verdict === "string" ? data.verdict : "이번 기간 기록 요약이에요.",
    highlights: Array.isArray(data.highlights)
      ? data.highlights.filter((h): h is string => typeof h === "string").slice(0, 4)
      : [],
    coaching: typeof data.coaching === "string" ? data.coaching : "",
    encouragement: typeof data.encouragement === "string" ? data.encouragement : "",
  };
}
