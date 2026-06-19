"use server";
// "use server" = 이 함수들은 서버에서만 실행됨. 폼의 action에 바로 연결할 수 있어
// (별도 API 라우트/fetch 없이 폼 제출 → DB 저장이 됨).
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { parseDietLog } from "@/lib/parseDietLog";
import { generateReport as aiReport, type ReportMetrics, type ReportBody } from "@/lib/generateReport";

type MealType = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";

const MEAL_LABEL: Record<MealType, string> = {
  BREAKFAST: "아침",
  LUNCH: "점심",
  DINNER: "저녁",
  SNACK: "간식",
};

// 🤖 자연어 한 줄 → AI가 정리 → 몸무게/식사 한 번에 저장
//    useActionState와 연결하려고 (이전상태, formData) 시그니처를 쓰고 {ok,...}를 반환한다.
export type LogResult = { ok: boolean; error?: string; summary?: string };

export async function parseAndLog(_prev: LogResult, formData: FormData): Promise<LogResult> {
  const text = (formData.get("text") as string)?.trim();
  if (!text) return { ok: false, error: "기록할 내용을 적어주세요." };

  try {
    const today = new Date().toISOString().slice(0, 10);
    const parsed = await parseDietLog(text, today);
    const date = new Date(parsed.date);
    const dateLabel = parsed.date; // YYYY-MM-DD

    // 🗑️ 삭제 의도면 해당 날짜의 기록을 지운다
    if (parsed.action === "delete") {
      if (!parsed.deleteScope) {
        return { ok: false, error: "무엇을 지울지 잘 모르겠어요. 예) '6월 16일 거 지워줘', '오늘 점심 삭제'" };
      }
      let weightDeleted = 0;
      let mealsDeleted = 0;
      let exercisesDeleted = 0;

      if (parsed.deleteScope === "ALL" || parsed.deleteScope === "WEIGHT") {
        const r = await prisma.weightEntry.deleteMany({ where: { date } });
        weightDeleted = r.count;
      }
      if (parsed.deleteScope === "ALL" || parsed.deleteScope === "MEALS") {
        const r = await prisma.mealEntry.deleteMany({
          where: {
            date,
            // 특정 끼니만 지정했으면 그 끼니들만, 아니면 그날 식사 전체
            ...(parsed.deleteMealTypes.length > 0 ? { mealType: { in: parsed.deleteMealTypes } } : {}),
          },
        });
        mealsDeleted = r.count;
      }
      if (parsed.deleteScope === "ALL" || parsed.deleteScope === "EXERCISES") {
        const r = await prisma.exerciseEntry.deleteMany({ where: { date } });
        exercisesDeleted = r.count;
      }

      const total = weightDeleted + mealsDeleted + exercisesDeleted;
      if (total === 0) {
        return { ok: false, error: `${dateLabel}에 지울 기록이 없었어요.` };
      }
      revalidatePath("/");
      const parts: string[] = [];
      if (weightDeleted) parts.push(`몸무게 ${weightDeleted}건`);
      if (mealsDeleted) parts.push(`식사 ${mealsDeleted}건`);
      if (exercisesDeleted) parts.push(`운동 ${exercisesDeleted}건`);
      return { ok: true, summary: `${dateLabel} ${parts.join(" · ")} 삭제` };
    }

    // ➕ 추가: 몸무게 + 식사들을 한 트랜잭션으로 저장 (중간에 실패하면 통째로 롤백)
    const writes = [];
    if (parsed.weightKg !== null) {
      const weightKg = Math.round(parsed.weightKg * 100) / 100; // 소수점 2자리
      writes.push(prisma.weightEntry.create({ data: { date, weightKg, note: parsed.weightNote } }));
    }
    for (const m of parsed.meals) {
      writes.push(
        prisma.mealEntry.create({
          data: { date, mealType: m.mealType, name: m.name, calories: m.calories },
        }),
      );
    }
    for (const x of parsed.exercises) {
      writes.push(
        prisma.exerciseEntry.create({
          data: { date, name: x.name, minutes: x.minutes, caloriesBurned: x.caloriesBurned },
        }),
      );
    }

    if (writes.length === 0) {
      return { ok: false, error: "몸무게·식사·운동 내용을 찾지 못했어요. 조금 더 구체적으로 적어볼까요?" };
    }
    await prisma.$transaction(writes);
    revalidatePath("/");

    // 무엇을 저장했는지 사용자에게 한 줄 요약
    const parts: string[] = [];
    if (parsed.weightKg !== null) parts.push(`몸무게 ${Math.round(parsed.weightKg * 100) / 100}kg`);
    for (const m of parsed.meals) parts.push(`${MEAL_LABEL[m.mealType]} ${m.name}`);
    for (const x of parsed.exercises) parts.push(`🏃 ${x.name}`);
    return { ok: true, summary: parts.join(" · ") };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "정리 중 문제가 생겼어요." };
  }
}

