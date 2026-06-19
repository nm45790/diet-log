import { prisma } from "@/lib/prisma";
import { addWeight, addMeal, addExercise, deleteWeight, deleteMeal, deleteExercise } from "./actions";
import NaturalInput from "./NaturalInput";
import StatsPanel from "./StatsPanel";
import ReportPanel from "./ReportPanel";
import { BRAND } from "@/lib/brand";

// 끼니 라벨 — 파스텔 100 / 텍스트 700 으로 톤 통일 (서로 안 싸우게)
const MEAL_META: Record<string, { label: string; cls: string }> = {
  BREAKFAST: { label: "아침", cls: "bg-amber-100/80 text-amber-700" },
  LUNCH: { label: "점심", cls: "bg-orange-100/80 text-orange-700" },
  DINNER: { label: "저녁", cls: "bg-violet-100/80 text-violet-700" },
  SNACK: { label: "간식", cls: "bg-sky-100/80 text-sky-700" },
};

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const fmtShort = (d: Date) => {
  const [, m, day] = fmtDate(d).split("-");
  return `${parseInt(m)}.${day}`;
};

// 공통 스타일 — 글래스 카드
const card =
  "rounded-3xl border border-white/80 bg-white/55 p-6 shadow-xl shadow-emerald-900/[0.06] backdrop-blur-xl";
const input =
  "rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200/60";
const fieldLabel = "flex flex-col gap-1 text-xs font-medium text-slate-500";
const button =
  "rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:from-emerald-600 hover:to-teal-600 active:scale-95";
const rowDelete =
  "text-slate-300 opacity-0 transition hover:text-rose-500 group-hover:opacity-100";

