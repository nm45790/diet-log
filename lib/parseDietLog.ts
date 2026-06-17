import OpenAI from "openai";

// 끼니 종류 — Prisma의 MealType enum과 동일
export type MealType = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";

// Claude/Gemini/Ollama 어디서 오든 이 모양으로 정리된다.
export type ParsedLog = {
  action: "add" | "delete"; // 추가인지 삭제인지
  date: string; // YYYY-MM-DD
  // ── action="add" 일 때 ──
  weightKg: number | null;
  weightNote: string | null;
  meals: { mealType: MealType; name: string; calories: number | null }[];
  // ── action="delete" 일 때 ──
  // 그 날짜에서 무엇을 지울지. scope=ALL(그날 전부) / WEIGHT(몸무게만) / MEALS(식사)
  // MEALS인데 특정 끼니만이면 mealTypes에 담는다(비어 있으면 그날 식사 전체).
  deleteScope: "ALL" | "WEIGHT" | "MEALS" | null;
  deleteMealTypes: MealType[];
};

// ── LLM 공급자 설정 ──────────────────────────────────────────────
// Gemini든 로컬(Ollama)이든 전부 "OpenAI 호환" API를 제공해서, 코드는 그대로 두고
// .env 값만 바꾸면 공급자를 갈아탈 수 있다. (.env.example 참고)
const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY ?? "",
  baseURL: process.env.LLM_BASE_URL, // 예: https://generativelanguage.googleapis.com/v1beta/openai/
});
const MODEL = process.env.LLM_MODEL ?? "gemini-2.5-flash";

const SYSTEM = `너는 한국어 다이어트 일지를 정리하는 도우미다.
사용자가 자유롭게 적은 문장을 읽고, 추가(add)인지 삭제(delete)인지 먼저 판단해서 아래 JSON으로만 답한다.

먼저 의도 판단:
- "지워/삭제/제거/빼줘/취소" 같은 말이 있으면 action="delete".
- 그 외 먹은 것·몸무게를 적은 거면 action="add".

{
  "action": "add" 또는 "delete",
  "date": "YYYY-MM-DD",              // 문장에 날짜가 없으면 전달된 '오늘 날짜'를 그대로. "6월16일"→올해 기준 YYYY-06-16

  // action="add" 일 때만 채운다 (delete면 null/빈배열)
  "weightKg": 숫자 또는 null,         // kg. "99.25키로"→99.25. 언급 없으면 null
  "weightNote": 문자열 또는 null,     // 몸무게 관련 짧은 메모. 없으면 null
  "meals": [
    { "mealType": "BREAKFAST|LUNCH|DINNER|SNACK", "name": "음식들(쉼표로)", "calories": 정수 또는 null }
  ],

  // action="delete" 일 때만 채운다 (add면 null/빈배열)
  "deleteScope": "ALL|WEIGHT|MEALS 또는 null",  // 그 날짜에서 지울 대상. "6월16일꺼 지워"처럼 통째면 ALL, "몸무게 지워"면 WEIGHT, "점심 지워"면 MEALS
  "deleteMealTypes": []               // deleteScope=MEALS이고 특정 끼니만 지울 때 그 끼니들. "점심 지워"→["LUNCH"]. 그날 식사 전부면 빈 배열
}

규칙:
- 오직 위 JSON만 출력. 설명·마크다운·코드펜스 금지.
- add일 때 없는 끼니/몸무게를 지어내지 않는다. 칼로리는 한국 1인분 기준 합리적 추정(밥 한 공기~300, 삼겹살 1인분~500).
- delete일 때 무엇을 지울지 모호하면 deleteScope=ALL로 본다.`;

/**
 * 자연어 한 줄을 구조화된 다이어트 기록(추가/삭제)으로 변환한다.
 * @param text  사용자가 입력한 자유 문장
 * @param today YYYY-MM-DD (날짜 언급이 없을 때 기본값)
 */
export async function parseDietLog(text: string, today: string): Promise<ParsedLog> {
  const completion = await client.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" }, // Gemini·Ollama 공통 JSON 모드
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `오늘 날짜: ${today}\n\n문장:\n${text}` },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("기록을 정리하지 못했어요. 다시 시도해 주세요.");

  // 혹시 코드펜스가 섞여 와도 안전하게 JSON 본문만 추출
  const jsonText = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

  let data: Partial<ParsedLog>;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error("정리 결과를 읽지 못했어요. 조금 더 자세히 적어볼까요?");
  }

  // 최소한의 방어: 모양 보정 (LLM이 형식을 살짝 어겨도 앱이 안 깨지게)
  const VALID: MealType[] = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];
  const action: "add" | "delete" = data.action === "delete" ? "delete" : "add";
  const scope = data.deleteScope;
  return {
    action,
    date: typeof data.date === "string" ? data.date : today,
    weightKg: typeof data.weightKg === "number" ? data.weightKg : null,
    weightNote:
      typeof data.weightNote === "string" && data.weightNote.trim() ? data.weightNote.trim() : null,
    meals: Array.isArray(data.meals)
      ? data.meals
          .filter((m) => m && typeof m.name === "string" && VALID.includes(m.mealType))
          .map((m) => ({
            mealType: m.mealType,
            name: m.name.trim(),
            calories: typeof m.calories === "number" ? Math.round(m.calories) : null,
          }))
      : [],
    deleteScope: scope === "ALL" || scope === "WEIGHT" || scope === "MEALS" ? scope : null,
    deleteMealTypes: Array.isArray(data.deleteMealTypes)
      ? data.deleteMealTypes.filter((t): t is MealType => VALID.includes(t))
      : [],
  };
}
