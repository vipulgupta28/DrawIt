// draw.tsx — Canvas engine for DrawIt (Excalidraw-style)

type StrokeStyle = "solid" | "dashed" | "dotted";

type BaseShapeProps = {
  stroke: string;
  fill?: string;
  opacity?: number;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
};

type Shape =
  | ({ type: "rect"; x: number; y: number; width: number; height: number; cornerRadius?: number } & BaseShapeProps)
  | ({ type: "diamond"; x: number; y: number; width: number; height: number } & BaseShapeProps)
  | ({ type: "circle"; x: number; y: number; radius: number } & BaseShapeProps)
  | ({ type: "ellipse"; x: number; y: number; width: number; height: number } & BaseShapeProps)
  | ({ type: "triangle"; x1: number; y1: number; x2: number; y2: number; x3: number; y3: number; cornerRadius?: number } & BaseShapeProps)
  | ({ type: "line"; x1: number; y1: number; x2: number; y2: number; arrow?: boolean; cx?: number; cy?: number } & BaseShapeProps)
  | ({ type: "text"; x: number; y: number; text: string; fontSize?: number } & BaseShapeProps)
  | ({ type: "path"; points: { x: number; y: number }[] } & BaseShapeProps);

export type Tool =
  | Shape["type"]
  | "arrow"
  | "select"
  | "pen"
  | "hand"
  | "eraser";

// ---------- engine state ----------
let canvasEl: HTMLCanvasElement | null = null;
let currentTool: Tool = "select";
let currentStroke = "#111827";
let currentFill: string = "transparent";
let currentOpacity = 1;
let currentLineWidth = 2;
let currentStrokeStyle: StrokeStyle = "solid";
let currentBg: string = "#fafaf7"; // excalidraw-ish cream
let gridVisible = true;
let theme: "light" | "dark" = "light";

let existingShapes: Shape[] = [];
let history: Shape[][] = [];
let redoStack: Shape[][] = [];

let selectedShapes: Shape[] = [];

// viewport transform
let viewScale = 1;
let viewPanX = 0;
let viewPanY = 0;

type Snapshot = { shapes: Shape[]; bg: string };

const changeListeners = new Set<(snap: Snapshot) => void>();
const viewListeners = new Set<(view: { scale: number; panX: number; panY: number; width: number; height: number }) => void>();
const selectionListeners = new Set<(count: number) => void>();

// ---------- helpers ----------
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function pushHistory() {
  history.push(clone(existingShapes));
  if (history.length > 200) history.shift();
  redoStack = [];
}

function notifyChange() {
  const snap = getSnapshot();
  changeListeners.forEach((cb) => cb(snap));
}

function notifyView() {
  const v = getViewTransform();
  viewListeners.forEach((cb) => cb(v));
}

function notifySelection() {
  selectionListeners.forEach((cb) => cb(selectedShapes.length));
}

let rafId: number | null = null;
function scheduleRender() {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    renderAll();
  });
}

// ---------- public API ----------
export function setStroke(color: string) { currentStroke = color; applyToSelection({ stroke: color }); }
export function setFill(color: string) { currentFill = color; applyToSelection({ fill: color }); }
export function setOpacity(op: number) { currentOpacity = Math.max(0, Math.min(1, op)); applyToSelection({ opacity: currentOpacity }); }
export function setStrokeWidth(width: number) { currentLineWidth = Math.max(1, Math.min(20, Math.floor(width))); applyToSelection({ strokeWidth: currentLineWidth }); }
export function setStrokeStyle(style: StrokeStyle) { currentStrokeStyle = style; applyToSelection({ strokeStyle: style }); }

export function setBackground(color: string) {
  currentBg = color;
  scheduleRender();
  notifyChange();
}

export function setTheme(t: "light" | "dark") {
  theme = t;
  currentBg = t === "dark" ? "#121212" : "#fafaf7";
  currentStroke = t === "dark" ? "#f5f5f5" : "#111827";
  scheduleRender();
  notifyChange();
}

export function getTheme() { return theme; }
export function toggleGrid() { gridVisible = !gridVisible; scheduleRender(); }
export function isGridVisible() { return gridVisible; }

export function getCurrentStyle() {
  return {
    stroke: currentStroke,
    fill: currentFill,
    opacity: currentOpacity,
    strokeWidth: currentLineWidth,
    strokeStyle: currentStrokeStyle,
  };
}

export function setTool(tool: Tool) {
  currentTool = tool;
  if (canvasEl) canvasEl.style.cursor = cursorForTool(tool);
  if (tool !== "select") {
    selectedShapes = [];
    notifySelection();
    scheduleRender();
  }
}

function cursorForTool(t: Tool): string {
  switch (t) {
    case "hand": return "grab";
    case "select": return "default";
    case "text": return "text";
    case "eraser": return "crosshair";
    default: return "crosshair";
  }
}

export function setZoom(factor: number, anchor?: { x: number; y: number }) {
  if (!canvasEl) return;
  const w = canvasEl.width;
  const h = canvasEl.height;
  const sx = anchor ? anchor.x : w / 2;
  const sy = anchor ? anchor.y : h / 2;
  const prev = viewScale;
  const next = Math.max(0.1, Math.min(8, prev * factor));
  const wx = (sx - viewPanX) / prev;
  const wy = (sy - viewPanY) / prev;
  viewPanX = sx - wx * next;
  viewPanY = sy - wy * next;
  viewScale = next;
  scheduleRender();
  notifyView();
}

export function resetView() {
  viewScale = 1;
  viewPanX = 0;
  viewPanY = 0;
  scheduleRender();
  notifyView();
}

export function undo() {
  if (history.length === 0) return;
  redoStack.push(clone(existingShapes));
  existingShapes = history.pop()!;
  selectedShapes = [];
  notifySelection();
  scheduleRender();
  notifyChange();
}