export default async function Home() {
  const today = fmtDate(new Date());
  const [, mm, dd] = today.split("-");

  const [weights, meals, exercises] = await Promise.all([
    // 날짜 내림차순 + 같은 날짜면 최근 입력(id 큰 것)이 위로
    prisma.weightEntry.findMany({ orderBy: [{ date: "desc" }, { id: "desc" }], take: 30 }),
    prisma.mealEntry.findMany({ orderBy: [{ date: "desc" }, { id: "desc" }], take: 30 }),
    prisma.exerciseEntry.findMany({ orderBy: [{ date: "desc" }, { id: "desc" }], take: 30 }),
  ]);

  const todayCalories = meals
    .filter((m) => fmtDate(m.date) === today && m.calories)
    .reduce((sum, m) => sum + (m.calories ?? 0), 0);

  const todayBurned = exercises
    .filter((x) => fmtDate(x.date) === today && x.caloriesBurned)
    .reduce((sum, x) => sum + (x.caloriesBurned ?? 0), 0);

  // ── 📈 주간/월간 통계용 데이터 (최근 30일) ──
  const dayOffset = (n: number) => {
    const t = new Date(today + "T00:00:00Z");
    t.setUTCDate(t.getUTCDate() - n);
    return t.toISOString().slice(0, 10);
  };
  const weekStart = dayOffset(6); // 최근 7일
  const monthStart = dayOffset(29); // 최근 30일
  const monthStartDate = new Date(monthStart + "T00:00:00Z");

  const [statWeights, statMeals, statExercises] = await Promise.all([
    prisma.weightEntry.findMany({ where: { date: { gte: monthStartDate } }, orderBy: { date: "asc" } }),
    prisma.mealEntry.findMany({ where: { date: { gte: monthStartDate } } }),
    prisma.exerciseEntry.findMany({ where: { date: { gte: monthStartDate } } }),
  ]);

  const weightPoints = statWeights.map((w) => ({ d: fmtDate(w.date), kg: w.weightKg }));
  const intakeMap = new Map<string, number>();
  for (const m of statMeals)
    if (m.calories) intakeMap.set(fmtDate(m.date), (intakeMap.get(fmtDate(m.date)) ?? 0) + m.calories);
  const burnMap = new Map<string, number>();
  for (const x of statExercises)
    if (x.caloriesBurned)
      burnMap.set(fmtDate(x.date), (burnMap.get(fmtDate(x.date)) ?? 0) + x.caloriesBurned);
  const intakeByDay = [...intakeMap].map(([d, v]) => ({ d, v }));
  const burnByDay = [...burnMap].map(([d, v]) => ({ d, v }));

  const latest = weights[0];
  const prev = weights[1];
  const delta = latest && prev ? +(latest.weightKg - prev.weightKg).toFixed(2) : null;

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      {/* 헤더 — 브랜드 */}
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-2xl shadow-lg shadow-emerald-500/30">
            {BRAND.mark}
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{BRAND.name}</h1>
            <p className="text-xs font-medium text-slate-500">{BRAND.tagline}</p>
          </div>
        </div>
        <div className="rounded-full bg-white/70 px-3.5 py-1.5 text-xs font-semibold text-emerald-600 shadow-sm ring-1 ring-emerald-100">
          {parseInt(mm)}.{parseInt(dd)}
        </div>
      </header>

      {/* 통계 */}
      <div className="mb-7 grid grid-cols-3 gap-4">
        <div className={card}>
          <div className="text-xs font-medium text-slate-400">현재 몸무게</div>
          <div className="mt-2 flex items-end gap-1.5">
            <span className="text-3xl font-bold text-slate-900">
              {latest ? latest.weightKg : "—"}
            </span>
            {latest && <span className="mb-1 text-sm text-slate-400">kg</span>}
          </div>
          {delta !== null && (
            <div
              className={`mt-1.5 text-xs font-semibold ${
                delta <= 0 ? "text-emerald-600" : "text-rose-500"
              }`}
            >
              {delta <= 0 ? "▼" : "▲"} {Math.abs(delta)}kg
              <span className="ml-1 font-normal text-slate-400">직전 대비</span>
            </div>
          )}
        </div>

        <div className={card}>
          <div className="text-xs font-medium text-slate-400">오늘 섭취</div>
          <div className="mt-2 flex items-end gap-1.5">
            <span className="text-3xl font-bold text-slate-900">{todayCalories}</span>
            <span className="mb-1 text-sm text-slate-400">kcal</span>
          </div>
          <div className="mt-1.5 text-xs text-slate-400">
            기록 {meals.filter((m) => fmtDate(m.date) === today).length}건
          </div>
        </div>

        <div className={card}>
          <div className="text-xs font-medium text-slate-400">오늘 소모</div>
          <div className="mt-2 flex items-end gap-1.5">
            <span className="text-3xl font-bold text-slate-900">{todayBurned}</span>
            <span className="mb-1 text-sm text-slate-400">kcal</span>
          </div>
          <div className="mt-1.5 text-xs text-slate-400">
            운동 {exercises.filter((x) => fmtDate(x.date) === today).length}건
          </div>
        </div>
      </div>

      {/* 📈 주간/월간 추세 */}
      <StatsPanel
        weightPoints={weightPoints}
        intakeByDay={intakeByDay}
        burnByDay={burnByDay}
        weekStart={weekStart}
        monthStart={monthStart}
        today={today}
      />

      {/* 📊 AI 주간/월간 리포트 */}
      <ReportPanel />

      {/* 🤖 자연어 한 줄 입력 */}
      <NaturalInput />

      {/* 몸무게 */}
      <section className={`mb-5 ${card}`}>
        <h2 className="mb-4 text-base font-bold text-slate-800">🏋️ 몸무게 기록</h2>
        <form action={addWeight} className="mb-5 flex flex-wrap items-end gap-2">
          <label className={fieldLabel}>
            날짜
            <input type="date" name="date" defaultValue={today} required className={input} />
          </label>
          <label className={fieldLabel}>
            몸무게(kg)
            <input type="number" name="weightKg" step="0.01" placeholder="70.55" required
              className={`${input} w-24`} />
          </label>
          <label className={`${fieldLabel} min-w-32 flex-1`}>
            메모
            <input type="text" name="note" placeholder="(선택)" className={input} />
          </label>
          <button className={button}>추가</button>
        </form>

        <div className="space-y-1.5">
          {weights.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-300">아직 기록이 없어요</p>
          )}
          {weights.map((w) => (
            <div key={w.id}
              className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-white/50 px-3 py-2.5 text-sm shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/60">
              <span className="w-12 font-medium text-slate-400">{fmtShort(w.date)}</span>
              <span className="w-20 text-base font-bold text-slate-900">{w.weightKg}kg</span>
              <span className="flex-1 truncate text-slate-400">{w.note}</span>
              <form action={deleteWeight.bind(null, w.id)}>
                <button className={rowDelete}>✕</button>
              </form>
            </div>
          ))}
        </div>
      </section>

      {/* 식사 */}
      <section className={`mb-5 ${card}`}>
        <h2 className="mb-4 text-base font-bold text-slate-800">🍽️ 식사 기록</h2>
        <form action={addMeal} className="mb-5 flex flex-wrap items-end gap-2">
          <label className={fieldLabel}>
            날짜
            <input type="date" name="date" defaultValue={today} required className={input} />
          </label>
          <label className={fieldLabel}>
            끼니
            <select name="mealType" className={input}>
              <option value="BREAKFAST">아침</option>
              <option value="LUNCH">점심</option>
              <option value="DINNER">저녁</option>
              <option value="SNACK">간식</option>
            </select>
          </label>
          <label className={`${fieldLabel} min-w-32 flex-1`}>
            먹은 것
            <input type="text" name="name" placeholder="닭가슴살 샐러드" required className={input} />
          </label>
          <label className={fieldLabel}>
            칼로리
            <input type="number" name="calories" placeholder="(선택)" className={`${input} w-24`} />
          </label>
          <button className={button}>추가</button>
        </form>

        <div className="space-y-1.5">
          {meals.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-300">아직 기록이 없어요</p>
          )}
          {meals.map((m) => {
            const meta = MEAL_META[m.mealType];
            return (
              <div key={m.id}
                className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-white/50 px-3 py-2.5 text-sm shadow-sm transition hover:border-amber-200 hover:bg-amber-50/60">
                <span className="w-12 font-medium text-slate-400">{fmtShort(m.date)}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.cls}`}>
                  {meta.label}
                </span>
                <span className="flex-1 truncate font-medium text-slate-700">{m.name}</span>
                <span className="text-xs font-semibold text-slate-400">
                  {m.calories ? `${m.calories} kcal` : ""}
                </span>
                <form action={deleteMeal.bind(null, m.id)}>
                  <button className={rowDelete}>✕</button>
                </form>
              </div>
            );
          })}
        </div>
      </section>

      {/* 운동 */}
      <section className={card}>
        <h2 className="mb-4 text-base font-bold text-slate-800">🏃 운동 기록</h2>
        <form action={addExercise} className="mb-5 flex flex-wrap items-end gap-2">
          <label className={fieldLabel}>
            날짜
            <input type="date" name="date" defaultValue={today} required className={input} />
          </label>
          <label className={`${fieldLabel} min-w-32 flex-1`}>
            운동
            <input type="text" name="name" placeholder="헬스, 달리기..." required className={input} />
          </label>
          <label className={fieldLabel}>
            시간(분)
            <input type="number" name="minutes" placeholder="(선택)" className={`${input} w-20`} />
          </label>
          <label className={fieldLabel}>
            소모(kcal)
            <input type="number" name="caloriesBurned" placeholder="(선택)" className={`${input} w-24`} />
          </label>
          <button className={button}>추가</button>
        </form>

        <div className="space-y-1.5">
          {exercises.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-300">아직 기록이 없어요</p>
          )}
          {exercises.map((x) => (
            <div key={x.id}
              className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-white/50 px-3 py-2.5 text-sm shadow-sm transition hover:border-sky-200 hover:bg-sky-50/60">
              <span className="w-12 font-medium text-slate-400">{fmtShort(x.date)}</span>
              <span className="rounded-full bg-sky-100/80 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                🏃 운동
              </span>
              <span className="flex-1 truncate font-medium text-slate-700">
                {x.name}
                {x.minutes ? <span className="ml-1 text-slate-400">· {x.minutes}분</span> : null}
              </span>
              <span className="text-xs font-semibold text-slate-400">
                {x.caloriesBurned ? `${x.caloriesBurned} kcal` : ""}
              </span>
              <form action={deleteExercise.bind(null, x.id)}>
                <button className={rowDelete}>✕</button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-10 border-t border-slate-200/60 pt-6 text-center">
        <div className="flex items-center justify-center gap-1.5 text-sm font-bold text-slate-400">
          <span>{BRAND.mark}</span>
          <span>{BRAND.name}</span>
        </div>
        <p className="mt-1 text-xs text-slate-300">AI와 함께하는 가벼운 다이어트 기록</p>
      </footer>
    </main>
  );
}
