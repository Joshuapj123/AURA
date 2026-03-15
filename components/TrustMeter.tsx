"use client";
import { useEffect, useState } from "react";
import { animate } from "framer-motion";

export function TrustMeter({ score, active }: { score: number; active: boolean }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!active) return;
    const ctrl = animate(0, score, {
      duration: 2, ease: "easeOut",
      onUpdate: v => setDisplay(Math.round(v)),
    });
    return () => ctrl.stop();
  }, [score, active]);

  const SIZE = 180, SW = 12, R = (SIZE - SW) / 2;
  const CIRC = 2 * Math.PI * R;
  const offset = CIRC * (1 - display / 100);
  const color = display >= 70 ? "#34d399" : display >= 40 ? "#f59e0b" : "#ef4444";
  const label = display >= 70 ? "TRUSTED" : display >= 40 ? "CAUTION" : "FLAGGED";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={SIZE/2} cy={SIZE/2} r={R} fill="none" stroke="#27272a" strokeWidth={SW} />
          <circle cx={SIZE/2} cy={SIZE/2} r={R} fill="none"
            stroke={color} strokeWidth={SW} strokeLinecap="round"
            strokeDasharray={CIRC} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.1s, stroke 0.3s", filter: `drop-shadow(0 0 8px ${color})` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-3xl font-bold tabular-nums" style={{ color, textShadow: `0 0 16px ${color}` }}>
            {display}<span className="text-lg">%</span>
          </span>
          <span className="font-mono text-[10px] tracking-widest mt-0.5" style={{ color: `${color}99` }}>{label}</span>
        </div>
      </div>
      <p className="font-mono text-[10px] text-zinc-600 tracking-widest">CONFIDENCE SCORE</p>
    </div>
  );
}