// 🏋️ 몸무게 추가
export async function addWeight(formData: FormData) {
  const date = new Date(formData.get("date") as string);
  // 소수점 2번째 자리까지만 저장 (float 오차 방지)
  const weightKg = Math.round(parseFloat(formData.get("weightKg") as string) * 100) / 100;
  const note = (formData.get("note") as string)?.trim() || null;

  await prisma.weightEntry.create({ data: { date, weightKg, note } });
  revalidatePath("/"); // 저장 후 화면 새로고침 (목록 갱신)
}

// 🍽️ 식사 추가
export async function addMeal(formData: FormData) {
  const date = new Date(formData.get("date") as string);
  const mealType = formData.get("mealType") as MealType;
  const name = (formData.get("name") as string).trim();
  const caloriesRaw = (formData.get("calories") as string)?.trim();
  const calories = caloriesRaw ? parseInt(caloriesRaw, 10) : null;

  await prisma.mealEntry.create({ data: { date, mealType, name, calories } });
  revalidatePath("/");
}

// 📊 AI 기간 리포트 — 기간 데이터를 집계해서 AI 평가를 받아 돌려준다
export type ReportResult = { ok: boolean; error?: string; metrics?: ReportMetrics; report?: ReportBody };

export async function makeReport(period: "week" | "month"): Promise<ReportResult> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const t = new Date(today + "T00:00:00Z");
    t.setUTCDate(t.getUTCDate() - (period === "week" ? 6 : 29));
    const startStr = t.toISOString().slice(0, 10);
    const startDate = new Date(startStr + "T00:00:00Z");
    const fdate = (d: Date) => d.toISOString().slice(0, 10);
    const md = (s: string) => {
      const [, m, d] = s.split("-");
      return `${+m}.${d}`;
    };

    const [weights, meals, exercises] = await Promise.all([
      prisma.weightEntry.findMany({ where: { date: { gte: startDate } }, orderBy: { date: "asc" } }),
      prisma.mealEntry.findMany({ where: { date: { gte: startDate } } }),
      prisma.exerciseEntry.findMany({ where: { date: { gte: startDate } } }),
    ]);

    if (weights.length === 0 && meals.length === 0 && exercises.length === 0) {
      return { ok: false, error: "기간 내 기록이 없어 리포트를 만들 수 없어요." };
    }

    // 몸무게 변화 (기간 첫↔끝)
    const weightStart = weights.length ? Math.round(weights[0].weightKg * 100) / 100 : null;
    const weightEnd = weights.length ? Math.round(weights[weights.length - 1].weightKg * 100) / 100 : null;
    const weightChange =
      weightStart !== null && weightEnd !== null ? Math.round((weightEnd - weightStart) * 100) / 100 : null;

    // 일평균 섭취/소모 (기록된 날 기준)
    const intakeMap = new Map<string, number>();
    for (const m of meals) if (m.calories) intakeMap.set(fdate(m.date), (intakeMap.get(fdate(m.date)) ?? 0) + m.calories);
    const burnMap = new Map<string, number>();
    for (const x of exercises)
      if (x.caloriesBurned) burnMap.set(fdate(x.date), (burnMap.get(fdate(x.date)) ?? 0) + x.caloriesBurned);
    const avg = (m: Map<string, number>) =>
      m.size ? Math.round([...m.values()].reduce((s, v) => s + v, 0) / m.size) : null;

    // 기록한 날 수 (전체 합집합)
    const days = new Set<string>();
    for (const w of weights) days.add(fdate(w.date));
    for (const m of meals) days.add(fdate(m.date));
    for (const x of exercises) days.add(fdate(x.date));

    const metrics: ReportMetrics = {
      period,
      rangeLabel: `${md(startStr)} ~ ${md(today)}`,
      weightStart,
      weightEnd,
      weightChange,
      avgIntake: avg(intakeMap),
      avgBurn: avg(burnMap),
      exerciseCount: exercises.length,
      daysLogged: days.size,
    };

    const report = await aiReport(metrics);
    return { ok: true, metrics, report };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "리포트 생성 중 문제가 생겼어요." };
  }
}

// 🏃 운동 추가 (수동 입력 폼)
export async function addExercise(formData: FormData) {
  const date = new Date(formData.get("date") as string);
  const name = (formData.get("name") as string).trim();
  const minutesRaw = (formData.get("minutes") as string)?.trim();
  const minutes = minutesRaw ? parseInt(minutesRaw, 10) : null;
  const caloriesRaw = (formData.get("caloriesBurned") as string)?.trim();
  const caloriesBurned = caloriesRaw ? parseInt(caloriesRaw, 10) : null;

  await prisma.exerciseEntry.create({ data: { date, name, minutes, caloriesBurned } });
  revalidatePath("/");
}

// 삭제 (id를 미리 bind해서 폼 action으로 씀)
export async function deleteWeight(id: number) {
  await prisma.weightEntry.delete({ where: { id } });
  revalidatePath("/");
}

export async function deleteMeal(id: number) {
  await prisma.mealEntry.delete({ where: { id } });
  revalidatePath("/");
}

export async function deleteExercise(id: number) {
  await prisma.exerciseEntry.delete({ where: { id } });
  revalidatePath("/");
}