export function redo() {
  if (redoStack.length === 0) return;
  history.push(clone(existingShapes));
  existingShapes = redoStack.pop()!;
  selectedShapes = [];
  notifySelection();
  scheduleRender();
  notifyChange();
}

export function clearAll() {
  if (!existingShapes.length) return;
  pushHistory();
  existingShapes = [];
  selectedShapes = [];
  notifySelection();
  scheduleRender();
  notifyChange();
}

export function deleteSelected() {
  if (!selectedShapes.length) return;
  pushHistory();
  existingShapes = existingShapes.filter((s) => !selectedShapes.includes(s));
  selectedShapes = [];
  notifySelection();
  scheduleRender();
  notifyChange();
}

export function duplicateSelected() {
  if (!selectedShapes.length) return;
  pushHistory();
  const copies: Shape[] = selectedShapes.map((s) => {
    const c = clone(s);
    translateShape(c, 20, 20);
    return c;
  });
  existingShapes.push(...copies);
  selectedShapes = copies;
  notifySelection();
  scheduleRender();
  notifyChange();
}

export function selectAll() {
  selectedShapes = [...existingShapes];
  notifySelection();
  scheduleRender();
}

export function bringForward() {
  if (!selectedShapes.length) return;
  pushHistory();
  for (const s of selectedShapes) {
    const i = existingShapes.indexOf(s);
    if (i >= 0 && i < existingShapes.length - 1) {
      existingShapes.splice(i, 1);
      existingShapes.splice(i + 1, 0, s);
    }
  }
  scheduleRender();
  notifyChange();
}

export function sendBackward() {
  if (!selectedShapes.length) return;
  pushHistory();
  for (const s of selectedShapes) {
    const i = existingShapes.indexOf(s);
    if (i > 0) {
      existingShapes.splice(i, 1);
      existingShapes.splice(i - 1, 0, s);
    }
  }
  scheduleRender();
  notifyChange();
}

export function exportPNG(options?: { transparent?: boolean; padding?: number }): string | null {
  if (!canvasEl) return null;
  // export the current visible canvas; keep simple to avoid breaking API
  if (!options?.transparent) return canvasEl.toDataURL("image/png");
  // transparent export: render shapes only on a new canvas
  const off = document.createElement("canvas");
  off.width = canvasEl.width;
  off.height = canvasEl.height;
  const c = off.getContext("2d");
  if (!c) return null;
  c.setTransform(viewScale, 0, 0, viewScale, viewPanX, viewPanY);
  existingShapes.forEach((s) => drawShape(c, s));
  return off.toDataURL("image/png");
}

