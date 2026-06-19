"use client";

import { useState } from "react";

type Pt = { d: string; kg: number }; // 몸무게 측정점 (d=YYYY-MM-DD)
type Day = { d: string; v: number }; // 하루 합계 (섭취/소모)

// 날짜 문자열(YYYY-MM-DD)을 일(day) 정수로 — 차트 x좌표 계산용
const dayNum = (d: string) => Math.round(Date.parse(d + "T00:00:00Z") / 86400000);

// 몸무게 추세 미니 라인차트 (라이브러리 없이 SVG로 직접)
function Sparkline({ pts }: { pts: Pt[] }) {
  if (pts.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-xs text-slate-300">
        기간 내 몸무게 기록이 없어요
      </div>
    );
  }
  const W = 320, H = 96, pad = 12;
  const xs = pts.map((p) => dayNum(p.d));
  const kgs = pts.map((p) => p.kg);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...kgs), maxY = Math.max(...kgs);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const X = (d: string) => pad + ((dayNum(d) - minX) / spanX) * (W - pad * 2);
  const Y = (kg: number) => pad + (1 - (kg - minY) / spanY) * (H - pad * 2);
  const path = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${X(p.d).toFixed(1)} ${Y(p.kg).toFixed(1)}`)
    .join(" ");
  const last = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" preserveAspectRatio="none">
      {pts.length > 1 && (
        <path
          d={path}
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {/* 마지막 측정점만 강조 */}
      <circle cx={X(last.d)} cy={Y(last.kg)} r="3" fill="#10b981" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Stat({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: string }) {
  return (
    <div className="flex-1 rounded-2xl bg-white/60 px-3 py-2.5 text-center">
      <div className="text-[11px] font-medium text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-bold leading-none">
        <span className={tone ?? "text-slate-900"}>{value}</span>
        {unit && <span className="ml-0.5 text-xs font-normal text-slate-400">{unit}</span>}
      </div>
    </div>
  );
}

export default function StatsPanel({
  weightPoints,
  intakeByDay,
  burnByDay,
  weekStart,
  monthStart,
  today,
}: {
  weightPoints: Pt[];
  intakeByDay: Day[];
  burnByDay: Day[];
  weekStart: string;
  monthStart: string;
  today: string;
}) {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const start = period === "week" ? weekStart : monthStart;
  const inRange = (d: string) => d >= start && d <= today;

  // 기간 내 데이터 (weightPoints는 날짜 오름차순으로 들어옴)
  const wPts = weightPoints.filter((p) => inRange(p.d));
  const weightChange =
    wPts.length >= 2 ? Math.round((wPts[wPts.length - 1].kg - wPts[0].kg) * 100) / 100 : null;

  const avg = (arr: number[]) =>
    arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;
  const avgIntake = avg(intakeByDay.filter((x) => inRange(x.d)).map((x) => x.v));
  const avgBurn = avg(burnByDay.filter((x) => inRange(x.d)).map((x) => x.v));

  const tab = (p: "week" | "month", label: string) => (
    <button
      onClick={() => setPeriod(p)}
      className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
        period === p ? "bg-emerald-500 text-white shadow" : "text-slate-500 hover:bg-white/60"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="mb-5 rounded-3xl border border-white/80 bg-white/55 p-6 shadow-xl shadow-emerald-900/[0.06] backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800">📈 추세</h2>
        <div className="flex gap-1 rounded-xl bg-slate-100/70 p-1">
          {tab("week", "주간")}
          {tab("month", "월간")}
        </div>
      </div>

      <Sparkline pts={wPts} />

      <div className="mt-3 flex gap-2">
        <Stat
          label="몸무게 변화"
          value={weightChange === null ? "—" : `${weightChange <= 0 ? "▼" : "▲"} ${Math.abs(weightChange)}`}
          unit={weightChange === null ? undefined : "kg"}
          tone={weightChange === null ? undefined : weightChange <= 0 ? "text-emerald-600" : "text-rose-500"}
        />
        <Stat label="일평균 섭취" value={avgIntake === null ? "—" : avgIntake.toLocaleString()} unit="kcal" />
        <Stat label="일평균 소모" value={avgBurn === null ? "—" : avgBurn.toLocaleString()} unit="kcal" />
      </div>
    </section>
  );
}
