import { prisma } from "@/lib/prisma";
import { addWeight, addMeal, deleteWeight, deleteMeal } from "./actions";
import NaturalInput from "./NaturalInput";

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
  const [yy, mm, dd] = today.split("-");

  const [weights, meals] = await Promise.all([
    prisma.weightEntry.findMany({ orderBy: { date: "desc" }, take: 30 }),
    prisma.mealEntry.findMany({ orderBy: { date: "desc" }, take: 30 }),
  ]);

  const todayCalories = meals
    .filter((m) => fmtDate(m.date) === today && m.calories)
    .reduce((sum, m) => sum + (m.calories ?? 0), 0);

  const latest = weights[0];
  const prev = weights[1];
  const delta = latest && prev ? +(latest.weightKg - prev.weightKg).toFixed(2) : null;

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      {/* 헤더 */}
      <header className="mb-8">
        <div className="mb-1.5 text-sm font-semibold text-emerald-600">
          {parseInt(mm)}월 {parseInt(dd)}일 · {yy}
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          🌿 오늘의 다이어트
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          몸무게와 식사를 가볍게 기록해요.
        </p>
      </header>

      {/* 통계 */}
      <div className="mb-7 grid grid-cols-2 gap-4">
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
      </div>

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

        <div className="space-y-0.5">
          {weights.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-300">아직 기록이 없어요</p>
          )}
          {weights.map((w) => (
            <div key={w.id}
              className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition hover:bg-emerald-50/60">
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
      <section className={card}>
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

        <div className="space-y-0.5">
          {meals.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-300">아직 기록이 없어요</p>
          )}
          {meals.map((m) => {
            const meta = MEAL_META[m.mealType];
            return (
              <div key={m.id}
                className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition hover:bg-amber-50/60">
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

      <footer className="mt-8 text-center text-xs text-slate-300">
        🌿 diet-log · 맥미니 홈서버에서 실행 중
      </footer>
    </main>
  );
}
