"use client";

import { useActionState, useEffect, useState } from "react";
import { parseAndLog, type LogResult } from "./actions";

const initial: LogResult = { ok: false };

// 로딩 중 번갈아 보여줄 단계 메시지 (실제 진행 단계라기보단 체감용)
const STEPS = [
  "기록을 읽는 중…",
  "음식을 분석하는 중…",
  "칼로리를 계산하는 중…",
  "거의 다 됐어요…",
];

// 🤖 자연어로 하루 기록을 적으면 AI가 몸무게/식사로 정리해 저장한다.
export default function NaturalInput() {
  const [state, formAction, isPending] = useActionState(parseAndLog, initial);
  const [step, setStep] = useState(0);

  // 진행 중일 때만 메시지를 1.4초마다 다음 단계로 (마지막에서 멈춤)
  // 끝나면 cleanup에서 0으로 되돌린다(effect 본문에서 직접 setState 금지 규칙 준수)
  useEffect(() => {
    if (!isPending) return;
    const id = setInterval(() => {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }, 1400);
    return () => {
      clearInterval(id);
      setStep(0);
    };
  }, [isPending]);

  return (
    <section className="mb-5 rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/80 to-teal-50/60 p-6 shadow-xl shadow-emerald-900/[0.06] backdrop-blur-xl">
      <h2 className="mb-1 flex items-center gap-1.5 text-base font-bold text-slate-800">
        🤖 한 줄로 기록하기
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        편하게 적으면 AI가 정리해 드려요. 추가뿐 아니라 삭제도 돼요 — 예) “6월 16일 거 지워줘”, “오늘 점심 삭제”.
      </p>

      <form action={formAction} className="flex flex-col gap-2">
        <textarea
          name="text"
          rows={3}
          required
          disabled={isPending}
          placeholder="예) 오늘 99.25키로였고 점심으로 꼬북칩 초코추러스 먹고 저녁으로 계란국에 삼겹살에 밥 한 공기 먹었어"
          className="resize-none rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200/60 disabled:opacity-60"
        />
        <button
          disabled={isPending}
          className="flex items-center justify-center gap-2 self-end rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:from-emerald-600 hover:to-teal-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
            </svg>
          )}
          {isPending ? "정리하는 중…" : "AI로 정리"}
        </button>
      </form>

      {/* ⏳ 진행 중 인디케이터 — AI가 작업 중임을 분명히 보여준다 */}
      {isPending && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-emerald-200/70 bg-white/70 px-3 py-2.5">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="flex-1 text-xs font-medium text-emerald-700">
            🤖 AI가 {STEPS[step]}
          </span>
          <span className="flex gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400" />
          </span>
        </div>
      )}

      {!isPending && state.ok && state.summary && (
        <p className="mt-3 rounded-xl bg-emerald-100/70 px-3 py-2 text-xs font-medium text-emerald-700">
          ✅ 저장했어요 — {state.summary}
        </p>
      )}
      {!isPending && !state.ok && state.error && (
        <p className="mt-3 rounded-xl bg-rose-100/70 px-3 py-2 text-xs font-medium text-rose-600">
          ⚠️ {state.error}
        </p>
      )}
    </section>
  );
}
