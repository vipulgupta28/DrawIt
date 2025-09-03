// Sidebar.tsx
import { setStroke, setBackground, setStrokeWidth, setStrokeStyle } from "./draw";

export default function Sidebar() {
  const strokeColors = ["black", "red", "green", "orange", "blue"];
  const bgColors = ["white", "pink", "lightgreen", "lightblue", "yellow", "transparent"];

  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-xl p-4 flex flex-col gap-6 z-30">
      {/* Stroke */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Stroke</h3>
        <div className="flex gap-2 flex-wrap">
          {strokeColors.map((c) => (
            <button
              key={c}
              onClick={() => setStroke(c)}
              className="w-6 h-6 rounded-full border"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {/* Stroke width */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Stroke width</h3>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={1}
            max={20}
            defaultValue={2}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
          />
          <div className="text-xs text-gray-600">1–20</div>
        </div>
      </div>

      {/* Stroke style */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Stroke style</h3>
        <div className="flex gap-2">
          <button onClick={() => setStrokeStyle("solid")} className="px-2 py-1 text-xs rounded border">Solid</button>
          <button onClick={() => setStrokeStyle("dashed")} className="px-2 py-1 text-xs rounded border">Dashed</button>
          <button onClick={() => setStrokeStyle("dotted")} className="px-2 py-1 text-xs rounded border">Dotted</button>
        </div>
      </div>

      {/* Background */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Background</h3>
        <div className="flex gap-2 flex-wrap">
          {bgColors.map((c) => (
            <button
              key={c}
              onClick={() => setBackground(c === "transparent" ? "transparent" : c)}
              className="w-6 h-6 rounded border"
              style={{
                backgroundColor: c === "transparent" ? "white" : c,
                backgroundImage: c === "transparent"
                  ? "linear-gradient(45deg, #ccc 25%, transparent 25%),linear-gradient(-45deg, #ccc 25%, transparent 25%),linear-gradient(45deg, transparent 75%, #ccc 75%),linear-gradient(-45deg, transparent 75%, #ccc 75%)"
                  : "none",
                backgroundSize: "10px 10px",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