export function onChange(listener: (snap: Snapshot) => void) {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

export function onViewChange(listener: (view: { scale: number; panX: number; panY: number; width: number; height: number }) => void) {
  viewListeners.add(listener);
  return () => viewListeners.delete(listener);
}

export function onSelectionChange(listener: (count: number) => void) {
  selectionListeners.add(listener);
  return () => selectionListeners.delete(listener);
}

export function getSnapshot(): Snapshot {
  return { shapes: clone(existingShapes), bg: currentBg };
}

export function getViewTransform() {
  return { scale: viewScale, panX: viewPanX, panY: viewPanY, width: canvasEl?.width || 0, height: canvasEl?.height || 0 };
}

export function getSelectionCount() { return selectedShapes.length; }

export function replaceSnapshot(snap: Snapshot) {
  existingShapes = clone(snap.shapes);
  currentBg = snap.bg;
  selectedShapes = [];
  notifySelection();
  scheduleRender();
}

function applyToSelection(patch: Partial<BaseShapeProps>) {
  if (!selectedShapes.length) return;
  selectedShapes.forEach((s) => {
    Object.assign(s, patch);
  });
  scheduleRender();
  notifyChange();
}

// ---------- rendering ----------
function renderAll() {
  if (!canvasEl) return;
  const ctx = canvasEl.getContext("2d");
  if (!ctx) return;

  // reset transform and paint background
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  if (currentBg !== "transparent") {
    ctx.fillStyle = currentBg;
    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
  }

  // grid
  if (gridVisible) drawGrid(ctx);

  // world space
  ctx.save();
  ctx.setTransform(viewScale, 0, 0, viewScale, viewPanX, viewPanY);
  existingShapes.forEach((s) => drawShape(ctx, s));

  // selection overlay
  if (selectedShapes.length > 0) {
    selectedShapes.forEach((s) => drawSelectionOverlay(ctx, s));
    // group bounding box for multi-select
    if (selectedShapes.length > 1) {
      const b = unionBounds(selectedShapes);
      ctx.save();
      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 1 / viewScale;
      ctx.setLineDash([6 / viewScale, 4 / viewScale]);
      ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
      ctx.restore();
    }
  }
  ctx.restore();

  // marquee in screen space
  if (marquee) {
    ctx.save();
    ctx.fillStyle = "rgba(99,102,241,0.08)";
    ctx.strokeStyle = "#6366f1";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    const x = Math.min(marquee.sx, marquee.ex);
    const y = Math.min(marquee.sy, marquee.ey);
    const w = Math.abs(marquee.ex - marquee.sx);
    const h = Math.abs(marquee.ey - marquee.sy);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }
}

function drawGrid(ctx: CanvasRenderingContext2D) {
  if (!canvasEl) return;
  const w = canvasEl.width;
  const h = canvasEl.height;
  // spacing in world units — dots every 20 world px
  const worldSpacing = 20;
  const minScreenSpacing = 14;
  let step = worldSpacing;
  while (step * viewScale < minScreenSpacing) step *= 2;

  const startX = Math.floor((-viewPanX / viewScale) / step) * step;
  const endX = startX + Math.ceil(w / viewScale / step) * step + step;
  const startY = Math.floor((-viewPanY / viewScale) / step) * step;
  const endY = startY + Math.ceil(h / viewScale / step) * step + step;

  ctx.save();
  ctx.setTransform(viewScale, 0, 0, viewScale, viewPanX, viewPanY);
  ctx.fillStyle = theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.09)";
  const r = Math.max(1, 1.25 / viewScale);
  for (let x = startX; x <= endX; x += step) {
    for (let y = startY; y <= endY; y += step) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function applyShapeStyle(ctx: CanvasRenderingContext2D, s: Shape) {
  const lw = s.strokeWidth ?? currentLineWidth;
  const ls = s.strokeStyle ?? currentStrokeStyle;
  ctx.lineWidth = lw;
  ctx.globalAlpha = s.opacity ?? 1;
  if (ls === "dashed") ctx.setLineDash([lw * 4, lw * 2]);
  else if (ls === "dotted") ctx.setLineDash([lw, lw * 2]);
  else ctx.setLineDash([]);
  ctx.strokeStyle = s.stroke;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
  ctx.save();
  applyShapeStyle(ctx, s);
  if (s.type === "rect") {
    pathRoundedRect(ctx, s.x, s.y, s.width, s.height, s.cornerRadius ?? 8);
    if (s.fill && s.fill !== "transparent") { ctx.fillStyle = s.fill; ctx.fill(); }
    ctx.stroke();
  } else if (s.type === "diamond") {
    const cx = s.x + s.width / 2;
    const cy = s.y + s.height / 2;
    ctx.beginPath();
    ctx.moveTo(cx, s.y);
    ctx.lineTo(s.x + s.width, cy);
    ctx.lineTo(cx, s.y + s.height);
    ctx.lineTo(s.x, cy);
    ctx.closePath();
    if (s.fill && s.fill !== "transparent") { ctx.fillStyle = s.fill; ctx.fill(); }
    ctx.stroke();
  } else if (s.type === "circle") {
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(0, s.radius), 0, Math.PI * 2);
    if (s.fill && s.fill !== "transparent") { ctx.fillStyle = s.fill; ctx.fill(); }
    ctx.stroke();
  } else if (s.type === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(
      s.x + s.width / 2,
      s.y + s.height / 2,
      Math.abs(s.width / 2),
      Math.abs(s.height / 2),
      0, 0, Math.PI * 2
    );
    if (s.fill && s.fill !== "transparent") { ctx.fillStyle = s.fill; ctx.fill(); }
    ctx.stroke();
  } else if (s.type === "triangle") {
    pathRoundedTriangle(ctx, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }, { x: s.x3, y: s.y3 }, s.cornerRadius ?? 8);
    if (s.fill && s.fill !== "transparent") { ctx.fillStyle = s.fill; ctx.fill(); }
    ctx.stroke();
  } else if (s.type === "line") {
    ctx.beginPath();
    if (s.cx !== undefined && s.cy !== undefined) {
      ctx.moveTo(s.x1, s.y1);
      ctx.quadraticCurveTo(s.cx, s.cy, s.x2, s.y2);
    } else {
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();
    if (s.arrow) drawArrowHead(ctx, s);
  } else if (s.type === "text") {
    const fs = s.fontSize ?? 20;
    ctx.font = `${fs}px "Caveat", "Comic Sans MS", Arial, sans-serif`;
    ctx.fillStyle = s.stroke;
    ctx.textBaseline = "top";
    // support multi-line
    const lines = s.text.split("\n");
    lines.forEach((line, i) => ctx.fillText(line, s.x, s.y + i * fs * 1.2));
  } else if (s.type === "path") {
    if (s.points && s.points.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------- geometry helpers ----------
function pathRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, Math.abs(Math.min(w, h)) / 2));
  const sw = w >= 0 ? 1 : -1;
  const sh = h >= 0 ? 1 : -1;
  const aw = Math.abs(w);
  const ah = Math.abs(h);
  ctx.beginPath();
  ctx.moveTo(x + radius * sw, y);
  ctx.lineTo(x + aw * sw - radius * sw, y);
  ctx.quadraticCurveTo(x + aw * sw, y, x + aw * sw, y + radius * sh);
  ctx.lineTo(x + aw * sw, y + ah * sh - radius * sh);
  ctx.quadraticCurveTo(x + aw * sw, y + ah * sh, x + aw * sw - radius * sw, y + ah * sh);
  ctx.lineTo(x + radius * sw, y + ah * sh);
  ctx.quadraticCurveTo(x, y + ah * sh, x, y + ah * sh - radius * sh);
  ctx.lineTo(x, y + radius * sh);
  ctx.quadraticCurveTo(x, y, x + radius * sw, y);
  ctx.closePath();
}

function pathRoundedTriangle(
  ctx: CanvasRenderingContext2D,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  r: number
) {
  const pts = [p1, p2, p3];
  const radius = Math.max(0, r);
  const corner = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => {
    const abx = b.x - a.x, aby = b.y - a.y;
    const cbx = b.x - c.x, cby = b.y - c.y;
    const abLen = Math.hypot(abx, aby) || 1;
    const cbLen = Math.hypot(cbx, cby) || 1;
    const rab = Math.min(radius, abLen / 2);
    const rcb = Math.min(radius, cbLen / 2);
    return {
      pStart: { x: b.x - (abx / abLen) * rab, y: b.y - (aby / abLen) * rab },
      pEnd: { x: b.x - (cbx / cbLen) * rcb, y: b.y - (cby / cbLen) * rcb },
    };
  };
  const c1 = corner(pts[2], pts[0], pts[1]);
  const c2 = corner(pts[0], pts[1], pts[2]);
  const c3 = corner(pts[1], pts[2], pts[0]);
  ctx.beginPath();
  ctx.moveTo(c1.pStart.x, c1.pStart.y);
  ctx.quadraticCurveTo(pts[0].x, pts[0].y, c1.pEnd.x, c1.pEnd.y);
  ctx.lineTo(c2.pStart.x, c2.pStart.y);
  ctx.quadraticCurveTo(pts[1].x, pts[1].y, c2.pEnd.x, c2.pEnd.y);
  ctx.lineTo(c3.pStart.x, c3.pStart.y);
  ctx.quadraticCurveTo(pts[2].x, pts[2].y, c3.pEnd.x, c3.pEnd.y);
  ctx.closePath();
}

function drawArrowHead(ctx: CanvasRenderingContext2D, s: Extract<Shape, { type: "line" }>) {
  const end = { x: s.x2, y: s.y2 };
  const start = s.cx !== undefined && s.cy !== undefined ? { x: s.cx, y: s.cy } : { x: s.x1, y: s.y1 };
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const size = 12;
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - size * Math.cos(angle - Math.PI / 7), end.y - size * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(end.x - size * Math.cos(angle + Math.PI / 7), end.y - size * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fillStyle = s.stroke;
  ctx.fill();
}

function getBounds(shape: Shape): { x: number; y: number; w: number; h: number } {
  if (shape.type === "rect" || shape.type === "ellipse" || shape.type === "diamond") return { x: shape.x, y: shape.y, w: shape.width, h: shape.height };
  if (shape.type === "circle") return { x: shape.x - shape.radius, y: shape.y - shape.radius, w: shape.radius * 2, h: shape.radius * 2 };
  if (shape.type === "triangle") {
    const minX = Math.min(shape.x1, shape.x2, shape.x3);
    const minY = Math.min(shape.y1, shape.y2, shape.y3);
    const maxX = Math.max(shape.x1, shape.x2, shape.x3);
    const maxY = Math.max(shape.y1, shape.y2, shape.y3);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  if (shape.type === "line") {
    const minX = Math.min(shape.x1, shape.x2);
    const minY = Math.min(shape.y1, shape.y2);
    const maxX = Math.max(shape.x1, shape.x2);
    const maxY = Math.max(shape.y1, shape.y2);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  if (shape.type === "text") {
    const fs = shape.fontSize ?? 20;
    const lines = shape.text.split("\n");
    let mw = 0;
    try {
      const ctx = canvasEl?.getContext("2d");
      if (ctx) {
        ctx.save();
        ctx.font = `${fs}px "Caveat", "Comic Sans MS", Arial, sans-serif`;
        for (const l of lines) mw = Math.max(mw, ctx.measureText(l).width);
        ctx.restore();
      }
    } catch { /* ignore */ }
    if (!mw) mw = Math.max(40, shape.text.length * fs * 0.5);
    return { x: shape.x, y: shape.y, w: mw, h: lines.length * fs * 1.2 };
  }
  if (shape.type === "path") {
    if (!shape.points.length) return { x: 0, y: 0, w: 0, h: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of shape.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  return { x: 0, y: 0, w: 0, h: 0 };
}

function unionBounds(shapes: Shape[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes) {
    const b = getBounds(s);
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function translateShape(s: Shape, dx: number, dy: number) {
  if (s.type === "rect" || s.type === "ellipse" || s.type === "diamond" || s.type === "text" || s.type === "circle") {
    s.x += dx; s.y += dy;
  } else if (s.type === "line") {
    s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy;
    if (s.cx !== undefined) s.cx += dx;
    if (s.cy !== undefined) s.cy += dy;
  } else if (s.type === "triangle") {
    s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; s.x3 += dx; s.y3 += dy;
  } else if (s.type === "path") {
    s.points = s.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  }
}

function hitTest(shape: Shape, x: number, y: number): boolean {
  const pad = 6 / viewScale;
  if (shape.type === "rect" || shape.type === "ellipse" || shape.type === "diamond") {
    if (shape.fill && shape.fill !== "transparent") {
      return x >= shape.x && x <= shape.x + shape.width && y >= shape.y && y <= shape.y + shape.height;
    }
    // near border test
    const inner = x >= shape.x + pad && x <= shape.x + shape.width - pad && y >= shape.y + pad && y <= shape.y + shape.height - pad;
    const outer = x >= shape.x - pad && x <= shape.x + shape.width + pad && y >= shape.y - pad && y <= shape.y + shape.height + pad;
    return outer && !inner;
  }
  if (shape.type === "circle") {
    const d = Math.hypot(x - shape.x, y - shape.y);
    if (shape.fill && shape.fill !== "transparent") return d <= shape.radius;
    return Math.abs(d - shape.radius) <= pad;
  }
  if (shape.type === "line") {
    const d = pointToSegmentDistance(x, y, shape.x1, shape.y1, shape.x2, shape.y2);
    return d <= Math.max(6, (shape.strokeWidth ?? 2)) / viewScale;
  }
  if (shape.type === "triangle") {
    const b = getBounds(shape);
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }
  if (shape.type === "text") {
    const b = getBounds(shape);
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }
  if (shape.type === "path") {
    for (let i = 1; i < shape.points.length; i++) {
      const a = shape.points[i - 1];
      const b = shape.points[i];
      if (pointToSegmentDistance(x, y, a.x, a.y, b.x, b.y) <= Math.max(6, (shape.strokeWidth ?? 2)) / viewScale) return true;
    }
    return false;
  }
  return false;
}

function pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function shapeInsideRect(s: Shape, r: { x: number; y: number; w: number; h: number }) {
  const b = getBounds(s);
  const inter = !(b.x > r.x + r.w || b.x + b.w < r.x || b.y > r.y + r.h || b.y + b.h < r.y);
  return inter;
}

// ---------- selection overlay ----------
function drawSelectionOverlay(ctx: CanvasRenderingContext2D, shape: Shape) {
  const b = getBounds(shape);
  ctx.save();
  ctx.strokeStyle = "#6366f1";
  ctx.lineWidth = 1 / viewScale;
  ctx.setLineDash([4 / viewScale, 3 / viewScale]);
  ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
  ctx.setLineDash([]);

  const handles = [
    { x: b.x, y: b.y, k: "nw" },
    { x: b.x + b.w, y: b.y, k: "ne" },
    { x: b.x, y: b.y + b.h, k: "sw" },
    { x: b.x + b.w, y: b.y + b.h, k: "se" },
    { x: b.x + b.w / 2, y: b.y, k: "n" },
    { x: b.x + b.w / 2, y: b.y + b.h, k: "s" },
    { x: b.x, y: b.y + b.h / 2, k: "w" },
    { x: b.x + b.w, y: b.y + b.h / 2, k: "e" },
  ];
  handles.forEach((h) => drawHandle(ctx, h.x, h.y));

  if (shape.type === "line") {
    drawHandle(ctx, shape.x1, shape.y1, "#ef4444");
    drawHandle(ctx, shape.x2, shape.y2, "#ef4444");
    const mid = { x: (shape.x1 + shape.x2) / 2, y: (shape.y1 + shape.y2) / 2 };
    drawHandle(ctx, shape.cx ?? mid.x, shape.cy ?? mid.y, "#22c55e", true);
  }
  ctx.restore();
}

function drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number, color = "#ffffff", round = false) {
  ctx.save();
  const size = 8 / viewScale;
  ctx.fillStyle = color === "#ffffff" ? "#ffffff" : color;
  ctx.strokeStyle = "#6366f1";
  ctx.lineWidth = 1.5 / viewScale;
  ctx.beginPath();
  if (round) ctx.arc(x, y, size / 1.4, 0, Math.PI * 2);
  else ctx.rect(x - size / 2, y - size / 2, size, size);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function hitTestHandles(shape: Shape, mx: number, my: number): string | null {
  const within = (x: number, y: number, r = 10) => Math.hypot(mx - x, my - y) <= r / viewScale;
  const b = getBounds(shape);
  const handles: Record<string, { x: number; y: number }> = {
    nw: { x: b.x, y: b.y },
    ne: { x: b.x + b.w, y: b.y },
    sw: { x: b.x, y: b.y + b.h },
    se: { x: b.x + b.w, y: b.y + b.h },
    n: { x: b.x + b.w / 2, y: b.y },
    s: { x: b.x + b.w / 2, y: b.y + b.h },
    w: { x: b.x, y: b.y + b.h / 2 },
    e: { x: b.x + b.w, y: b.y + b.h / 2 },
  };
  for (const k of Object.keys(handles)) {
    const c = handles[k];
    if (within(c.x, c.y, 10)) return k;
  }
  if (shape.type === "line") {
    if (within(shape.x1, shape.y1, 12)) return "end1";
    if (within(shape.x2, shape.y2, 12)) return "end2";
    const mid = { x: (shape.x1 + shape.x2) / 2, y: (shape.y1 + shape.y2) / 2 };
    if (within(shape.cx ?? mid.x, shape.cy ?? mid.y, 14)) return "bend";
  }
  return null;
}

function resizeShapeByHandle(shape: Shape, handle: string, mx: number, my: number) {
  if (shape.type === "rect" || shape.type === "ellipse" || shape.type === "diamond") {
    const right = shape.x + shape.width;
    const bottom = shape.y + shape.height;
    if (handle === "nw") { shape.width = right - mx; shape.height = bottom - my; shape.x = mx; shape.y = my; }
    else if (handle === "ne") { shape.width = mx - shape.x; shape.height = bottom - my; shape.y = my; }
    else if (handle === "sw") { shape.width = right - mx; shape.height = my - shape.y; shape.x = mx; }
    else if (handle === "se") { shape.width = mx - shape.x; shape.height = my - shape.y; }
    else if (handle === "n") { shape.height = bottom - my; shape.y = my; }
    else if (handle === "s") { shape.height = my - shape.y; }
    else if (handle === "w") { shape.width = right - mx; shape.x = mx; }
    else if (handle === "e") { shape.width = mx - shape.x; }
  } else if (shape.type === "triangle") {
    const b = getBounds(shape);
    const anchors: Record<string, { ax: number; ay: number }> = {
      nw: { ax: b.x + b.w, ay: b.y + b.h },
      ne: { ax: b.x, ay: b.y + b.h },
      sw: { ax: b.x + b.w, ay: b.y },
      se: { ax: b.x, ay: b.y },
      n: { ax: b.x + b.w / 2, ay: b.y + b.h },
      s: { ax: b.x + b.w / 2, ay: b.y },
      w: { ax: b.x + b.w, ay: b.y + b.h / 2 },
      e: { ax: b.x, ay: b.y + b.h / 2 },
    };
    const a = anchors[handle];
    if (!a) return;
    const newW = Math.abs(mx - a.ax) || 1;
    const newH = Math.abs(my - a.ay) || 1;
    const sx = newW / (b.w || 1);
    const sy = newH / (b.h || 1);
    const signX = mx < a.ax ? -1 : 1;
    const signY = my < a.ay ? -1 : 1;
    const transform = (x: number, y: number) => {
      const lx = (x - a.ax);
      const ly = (y - a.ay);
      const curSignX = lx === 0 ? 0 : lx / Math.abs(lx);
      const curSignY = ly === 0 ? 0 : ly / Math.abs(ly);
      const nx = a.ax + Math.abs(lx) * sx * (curSignX === 0 ? signX : curSignX * (signX === curSignX ? 1 : 1));
      const ny = a.ay + Math.abs(ly) * sy * (curSignY === 0 ? signY : curSignY * (signY === curSignY ? 1 : 1));
      return { x: nx, y: ny };
    };
    const p1 = transform(shape.x1, shape.y1);
    const p2 = transform(shape.x2, shape.y2);
    const p3 = transform(shape.x3, shape.y3);
    shape.x1 = p1.x; shape.y1 = p1.y;
    shape.x2 = p2.x; shape.y2 = p2.y;
    shape.x3 = p3.x; shape.y3 = p3.y;
  } else if (shape.type === "circle") {
    shape.radius = Math.max(2, Math.hypot(mx - shape.x, my - shape.y));
  }
}

// ---------- interactions ----------
let marquee: { sx: number; sy: number; ex: number; ey: number } | null = null;

export default function initDraw(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvasEl = canvas;
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  const resizeCanvas = () => {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    // baseline transform
    viewScale = viewScale; // no-op
    renderAll();
    notifyView();
  };
  resizeCanvas();
  canvas.style.cursor = cursorForTool(currentTool);

  // local interaction state
  let clicked = false;
  let startX = 0;
  let startY = 0;

  let dragging = false;
  let resizing = false;
  let resizeHandle: string | null = null;
  let bending = false;
  let adjustingEnd: 1 | 2 | null = null;
  let isPanning = false;
  let spacePressed = false;
  let panStartX = 0, panStartY = 0, panOriginX = 0, panOriginY = 0;

  let penPoints: { x: number; y: number }[] = [];
  let dragStartWorldX = 0, dragStartWorldY = 0;
  const initialPositions = new Map<Shape, any>();

  const screenToWorld = (sx: number, sy: number) => ({
    x: (sx * dpr - viewPanX) / viewScale,
    y: (sy * dpr - viewPanY) / viewScale,
  });
  const getMousePos = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    return screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  };
  const getScreenPos = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
  };

  // viewPan/scale are already used in DPR-scaled pixel coords
  const handleResize = () => resizeCanvas();
  window.addEventListener("resize", handleResize);

  const isTyping = () => {
    const a = document.activeElement as HTMLElement | null;
    return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
  };

  // keyboard
  const onKeyDown = (e: KeyboardEvent) => {
    if (isTyping()) return;
    if (e.code === "Space") spacePressed = true;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault(); redo(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault(); selectAll(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
      e.preventDefault(); duplicateSelected(); return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedShapes.length) { e.preventDefault(); deleteSelected(); }
      return;
    }
    if (e.key === "Escape") {
      selectedShapes = []; notifySelection(); scheduleRender(); return;
    }

    // arrow key nudging
    if (selectedShapes.length && ["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      pushHistory();
      selectedShapes.forEach((s) => translateShape(s, dx, dy));
      scheduleRender();
      notifyChange();
      return;
    }

    // tool shortcuts (no modifiers)
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
      const map: Record<string, Tool> = {
        v: "select", s: "select", "1": "select",
        r: "rect", "2": "rect",
        o: "ellipse", "3": "ellipse",
        d: "diamond", "4": "diamond",
        a: "arrow", "5": "arrow",
        l: "line", "6": "line",
        p: "pen", "7": "pen",
        t: "text", "8": "text",
        h: "hand",
        e: "eraser",
      };
      const t = map[e.key.toLowerCase()];
      if (t) { setTool(t); return; }
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Space") spacePressed = false;
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  // wheel pan/zoom
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * dpr;
    const sy = (e.clientY - rect.top) * dpr;
    if (e.ctrlKey || e.metaKey) {
      const prev = viewScale;
      const zoomFactor = Math.pow(1.1, -e.deltaY / 100);
      const next = Math.max(0.1, Math.min(8, prev * zoomFactor));
      const wx = (sx - viewPanX) / prev;
      const wy = (sy - viewPanY) / prev;
      viewPanX = sx - wx * next;
      viewPanY = sy - wy * next;
      viewScale = next;
    } else {
      viewPanX -= e.deltaX;
      viewPanY -= e.deltaY;
    }
    scheduleRender();
    notifyView();
  }, { passive: false });

  // mousedown
  canvas.addEventListener("mousedown", (e) => {
    if (isTyping()) return;
    const pos = getMousePos(e);

    // start panning
    if (currentTool === "hand" || e.button === 1 || (spacePressed && e.button === 0)) {
      isPanning = true;
      const sp = getScreenPos(e);
      panStartX = sp.x; panStartY = sp.y;
      panOriginX = viewPanX; panOriginY = viewPanY;
      canvas.style.cursor = "grabbing";
      return;
    }

    if (currentTool === "eraser") {
      clicked = true; // we'll erase on drag too
      const idx = findShapeIndexAt(pos.x, pos.y);
      if (idx >= 0) {
        pushHistory();
        existingShapes.splice(idx, 1);
        scheduleRender();
        notifyChange();
      }
      return;
    }

    // resize/bend/endpoint handles (select + single)
    if (currentTool === "select" && selectedShapes.length === 1) {
      const handle = hitTestHandles(selectedShapes[0], pos.x, pos.y);
      if (handle === "bend") { bending = true; pushHistory(); return; }
      if (handle === "end1") { adjustingEnd = 1; pushHistory(); return; }
      if (handle === "end2") { adjustingEnd = 2; pushHistory(); return; }
      if (handle) { resizing = true; resizeHandle = handle; pushHistory(); return; }
    }

    if (currentTool === "select") {
      let hit: Shape | null = null;
      for (let i = existingShapes.length - 1; i >= 0; i--) {
        if (hitTest(existingShapes[i], pos.x, pos.y)) { hit = existingShapes[i]; break; }
      }
      if (hit) {
        if (e.shiftKey) {
          const i = selectedShapes.indexOf(hit);
          if (i >= 0) selectedShapes.splice(i, 1);
          else selectedShapes.push(hit);
        } else if (!selectedShapes.includes(hit)) {
          selectedShapes = [hit];
        }
        notifySelection();
        dragging = true;
        dragStartWorldX = pos.x; dragStartWorldY = pos.y;
        initialPositions.clear();
        selectedShapes.forEach((s) => initialPositions.set(s, clone(s)));
        pushHistory();
        scheduleRender();
        return;
      } else {
        // start marquee
        const sp = getScreenPos(e);
        marquee = { sx: sp.x, sy: sp.y, ex: sp.x, ey: sp.y };
        if (!e.shiftKey) { selectedShapes = []; notifySelection(); }
        scheduleRender();
        return;
      }
    }

    // drawing tools
    if (currentTool === "text") {
      openTextInput(e, pos);
      return;
    }

    clicked = true;
    startX = pos.x;
    startY = pos.y;
    if (currentTool === "pen") {
      penPoints = [pos];
    }
  });

  // mousemove
  canvas.addEventListener("mousemove", (e) => {
    const pos = getMousePos(e);

    if (isPanning) {
      const sp = getScreenPos(e);
      viewPanX = panOriginX + (sp.x - panStartX);
      viewPanY = panOriginY + (sp.y - panStartY);
      scheduleRender();
      notifyView();
      return;
    }

    if (bending && selectedShapes.length === 1 && selectedShapes[0].type === "line") {
      (selectedShapes[0] as any).cx = pos.x; (selectedShapes[0] as any).cy = pos.y;
      scheduleRender(); return;
    }
    if (adjustingEnd && selectedShapes.length === 1 && selectedShapes[0].type === "line") {
      const s = selectedShapes[0] as any;
      if (adjustingEnd === 1) { s.x1 = pos.x; s.y1 = pos.y; }
      else { s.x2 = pos.x; s.y2 = pos.y; }
      scheduleRender(); return;
    }
    if (resizing && selectedShapes.length === 1) {
      resizeShapeByHandle(selectedShapes[0], resizeHandle!, pos.x, pos.y);
      scheduleRender(); return;
    }

    if (dragging && selectedShapes.length > 0) {
      const dx = pos.x - dragStartWorldX;
      const dy = pos.y - dragStartWorldY;
      selectedShapes.forEach((s) => {
        const init = initialPositions.get(s) as Shape;
        if (!init) return;
        Object.assign(s, clone(init));
        translateShape(s, dx, dy);
      });
      scheduleRender();
      return;
    }

    if (marquee) {
      const sp = getScreenPos(e);
      marquee.ex = sp.x; marquee.ey = sp.y;
      scheduleRender();
      return;
    }

    if (currentTool === "eraser" && clicked) {
      const idx = findShapeIndexAt(pos.x, pos.y);
      if (idx >= 0) {
        existingShapes.splice(idx, 1);
        scheduleRender();
      }
      return;
    }

    // hover cursor for select handles
    if (currentTool === "select" && selectedShapes.length === 1 && !dragging && !resizing) {
      const h = hitTestHandles(selectedShapes[0], pos.x, pos.y);
      canvas.style.cursor = handleCursor(h);
    }

    if (clicked) {
      if (currentTool === "pen") {
        penPoints.push(pos);
        renderAll();
        const c = canvas.getContext("2d")!;
        c.save();
        c.setTransform(viewScale, 0, 0, viewScale, viewPanX, viewPanY);
        c.lineWidth = currentLineWidth;
        c.strokeStyle = currentStroke;
        c.lineJoin = "round"; c.lineCap = "round";
        c.globalAlpha = currentOpacity;
        c.beginPath();
        c.moveTo(penPoints[0].x, penPoints[0].y);
        for (let i = 1; i < penPoints.length; i++) c.lineTo(penPoints[i].x, penPoints[i].y);
        c.stroke();
        c.restore();
        return;
      }
      // preview shape while drawing
      renderAll();
      const c = canvas.getContext("2d")!;
      c.save();
      c.setTransform(viewScale, 0, 0, viewScale, viewPanX, viewPanY);
      const previewShape = buildPreviewShape(startX, startY, pos.x, pos.y, e.shiftKey);
      if (previewShape) drawShape(c, previewShape);
      c.restore();
    }
  });

  // mouseup
  canvas.addEventListener("mouseup", (e) => {
    if (isPanning) {
      isPanning = false;
      canvas.style.cursor = cursorForTool(currentTool);
      return;
    }
    if (bending) { bending = false; notifyChange(); return; }
    if (adjustingEnd) { adjustingEnd = null; notifyChange(); return; }
    if (resizing) { resizing = false; resizeHandle = null; notifyChange(); return; }

    if (dragging) {
      dragging = false;
      notifyChange();
      return;
    }

    if (marquee) {
      const sx = Math.min(marquee.sx, marquee.ex);
      const sy = Math.min(marquee.sy, marquee.ey);
      const ex = Math.max(marquee.sx, marquee.ex);
      const ey = Math.max(marquee.sy, marquee.ey);
      const w1 = screenToWorld(sx / dpr, sy / dpr);
      const w2 = screenToWorld(ex / dpr, ey / dpr);
      const r = { x: w1.x, y: w1.y, w: w2.x - w1.x, h: w2.y - w1.y };
      if (Math.abs(r.w) > 3 / viewScale || Math.abs(r.h) > 3 / viewScale) {
        const hits = existingShapes.filter((s) => shapeInsideRect(s, r));
        if (e.shiftKey) {
          hits.forEach((s) => {
            const i = selectedShapes.indexOf(s);
            if (i >= 0) selectedShapes.splice(i, 1);
            else selectedShapes.push(s);
          });
        } else {
          selectedShapes = hits;
        }
        notifySelection();
      }
      marquee = null;
      scheduleRender();
      return;
    }

    if (!clicked) return;
    clicked = false;

    const pos = getMousePos(e);
    const newShape = finalizeShape(startX, startY, pos.x, pos.y, e.shiftKey, penPoints);
    if (newShape) {
      pushHistory();
      existingShapes.push(newShape);
      // after drawing, switch to select unless drawing multiple (keep current tool? Excalidraw switches to select after finishing most shapes; keep it simple — stay)
      notifyChange();
    }
    penPoints = [];
    scheduleRender();
  });

  // leave canvas — stop transient states
  canvas.addEventListener("mouseleave", () => {
    if (clicked || dragging || resizing || bending || adjustingEnd || marquee) {
      // don't abort drags; leave them to global mouseup
    }
  });

  // double click — edit text / add text
  canvas.addEventListener("dblclick", (e) => {
    const pos = getMousePos(e);
    // double-click existing text to edit
    for (let i = existingShapes.length - 1; i >= 0; i--) {
      const s = existingShapes[i];
      if (s.type === "text" && hitTest(s, pos.x, pos.y)) {
        openTextInput(e, { x: s.x, y: s.y }, s);
        return;
      }
    }
    openTextInput(e, pos);
  });

  // initial paint
  renderAll();
  notifyView();
}

function handleCursor(h: string | null): string {
  switch (h) {
    case "nw": case "se": return "nwse-resize";
    case "ne": case "sw": return "nesw-resize";
    case "n": case "s": return "ns-resize";
    case "e": case "w": return "ew-resize";
    case "bend": return "crosshair";
    case "end1": case "end2": return "move";
    default: return "default";
  }
}

function findShapeIndexAt(x: number, y: number) {
  for (let i = existingShapes.length - 1; i >= 0; i--) {
    if (hitTest(existingShapes[i], x, y)) return i;
  }
  return -1;
}

function buildPreviewShape(sx: number, sy: number, ex: number, ey: number, shift: boolean): Shape | null {
  const base: BaseShapeProps = {
    stroke: currentStroke, fill: currentFill, opacity: currentOpacity,
    strokeWidth: currentLineWidth, strokeStyle: currentStrokeStyle,
  };
  let w = ex - sx, h = ey - sy;
  if (shift) {
    // square/circle with shift
    if (currentTool === "rect" || currentTool === "ellipse" || currentTool === "diamond") {
      const side = Math.max(Math.abs(w), Math.abs(h));
      w = (w < 0 ? -1 : 1) * side;
      h = (h < 0 ? -1 : 1) * side;
    }
  }
  if (currentTool === "rect") return { type: "rect", x: sx, y: sy, width: w, height: h, cornerRadius: 8, ...base };
  if (currentTool === "diamond") return { type: "diamond", x: sx, y: sy, width: w, height: h, ...base };
  if (currentTool === "circle") {
    const r = Math.hypot(w, h);
    return { type: "circle", x: sx, y: sy, radius: r, ...base };
  }
  if (currentTool === "ellipse") return { type: "ellipse", x: sx, y: sy, width: w, height: h, ...base };
  if (currentTool === "triangle") {
    return {
      type: "triangle",
      x1: sx, y1: sy,
      x2: ex, y2: ey,
      x3: sx - (ex - sx), y3: ey,
      cornerRadius: 8, ...base,
    };
  }
  if (currentTool === "line") return { type: "line", x1: sx, y1: sy, x2: ex, y2: ey, ...base };
  if (currentTool === "arrow") return { type: "line", x1: sx, y1: sy, x2: ex, y2: ey, arrow: true, ...base };
  return null;
}

function finalizeShape(sx: number, sy: number, ex: number, ey: number, shift: boolean, pen: { x: number; y: number }[]): Shape | null {
  if (currentTool === "pen") {
    if (pen.length < 2) return null;
    return { type: "path", points: pen.slice(), stroke: currentStroke, opacity: currentOpacity, strokeWidth: currentLineWidth, strokeStyle: currentStrokeStyle };
  }
  const s = buildPreviewShape(sx, sy, ex, ey, shift);
  if (!s) return null;
  // avoid zero-size shapes
  const b = getBounds(s);
  if (b.w === 0 && b.h === 0 && (s.type === "rect" || s.type === "diamond" || s.type === "ellipse")) return null;
  return s;
}

function openTextInput(e: MouseEvent, pos: { x: number; y: number }, editing?: Extract<Shape, { type: "text" }>) {
  if (!canvasEl) return;
  const rect = canvasEl.getBoundingClientRect();
  const fs = editing?.fontSize ?? 20;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  // position in page coordinates
  const screenX = (pos.x * viewScale + viewPanX) / dpr + rect.left;
  const screenY = (pos.y * viewScale + viewPanY) / dpr + rect.top;

  const textarea = document.createElement("textarea");
  textarea.value = editing?.text ?? "";
  textarea.style.position = "fixed";
  textarea.style.left = `${screenX}px`;
  textarea.style.top = `${screenY}px`;
  textarea.style.color = editing?.stroke ?? currentStroke;
  textarea.style.fontFamily = `"Caveat", "Comic Sans MS", Arial, sans-serif`;
  textarea.style.fontSize = `${fs * viewScale}px`;
  textarea.style.lineHeight = "1.2";
  textarea.style.background = "transparent";
  textarea.style.border = "1px dashed rgba(99,102,241,0.6)";
  textarea.style.outline = "none";
  textarea.style.padding = "2px 4px";
  textarea.style.margin = "0";
  textarea.style.resize = "none";
  textarea.style.overflow = "hidden";
  textarea.style.whiteSpace = "pre";
  textarea.style.zIndex = "60";
  textarea.style.caretColor = editing?.stroke ?? currentStroke;
  textarea.rows = Math.max(1, (editing?.text?.split("\n").length ?? 1));
  textarea.cols = Math.max(8, (editing?.text?.length ?? 8));

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const commit = () => {
    const val = textarea.value;
    if (editing) {
      pushHistory();
      if (val.trim() === "") {
        const i = existingShapes.indexOf(editing);
        if (i >= 0) existingShapes.splice(i, 1);
      } else {
        editing.text = val;
      }
    } else if (val.trim() !== "") {
      pushHistory();
      existingShapes.push({ type: "text", x: pos.x, y: pos.y, text: val, fontSize: fs, stroke: currentStroke, opacity: currentOpacity });
    }
    document.body.removeChild(textarea);
    scheduleRender();
    notifyChange();
  };

  textarea.addEventListener("blur", commit);
  textarea.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") { ev.preventDefault(); textarea.value = editing?.text ?? ""; textarea.blur(); }
    else if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); textarea.blur(); }
  });
  void e;
}
