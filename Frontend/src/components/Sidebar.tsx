// Sidebar.tsx — contextual properties panel (Excalidraw-style)
import { useEffect, useState } from "react";
import {
  setStroke,
  setBackground,
  setFill,
  setStrokeWidth,
  setStrokeStyle,
  setOpacity,
  getCurrentStyle,
} from "./draw";
import { Minus, MoreHorizontal } from "lucide-react";

const STROKE_PALETTE_LIGHT = ["#111827", "#e11d48", "#f97316", "#16a34a", "#2563eb", "#7c3aed"];
const STROKE_PALETTE_DARK = ["#f5f5f5", "#fb7185", "#fdba74", "#4ade80", "#60a5fa", "#c4b5fd"];
const FILL_PALETTE = ["transparent", "#fecaca", "#fed7aa", "#bbf7d0", "#bfdbfe", "#e9d5ff", "#fde68a"];
const BG_PALETTE_LIGHT = ["#fafaf7", "#ffffff", "#fff7ed", "#f0fdf4", "#eff6ff", "#faf5ff"];
const BG_PALETTE_DARK = ["#121212", "#0a0a0a", "#1a1a1a", "#0f172a", "#1e1b4b", "#18181b"];

type Props = {
  theme: "light" | "dark";
  selectionCount: number;
};

export default function Sidebar({ theme, selectionCount }: Props) {
  const [stroke, setStrokeState] = useState<string>("#111827");
  const [fill, setFillState] = useState<string>("transparent");
  const [opacity, setOpacityState] = useState<number>(1);
  const [width, setWidthState] = useState<number>(2);
  const [style, setStyleState] = useState<"solid" | "dashed" | "dotted">("solid");

  useEffect(() => {
    const s = getCurrentStyle();
    setStrokeState(s.stroke);
    setFillState(s.fill);
    setOpacityState(s.opacity);
    setWidthState(s.strokeWidth);
    setStyleState(s.strokeStyle);
  }, [selectionCount]);

  const panelBase = `fixed left-4 top-1/2 -translate-y-1/2 z-20 rounded-2xl shadow-xl backdrop-blur-md border p-3 w-60 ${
    theme === "dark" ? "bg-[#1e1e1e]/95 border-white/10 text-gray-100" : "bg-white/95 border-black/5 text-gray-900"
  }`;

  const STROKE_PALETTE = theme === "dark" ? STROKE_PALETTE_DARK : STROKE_PALETTE_LIGHT;
  const BG_PALETTE = theme === "dark" ? BG_PALETTE_DARK : BG_PALETTE_LIGHT;

  return (
    <aside className={panelBase}>
      <div className="space-y-4">
        <Group label="Stroke">
          <div className="flex flex-wrap gap-1.5 items-center">
            {STROKE_PALETTE.map((c) => (
              <Swatch key={c} color={c} selected={stroke === c} onClick={() => { setStroke(c); setStrokeState(c); }} theme={theme} />
            ))}
            <ColorPicker value={stroke} onChange={(v) => { setStroke(v); setStrokeState(v); }} theme={theme} />
          </div>
        </Group>

        <Group label="Fill">
          <div className="flex flex-wrap gap-1.5 items-center">
            {FILL_PALETTE.map((c) => (
              <Swatch
                key={c}
                color={c}
                selected={fill === c}
                onClick={() => { setFill(c); setFillState(c); }}
                theme={theme}
                transparent={c === "transparent"}
              />
            ))}
            <ColorPicker value={fill === "transparent" ? "#ffffff" : fill} onChange={(v) => { setFill(v); setFillState(v); }} theme={theme} />
          </div>
        </Group>

        <Group label="Stroke width">
          <div className="flex items-center gap-2">
            {[2, 4, 8].map((w) => (
              <button
                key={w}
                onClick={() => { setStrokeWidth(w); setWidthState(w); }}
                className={`flex-1 h-9 rounded-lg border transition-all flex items-center justify-center ${
                  width === w
                    ? (theme === "dark" ? "bg-indigo-500/30 border-indigo-400" : "bg-indigo-50 border-indigo-400")
                    : (theme === "dark" ? "border-white/10 hover:bg-white/5" : "border-gray-200 hover:bg-black/5")
                }`}
                title={`${w}px`}
              >
                <div
                  className={`rounded-full ${theme === "dark" ? "bg-gray-100" : "bg-gray-900"}`}
                  style={{ width: 24, height: Math.max(2, w) }}
                />
              </button>
            ))}
          </div>
          <input
            type="range"
            min={1}
            max={20}
            value={width}
            onChange={(e) => { const v = Number(e.target.value); setStrokeWidth(v); setWidthState(v); }}
            className="w-full mt-2 accent-indigo-500"
          />
        </Group>

        <Group label="Stroke style">
          <div className="flex items-center gap-2">
            <StyleBtn active={style === "solid"} onClick={() => { setStrokeStyle("solid"); setStyleState("solid"); }} theme={theme}>
              <Minus className="w-4 h-4" />
            </StyleBtn>
            <StyleBtn active={style === "dashed"} onClick={() => { setStrokeStyle("dashed"); setStyleState("dashed"); }} theme={theme}>
              <div className={`w-6 h-0.5 ${theme === "dark" ? "bg-gray-100" : "bg-gray-900"}`} style={{ backgroundImage: `repeating-linear-gradient(to right, currentColor 0 6px, transparent 6px 10px)` }} />
            </StyleBtn>
            <StyleBtn active={style === "dotted"} onClick={() => { setStrokeStyle("dotted"); setStyleState("dotted"); }} theme={theme}>
              <MoreHorizontal className="w-4 h-4" />
            </StyleBtn>
          </div>
        </Group>

        <Group label="Opacity">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(opacity * 100)}
              onChange={(e) => { const v = Number(e.target.value) / 100; setOpacity(v); setOpacityState(v); }}
              className="flex-1 accent-indigo-500"
            />
            <span className={`text-xs font-mono w-10 text-right ${theme === "dark" ? "text-gray-300" : "text-gray-600"}`}>
              {Math.round(opacity * 100)}%
            </span>
          </div>
        </Group>

        <div className={`h-px ${theme === "dark" ? "bg-white/10" : "bg-black/10"}`} />

        <Group label="Canvas background">
          <div className="flex flex-wrap gap-1.5">
            {BG_PALETTE.map((c) => (
              <Swatch key={c} color={c} selected={false} onClick={() => setBackground(c)} theme={theme} />
            ))}
            <button
              onClick={() => setBackground("transparent")}
              className="w-6 h-6 rounded-md border border-dashed border-gray-400 flex items-center justify-center text-[10px] uppercase text-gray-500"
              title="Transparent"
            >—</button>
          </div>
        </Group>

        {selectionCount > 0 && (
          <div className={`text-xs font-medium px-2.5 py-1.5 rounded-lg ${theme === "dark" ? "bg-indigo-500/20 text-indigo-200" : "bg-indigo-50 text-indigo-700"}`}>
            {selectionCount} element{selectionCount === 1 ? "" : "s"} selected
          </div>
        )}
      </div>
    </aside>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider opacity-60 mb-2">{label}</h3>
      {children}
    </div>
  );
}

