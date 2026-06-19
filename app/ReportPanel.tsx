"use client";

import { useRef, useState, useTransition, type CSSProperties } from "react";
import { toPng } from "html-to-image";
import { makeReport, type ReportResult } from "./actions";
import { BRAND } from "@/lib/brand";

// 캡처 대상 카드는 Tailwind 색(oklch) 대신 인라인 hex 스타일로 — 이미지 캡처 안전
const S: Record<string, CSSProperties> = {
  card: {
    width: 380,
    boxSizing: "border-box",
    padding: 24,
    borderRadius: 24,
    border: "1px solid #e2e8f0",
    background: "#ffffff",
    color: "#0f172a",
    fontFamily: "inherit",
    overflow: "hidden", // 혹시 텍스트가 넘쳐도 카드 밖으로 안 삐져나오게
  },
  chip: {
    flex: 1,
    minWidth: 0,
    background: "#f8fafc",
    border: "1px solid #eef2f7",
    borderRadius: 14,
    padding: "10px 8px",
    textAlign: "center",
  },
  chipLabel: { fontSize: 11, color: "#94a3b8", marginBottom: 4 },
  chipValue: { fontSize: 15, fontWeight: 700, lineHeight: 1 },
};

export default function ReportPanel() {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [result, setResult] = useState<ReportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false); // 이미지 생성 중
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const run = () => {
    setResult(null);
    startTransition(async () => setResult(await makeReport(period)));
  };

  const capture = async () => {
    if (!cardRef.current) return null;
    return toPng(cardRef.current, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true });
  };

  const saveImage = async () => {
    setBusy(true);
    try {
      const url = await capture();
      if (!url) return;
      const a = document.createElement("a");
      a.href = url;
      a.download = `diet-report-${period}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  };

  // 📋 클립보드에 PNG '한 가지 형식만' 복사 → 카톡 등에 붙여넣어도 1개만 나옴
  const copyImage = async () => {
    if (!cardRef.current) return;
    setBusy(true);
    try {
      const node = cardRef.current;
      // ClipboardItem에 Blob Promise를 직접 넘김 (Safari의 제스처 요건까지 충족)
      const blobPromise = toPng(node, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true }).then(
        (url) => fetch(url).then((res) => res.blob()),
      );
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 미지원 브라우저 → 저장으로 안내
      await saveImage();
    } finally {
      setBusy(false);
    }
  };

  const shareImage = async () => {
    setBusy(true);
    try {
      const url = await capture();
      if (!url) return;
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], "diet-report.png", { type: "image/png" });
      // 모바일 공유시트 (파일 공유 지원 시)
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "다이어트 리포트" });
      } else {
        // 데스크톱 등 미지원 → 다운로드로 대체
        const a = document.createElement("a");
        a.href = url;
        a.download = "diet-report.png";
        a.click();
      }
    } catch {
      /* 사용자가 공유 취소 시 무시 */
    } finally {
      setBusy(false);
    }
  };

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

  const m = result?.metrics;
  const r = result?.report;

  return (
    <section className="mb-5 rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/80 to-teal-50/60 p-6 shadow-xl shadow-emerald-900/[0.06] backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800">📊 AI 리포트</h2>
        <div className="flex gap-1 rounded-xl bg-slate-100/70 p-1">
          {tab("week", "주간")}
          {tab("month", "월간")}
        </div>
      </div>

      <button
        onClick={run}
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:from-emerald-600 hover:to-teal-600 active:scale-95 disabled:opacity-60"
      >
        {pending && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
          </svg>
        )}
        {pending ? "AI가 평가하는 중…" : `${period === "week" ? "이번 주" : "이번 달"} 리포트 생성`}
      </button>

      {result && !result.ok && (
        <p className="mt-3 rounded-xl bg-rose-100/70 px-3 py-2 text-xs font-medium text-rose-600">
          ⚠️ {result.error}
        </p>
      )}

      {/* 📇 리포트 카드 (이 div가 이미지로 캡처됨) */}
      {result?.ok && m && r && (
        <>
          <div className="mt-4 flex justify-center">
            <div ref={cardRef} style={S.card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 14 }}>
                <div style={{ fontSize: 16, fontWeight: 800, whiteSpace: "nowrap" }}>
                  📊 {m.period === "week" ? "주간" : "월간"} 다이어트 리포트
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {m.rangeLabel}
                </div>
              </div>

              {/* 핵심 수치 */}
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                <div style={S.chip}>
                  <div style={S.chipLabel}>몸무게 변화</div>
                  <div
                    style={{
                      ...S.chipValue,
                      color: m.weightChange === null ? "#0f172a" : m.weightChange <= 0 ? "#059669" : "#e11d48",
                    }}
                  >
                    {m.weightChange === null
                      ? "—"
                      : `${m.weightChange <= 0 ? "▼" : "▲"}${Math.abs(m.weightChange)}kg`}
                  </div>
                </div>
                <div style={S.chip}>
                  <div style={S.chipLabel}>일평균 섭취</div>
                  <div style={S.chipValue}>{m.avgIntake === null ? "—" : m.avgIntake.toLocaleString()}</div>
                </div>
                <div style={S.chip}>
                  <div style={S.chipLabel}>운동</div>
                  <div style={S.chipValue}>{m.exerciseCount}회</div>
                </div>
              </div>

              {/* 총평 */}
              <div
                style={{
                  background: "#ecfdf5",
                  border: "1px solid #d1fae5",
                  borderRadius: 14,
                  padding: "12px 14px",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#065f46",
                  marginBottom: 12,
                }}
              >
                {r.verdict}
              </div>

              {/* 하이라이트 */}
              {r.highlights.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {r.highlights.map((h, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, fontSize: 13, color: "#334155", marginBottom: 5 }}>
                      <span style={{ color: "#10b981" }}>✓</span>
                      <span>{h}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 코칭 */}
              {r.coaching && (
                <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5, marginBottom: 10 }}>
                  💡 {r.coaching}
                </div>
              )}

              {/* 응원 */}
              {r.encouragement && (
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0f766e", marginBottom: 12 }}>
                  {r.encouragement}
                </div>
              )}

              <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 10, fontSize: 11, color: "#cbd5e1", textAlign: "center" }}>
                {BRAND.mark} {BRAND.name} · {BRAND.tagline}
              </div>
            </div>
          </div>

          {/* 저장 / 공유 */}
          <div className="mt-3 flex gap-2">
            <button
              onClick={saveImage}
              disabled={busy}
              className="flex-1 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white disabled:opacity-60"
            >
              🖼️ 저장
            </button>
            <button
              onClick={copyImage}
              disabled={busy}
              className="flex-1 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white disabled:opacity-60"
            >
              {copied ? "✅ 복사됨" : "📋 복사"}
            </button>
            <button
              onClick={shareImage}
              disabled={busy}
              className="flex-1 rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-900 active:scale-95 disabled:opacity-60"
            >
              📤 공유
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            ※ AI 평가는 참고용이에요. 의료 조언이 아닙니다.
          </p>
        </>
      )}
    </section>
  );
}