function Swatch({ color, selected, onClick, theme, transparent }: { color: string; selected: boolean; onClick: () => void; theme: "light" | "dark"; transparent?: boolean }) {
  const isTransparent = color === "transparent" || transparent;
  return (
    <button
      onClick={onClick}
      className={`w-6 h-6 rounded-md border-2 transition-transform hover:scale-110 ${selected ? (theme === "dark" ? "ring-2 ring-indigo-400 border-transparent" : "ring-2 ring-indigo-500 border-transparent") : (theme === "dark" ? "border-white/10" : "border-black/10")}`}
      style={{
        backgroundColor: isTransparent ? (theme === "dark" ? "#1e1e1e" : "#ffffff") : color,
        backgroundImage: isTransparent
          ? `repeating-conic-gradient(${theme === "dark" ? "#444" : "#ccc"} 0 25%, transparent 0 50%)`
          : "none",
        backgroundSize: "8px 8px",
      }}
      title={color}
    />
  );
}

function StyleBtn({ children, active, onClick, theme }: { children: React.ReactNode; active: boolean; onClick: () => void; theme: "light" | "dark" }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 h-9 rounded-lg border flex items-center justify-center transition-all ${
        active
          ? (theme === "dark" ? "bg-indigo-500/30 border-indigo-400 text-indigo-100" : "bg-indigo-50 border-indigo-400 text-indigo-700")
          : (theme === "dark" ? "border-white/10 hover:bg-white/5 text-gray-200" : "border-gray-200 hover:bg-black/5 text-gray-700")
      }`}
    >
      {children}
    </button>
  );
}

function ColorPicker({ value, onChange, theme }: { value: string; onChange: (v: string) => void; theme: "light" | "dark" }) {
  return (
    <label
      className={`w-6 h-6 rounded-md border cursor-pointer flex items-center justify-center overflow-hidden ${theme === "dark" ? "border-white/20" : "border-black/10"}`}
      title="Custom color"
    >
      <input
        type="color"
        value={/^#([0-9a-f]{6})$/i.test(value) ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="w-10 h-10 -m-2 cursor-pointer"
      />
    </label>
  );
}
