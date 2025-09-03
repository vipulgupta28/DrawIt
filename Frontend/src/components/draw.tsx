// draw.ts
type Shape =
  | {
      x: number;
      y: number;
      width: number;
      height: number;
      type: "rect";
      stroke: string;
      cornerRadius?: number;
      strokeWidth?: number;
      strokeStyle?: "solid" | "dashed" | "dotted";
    }
  | {
      type: "path";
      points: { x: number; y: number }[];
      stroke: string;
      strokeWidth?: number;
      strokeStyle?: "solid" | "dashed" | "dotted";
    }
  | {
      x: number;
      y: number;
      radius: number;
      type: "circle";
      stroke: string;
      strokeWidth?: number;
      strokeStyle?: "solid" | "dashed" | "dotted";
    }
  | {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      type: "line";
      stroke: string;
      arrow?: boolean;
      cx?: number; // control point x for bending
      cy?: number; // control point y for bending
      strokeWidth?: number;
      strokeStyle?: "solid" | "dashed" | "dotted";
    }
  | {
      x: number;
      y: number;
      width: number;
      height: number;
      type: "ellipse";
      stroke: string;
      strokeWidth?: number;
      strokeStyle?: "solid" | "dashed" | "dotted";
    }
  | {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      x3: number;
      y3: number;
      type: "triangle";
      stroke: string;
      cornerRadius?: number;
      strokeWidth?: number;
      strokeStyle?: "solid" | "dashed" | "dotted";
    }
  | {
      x: number;
      y: number;
      text: string;
      type: "text";
      stroke: string;
      strokeWidth?: number;
      strokeStyle?: "solid" | "dashed" | "dotted";
    };

type Tool = Shape["type"] | "arrow" | "select" | "pen";
let currentTool: Tool = "rect"; // default
let canvasEl: HTMLCanvasElement | null = null;
let currentStroke = "white";
let currentBg: string = "black";
let existingShapes: Shape[] = [];
let redoStack: Shape[] = [];
let selectedShape: Shape | null = null;
let selectedShapes: Shape[] = [];
let currentLineWidth = 2;
let currentStrokeStyle: "solid" | "dashed" | "dotted" = "solid";
// Viewport transform (pan/zoom)
let viewScale = 1;
let viewPanX = 0;
let viewPanY = 0;
type Snapshot = { shapes: Shape[]; bg: string };
const changeListeners = new Set<(snap: Snapshot) => void>();
const viewListeners = new Set<(view: { scale: number; panX: number; panY: number; width: number; height: number }) => void>();
function notifyChange() {
  const snap = getSnapshot();
  changeListeners.forEach((cb) => cb(snap));
}
function notifyViewChange() {
  const v = getViewTransform();
  viewListeners.forEach((cb) => cb(v));
}
// Batch renders for smoother dragging/resizing
let rafId: number | null = null;
function scheduleRender() {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    renderAll();
  });
}
function renderAll() {
  if (!canvasEl) return;
  const ctx = canvasEl.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  if (currentBg !== "transparent") {
    ctx.fillStyle = currentBg;
    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
  }
  // apply world transform for shapes
  ctx.save();
  ctx.setTransform(viewScale, 0, 0, viewScale, viewPanX, viewPanY);
  existingShapes.forEach((shape) => {
    // apply stroke width and style
    const lw = shape.strokeWidth ?? currentLineWidth;
    const ls = shape.strokeStyle ?? currentStrokeStyle;
    ctx.lineWidth = lw;
    if (ls === "dashed") ctx.setLineDash([8, 4]);
    else if (ls === "dotted") ctx.setLineDash([2, 4]);
    else ctx.setLineDash([]);
    if (shape.type === "rect") {
      ctx.strokeStyle = shape.stroke;
      drawRoundedRect(ctx, shape.x, shape.y, shape.width, shape.height, shape.cornerRadius ?? 12);
    } else if (shape.type === "circle") {
      ctx.strokeStyle = shape.stroke;
      ctx.beginPath();
      ctx.arc(shape.x, shape.y, shape.radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (shape.type === "line") {
      ctx.strokeStyle = shape.stroke;
      ctx.beginPath();
      if (shape.cx !== undefined && shape.cy !== undefined) {
        ctx.moveTo(shape.x1, shape.y1);
        ctx.quadraticCurveTo(shape.cx, shape.cy, shape.x2, shape.y2);
      } else {
        ctx.moveTo(shape.x1, shape.y1);
        ctx.lineTo(shape.x2, shape.y2);
      }
      ctx.stroke();
      if (shape.arrow) {
        drawArrowHead(ctx, shape);
      }
    } else if (shape.type === "ellipse") {
      ctx.strokeStyle = shape.stroke;
      ctx.beginPath();
      ctx.ellipse(
        shape.x + shape.width / 2,
        shape.y + shape.height / 2,
        Math.abs(shape.width / 2),
        Math.abs(shape.height / 2),
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    } else if (shape.type === "triangle") {
      ctx.strokeStyle = shape.stroke;
      drawRoundedTriangle(ctx, { x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }, { x: shape.x3, y: shape.y3 }, shape.cornerRadius ?? 10);
    } else if (shape.type === "text") {
      ctx.font = "16px Arial";
      ctx.fillStyle = shape.stroke;
      ctx.fillText(shape.text, shape.x, shape.y);
    } else if (shape.type === "path") {
      if (!shape.points || shape.points.length < 2) return;
      ctx.strokeStyle = shape.stroke;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let i = 1; i < shape.points.length; i++) {
        ctx.lineTo(shape.points[i].x, shape.points[i].y);
      }
      ctx.stroke();
    }
  });

  // selection overlay (highlight all selected)
  if (selectedShapes.length > 0) {
    selectedShapes.forEach((s) => drawSelectionOverlay(ctx, s));
  }
  ctx.restore();
}

export function setStroke(color: string) {
  currentStroke = color;
}

export function setStrokeWidth(width: number) {
  currentLineWidth = Math.max(1, Math.min(20, Math.floor(width)));
}

export function setStrokeStyle(style: "solid" | "dashed" | "dotted") {
  currentStrokeStyle = style;
}

export function setTool(tool: Tool) {
  currentTool = tool;
  if (canvasEl) {
    canvasEl.style.cursor = tool === "select" ? "default" : "crosshair";
  }
}



export function setBackground(color: string) {
  currentBg = color;
  if (canvasEl) {
    renderAll();
  }
  notifyChange();
}

export function setZoom(factor: number, anchor?: { x: number; y: number }) {
  if (!canvasEl) return;
  const rectW = canvasEl.width;
  const rectH = canvasEl.height;
  const sx = anchor ? anchor.x : rectW / 2;
  const sy = anchor ? anchor.y : rectH / 2;
  const prevScale = viewScale;
  const newScale = Math.max(0.2, Math.min(5, prevScale * factor));
  const wx = (sx - viewPanX) / prevScale;
  const wy = (sy - viewPanY) / prevScale;
  viewPanX = sx - wx * newScale;
  viewPanY = sy - wy * newScale;
  viewScale = newScale;
  scheduleRender();
  notifyViewChange();
}

export function undo() {
  if (existingShapes.length === 0) return;
  const popped = existingShapes.pop();
  if (popped) redoStack.push(popped);
  renderAll();
  notifyChange();
}

export function redo() {
  if (redoStack.length === 0) return;
  const shape = redoStack.pop();
  if (shape) existingShapes.push(shape);
  renderAll();
  notifyChange();
}

export function clearAll() {
  existingShapes = [];
  redoStack = [];
  renderAll();
  notifyChange();
}

export function exportPNG(): string | null {
  if (!canvasEl) return null;
  return canvasEl.toDataURL("image/png");
}

export function onChange(listener: (snap: Snapshot) => void) {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

export function onViewChange(listener: (view: { scale: number; panX: number; panY: number; width: number; height: number }) => void) {
  viewListeners.add(listener);
  return () => viewListeners.delete(listener);
}

export function getSnapshot(): Snapshot {
  return { shapes: JSON.parse(JSON.stringify(existingShapes)), bg: currentBg };
}

export function getViewTransform() {
  return { scale: viewScale, panX: viewPanX, panY: viewPanY, width: canvasEl?.width || 0, height: canvasEl?.height || 0 };
}

export function replaceSnapshot(snap: Snapshot) {
  existingShapes = JSON.parse(JSON.stringify(snap.shapes));
  currentBg = snap.bg;
  renderAll();
}


export default function initDraw(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvasEl = canvas;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  ctx.strokeStyle = currentStroke;
  ctx.lineWidth = 0.5;

  let clicked = false;
  let startX = 0;
  let startY = 0;

  // dragging support
  let dragging = false;
  selectedShape = null;
  selectedShapes = [];
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let resizing = false;
  let resizeHandle: string | null = null; // 'nw','ne','sw','se' etc.
  let bending = false; // for line midpoint handle
  let adjustingEnd: 1 | 2 | null = null; // line endpoints
  let isPanning = false;
  let spacePressed = false;
  let panStartX = 0;
  let panStartY = 0;
  let panOriginX = 0;
  let panOriginY = 0;
  // freehand pen points (live)
  let penPoints: { x: number; y: number }[] = [];
  // group drag helpers (select mode)
  let dragStartWorldX = 0;
  let dragStartWorldY = 0;
  const initialPositions = new Map<Shape, any>();

  const getMousePos = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    // convert screen to world
    const wx = (sx - viewPanX) / viewScale;
    const wy = (sy - viewPanY) / viewScale;
    return { x: wx, y: wy };
  };

  // use global renderAll()

  

  

  // hit test to detect shape under mouse
  const hitTest = (shape: Shape, x: number, y: number): boolean => {
    if (shape.type === "rect") {
      return (
        x >= shape.x &&
        x <= shape.x + shape.width &&
        y >= shape.y &&
        y <= shape.y + shape.height
      );
    } else if (shape.type === "circle") {
      const dx = x - shape.x;
      const dy = y - shape.y;
      return dx * dx + dy * dy <= shape.radius * shape.radius;
    } else if (shape.type === "line") {
      const dist =
        Math.abs(
          (shape.y2 - shape.y1) * x -
            (shape.x2 - shape.x1) * y +
            shape.x2 * shape.y1 -
            shape.y2 * shape.x1
        ) / Math.sqrt((shape.y2 - shape.y1) ** 2 + (shape.x2 - shape.x1) ** 2);
      return dist < 5; // tolerance
    } else if (shape.type === "ellipse") {
      const rx = Math.abs(shape.width / 2);
      const ry = Math.abs(shape.height / 2);
      const h = shape.x + rx;
      const k = shape.y + ry;
      return ((x - h) ** 2) / (rx * rx) + ((y - k) ** 2) / (ry * ry) <= 1;
    } else if (shape.type === "triangle") {
      // simple bounding box check
      const minX = Math.min(shape.x1, shape.x2, shape.x3);
      const maxX = Math.max(shape.x1, shape.x2, shape.x3);
      const minY = Math.min(shape.y1, shape.y2, shape.y3);
      const maxY = Math.max(shape.y1, shape.y2, shape.y3);
      return x >= minX && x <= maxX && y >= minY && y <= maxY;
    } else if (shape.type === "text") {
      ctx.font = "16px Arial";
      const width = ctx.measureText(shape.text).width;
      const height = 16;
      return (
        x >= shape.x &&
        x <= shape.x + width &&
        y <= shape.y &&
        y >= shape.y - height
      );
    }
    return false;
  };


  

  // Handle window resize
  const handleResize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    renderAll();
    notifyViewChange();
  };

  window.addEventListener("resize", handleResize);

  // keyboard for panning (space to pan)
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") spacePressed = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") spacePressed = false;
  });

  // global keys: delete selected, undo/redo
  window.addEventListener("keydown", (e) => {
    const active = document.activeElement as HTMLElement | null;
    const isTyping = !!active && (
      active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.isContentEditable
    );
    if (isTyping) return;

    // Delete selected on Backspace
    if (e.key === "Backspace") {
      if (selectedShapes.length > 0) {
        e.preventDefault();
        existingShapes = existingShapes.filter((s) => !selectedShapes.includes(s));
        selectedShapes = [];
        selectedShape = null;
        renderAll();
        notifyChange();
      } else if (selectedShape) {
        e.preventDefault();
        const idx = existingShapes.indexOf(selectedShape);
        if (idx >= 0) existingShapes.splice(idx, 1);
        selectedShape = null;
        renderAll();
        notifyChange();
      }
    }

    // Ctrl/Cmd + Z to undo, Ctrl+Shift+Z (or Cmd+Shift+Z) to redo
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    }
  });

  // wheel to pan/zoom (Ctrl/Cmd to zoom)
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    if (e.ctrlKey || e.metaKey) {
      const prevScale = viewScale;
      const zoomFactor = Math.pow(1.1, -e.deltaY / 100);
      const newScale = Math.max(0.2, Math.min(5, prevScale * zoomFactor));
      // zoom around mouse point
      const wx = (sx - viewPanX) / prevScale;
      const wy = (sy - viewPanY) / prevScale;
      viewPanX = sx - wx * newScale;
      viewPanY = sy - wy * newScale;
      viewScale = newScale;
      scheduleRender();
      notifyViewChange();
    } else {
      // pan
      viewPanX -= e.deltaX;
      viewPanY -= e.deltaY;
      scheduleRender();
      notifyViewChange();
    }
  }, { passive: false });

  // mousedown
  canvas.addEventListener("mousedown", (e) => {
    const pos = getMousePos(e);

    // start panning with middle button or space+left
    if (e.button === 1 || (spacePressed && e.button === 0)) {
      isPanning = true;
      const rect = canvas.getBoundingClientRect();
      panStartX = e.clientX - rect.left;
      panStartY = e.clientY - rect.top;
      panOriginX = viewPanX;
      panOriginY = viewPanY;
      return;
    }

    // selection tool: handles when single selected
    if (currentTool === "select" && selectedShapes.length === 1) {
      selectedShape = selectedShapes[0];
      const handle = hitTestHandles(selectedShape, pos.x, pos.y);
      if (handle === "bend") { bending = true; return; }
      if (handle === "end1") { adjustingEnd = 1; return; }
      if (handle === "end2") { adjustingEnd = 2; return; }
      if (handle) { resizing = true; resizeHandle = handle; return; }
    }

    if (currentTool === "select") {
      // hit-test for selection
      let hit: Shape | null = null;
      for (let i = existingShapes.length - 1; i >= 0; i--) {
        if (hitTest(existingShapes[i], pos.x, pos.y)) { hit = existingShapes[i]; break; }
      }
      if (hit) {
        if (e.shiftKey) {
          const idx = selectedShapes.indexOf(hit);
          if (idx >= 0) selectedShapes.splice(idx, 1);
          else selectedShapes.push(hit);
        } else {
          selectedShapes = [hit];
        }
        // start group drag
        dragging = true;
        dragStartWorldX = pos.x; dragStartWorldY = pos.y;
        initialPositions.clear();
        selectedShapes.forEach((s) => {
          if (s.type === "rect" || s.type === "ellipse" || s.type === "text") initialPositions.set(s, { x: (s as any).x, y: (s as any).y });
          else if (s.type === "circle") initialPositions.set(s, { x: s.x, y: s.y });
          else if (s.type === "line") initialPositions.set(s, { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, cx: s.cx, cy: s.cy });
          else if (s.type === "triangle") initialPositions.set(s, { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, x3: s.x3, y3: s.y3 });
        });
        renderAll();
        return;
      } else {
        // empty click clears selection
        selectedShapes = [];
        renderAll();
        return;
      }
    }

    // drawing mode (non-select)
    selectedShape = null;
    for (let i = existingShapes.length - 1; i >= 0; i--) {
      if (hitTest(existingShapes[i], pos.x, pos.y)) {
        selectedShape = existingShapes[i];
        dragging = true;
        if (selectedShape.type === "rect" || selectedShape.type === "ellipse" || selectedShape.type === "text") {
          dragOffsetX = pos.x - (selectedShape as any).x;
          dragOffsetY = pos.y - (selectedShape as any).y;
        } else if (selectedShape.type === "circle") {
          dragOffsetX = pos.x - selectedShape.x;
          dragOffsetY = pos.y - selectedShape.y;
        } else if (selectedShape.type === "line") {
          dragOffsetX = pos.x - selectedShape.x1;
          dragOffsetY = pos.y - selectedShape.y1;
        } else if (selectedShape.type === "triangle") {
          dragOffsetX = pos.x - selectedShape.x1;
          dragOffsetY = pos.y - selectedShape.y1;
        }
        break;
      }
    }
    if (!selectedShape) {
      if (currentTool === "pen") {
        clicked = true;
        penPoints = [pos];
        startX = pos.x; // seed preview
        startY = pos.y;
        return;
      }
      clicked = true;
      startX = pos.x;
      startY = pos.y;
    }
  });

  // mousemove
  canvas.addEventListener("mousemove", (e) => {
    const pos = getMousePos(e);

    if (isPanning) {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      viewPanX = panOriginX + (sx - panStartX);
      viewPanY = panOriginY + (sy - panStartY);
      scheduleRender();
      notifyViewChange();
      return;
    }

    if (bending && currentTool === "select" && selectedShapes.length === 1) {
      const s = selectedShapes[0];
      if (s.type === "line") { s.cx = pos.x; s.cy = pos.y; scheduleRender(); return; }
    } else if (bending && selectedShape && selectedShape.type === "line") {
      selectedShape.cx = pos.x;
      selectedShape.cy = pos.y;
      scheduleRender();
      return;
    }

    if (adjustingEnd && currentTool === "select" && selectedShapes.length === 1) {
      const s = selectedShapes[0];
      if (s.type === "line") {
        if (adjustingEnd === 1) { s.x1 = pos.x; s.y1 = pos.y; }
        else { s.x2 = pos.x; s.y2 = pos.y; }
        scheduleRender();
        return;
      }
    } else if (adjustingEnd && selectedShape && selectedShape.type === "line") {
      if (adjustingEnd === 1) {
        selectedShape.x1 = pos.x;
        selectedShape.y1 = pos.y;
      } else {
        selectedShape.x2 = pos.x;
        selectedShape.y2 = pos.y;
      }
      scheduleRender();
      return;
    }

    if (resizing && currentTool === "select" && selectedShapes.length === 1) {
      resizeShapeByHandle(selectedShapes[0], resizeHandle!, pos.x, pos.y);
      scheduleRender();
      return;
    }
    if (resizing && selectedShape) {
      resizeShapeByHandle(selectedShape, resizeHandle!, pos.x, pos.y);
      scheduleRender();
      return;
    }

    if (dragging && currentTool === "select" && selectedShapes.length > 0) {
      const dx = pos.x - dragStartWorldX;
      const dy = pos.y - dragStartWorldY;
      selectedShapes.forEach((s) => {
        const init = initialPositions.get(s);
        if (!init) return;
        if (s.type === "rect" || s.type === "ellipse" || s.type === "text") { (s as any).x = init.x + dx; (s as any).y = init.y + dy; }
        else if (s.type === "circle") { s.x = init.x + dx; s.y = init.y + dy; }
        else if (s.type === "line") { s.x1 = init.x1 + dx; s.y1 = init.y1 + dy; s.x2 = init.x2 + dx; s.y2 = init.y2 + dy; if (init.cx !== undefined && init.cy !== undefined) { s.cx = init.cx + dx; s.cy = init.cy + dy; } }
        else if (s.type === "triangle") { s.x1 = init.x1 + dx; s.y1 = init.y1 + dy; s.x2 = init.x2 + dx; s.y2 = init.y2 + dy; s.x3 = init.x3 + dx; s.y3 = init.y3 + dy; }
      });
      scheduleRender();
      return;
    }
    if (dragging && selectedShape) {
      if (selectedShape.type === "rect" || selectedShape.type === "ellipse") {
        selectedShape.x = pos.x - dragOffsetX;
        selectedShape.y = pos.y - dragOffsetY;
      } else if (selectedShape.type === "circle") {
        selectedShape.x = pos.x - dragOffsetX;
        selectedShape.y = pos.y - dragOffsetY;
      } else if (selectedShape.type === "line") {
        selectedShape.x1 = pos.x - dragOffsetX;
        selectedShape.y1 = pos.y - dragOffsetY;
        const width = selectedShape.x2 - selectedShape.x1;
        const height = selectedShape.y2 - selectedShape.y1;
        selectedShape.x2 = selectedShape.x1 + width;
        selectedShape.y2 = selectedShape.y1 + height;
      } else if (selectedShape.type === "triangle") {
        selectedShape.x1 = pos.x - dragOffsetX;
        selectedShape.y1 = pos.y - dragOffsetY;
        const width = selectedShape.x2 - selectedShape.x1;
        const height = selectedShape.y2 - selectedShape.y1;
        selectedShape.x2 = selectedShape.x1 + width;
        selectedShape.y2 = selectedShape.y1 + height;
        selectedShape.x3 = selectedShape.x1 - width;
        selectedShape.y3 = selectedShape.y1 + height;
      } else if (selectedShape.type === "text") {
        selectedShape.x = pos.x - dragOffsetX;
        selectedShape.y = pos.y - dragOffsetY;
      }
      scheduleRender();
      return;
    }

    if (clicked) {
      if (currentTool === "pen") {
        penPoints.push(pos);
        renderAll();
        // draw live path overlay
        ctx.save();
        ctx.setTransform(viewScale, 0, 0, viewScale, viewPanX, viewPanY);
        ctx.lineWidth = currentLineWidth;
        ctx.strokeStyle = currentStroke;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(penPoints[0].x, penPoints[0].y);
        for (let i = 1; i < penPoints.length; i++) ctx.lineTo(penPoints[i].x, penPoints[i].y);
        ctx.stroke();
        ctx.restore();
        return;
      }
      const width = pos.x - startX;
      const height = pos.y - startY;
      renderAll();
      // apply preview style
      ctx.lineWidth = currentLineWidth;
      if (currentStrokeStyle === "dashed") ctx.setLineDash([8, 4]);
      else if (currentStrokeStyle === "dotted") ctx.setLineDash([2, 4]);
      else ctx.setLineDash([]);
      // draw in world space under current transform
      ctx.save();
      ctx.setTransform(viewScale, 0, 0, viewScale, viewPanX, viewPanY);
      if (currentTool === "rect") {
        ctx.strokeStyle = currentStroke;
        ctx.strokeRect(startX, startY, width, height);
      } else if (currentTool === "circle") {
        const radius = Math.sqrt(width * width + height * height);
        ctx.beginPath();
        ctx.arc(startX, startY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = currentStroke;
        ctx.stroke();
      } else if (currentTool === "line") {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = currentStroke;
        ctx.stroke();
      } else if (currentTool === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(
          startX + width / 2,
          startY + height / 2,
          Math.abs(width / 2),
          Math.abs(height / 2),
          0,
          0,
          Math.PI * 2
        );
        ctx.strokeStyle = currentStroke;
        ctx.stroke();
      } else if (currentTool === "triangle") {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(pos.x, pos.y);
        ctx.lineTo(startX - (pos.x - startX), pos.y);
        ctx.closePath();
        ctx.strokeStyle = currentStroke;
        ctx.stroke();
      } else if ((currentTool as any) === "pen") {
        // freehand preview - draw from last point to current
        ctx.beginPath();
        ctx.strokeStyle = currentStroke;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.moveTo(startX, startY);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        // update start so we draw small segments
        startX = pos.x;
        startY = pos.y;
      }
      ctx.restore();
    }
  });

  // mouseup
  canvas.addEventListener("mouseup", (e) => {
    if (isPanning) {
      isPanning = false;
      return;
    }
    if (bending) {
      bending = false;
      notifyChange();
      return;
    }

    if (adjustingEnd) {
      adjustingEnd = null;
      notifyChange();
      return;
    }

    if (resizing) {
      resizing = false;
      resizeHandle = null;
      notifyChange();
      return;
    }

    if (dragging) {
      dragging = false;
      selectedShape = null;
      notifyChange();
      return;
    }

    if (!clicked) return;
    clicked = false;

    const pos = getMousePos(e);
    const width = pos.x - startX;
    const height = pos.y - startY;

    redoStack = [];

    if (currentTool === "rect") {
      existingShapes.push({ x: startX, y: startY, width, height, type: "rect", stroke: currentStroke, cornerRadius: 12, strokeWidth: currentLineWidth, strokeStyle: currentStrokeStyle });
    } else if (currentTool === "circle") {
      const radius = Math.sqrt(width * width + height * height);
      existingShapes.push({ x: startX, y: startY, radius, type: "circle", stroke: currentStroke, strokeWidth: currentLineWidth, strokeStyle: currentStrokeStyle });
    } else if (currentTool === "line") {
      existingShapes.push({
        x1: startX,
        y1: startY,
        x2: pos.x,
        y2: pos.y,
        type: "line",
        stroke: currentStroke,
        strokeWidth: currentLineWidth,
        strokeStyle: currentStrokeStyle,
      });
    } else if (currentTool === "arrow") {
      existingShapes.push({
        x1: startX,
        y1: startY,
        x2: pos.x,
        y2: pos.y,
        type: "line",
        stroke: currentStroke,
        arrow: true,
        strokeWidth: currentLineWidth,
        strokeStyle: currentStrokeStyle,
      });
    } else if (currentTool === "ellipse") {
      existingShapes.push({ x: startX, y: startY, width, height, type: "ellipse", stroke: currentStroke, strokeWidth: currentLineWidth, strokeStyle: currentStrokeStyle });
    } else if (currentTool === "triangle") {
      existingShapes.push({
        x1: startX,
        y1: startY,
        x2: pos.x,
        y2: pos.y,
        x3: startX - (pos.x - startX),
        y3: pos.y,
        type: "triangle",
        stroke: currentStroke,
        cornerRadius: 10,
        strokeWidth: currentLineWidth,
        strokeStyle: currentStrokeStyle,
      });
    } else if (currentTool === "pen") {
      if (penPoints.length < 2) {
        penPoints.push(pos);
      }
      existingShapes.push({ type: "path", points: penPoints.slice(), stroke: currentStroke, strokeWidth: currentLineWidth, strokeStyle: currentStrokeStyle });
      penPoints = [];
    }

    renderAll();
    notifyChange();
  });

  // double click for text
  canvas.addEventListener("dblclick", (e) => {
    const pos = getMousePos(e);

    if (currentTool !== "text") return;

    const input = document.createElement("input");
    input.type = "text";
    input.style.position = "absolute";
    input.style.left = `${pos.x + canvas.offsetLeft}px`;
    input.style.top = `${pos.y + canvas.offsetTop}px`;
    input.style.color = "white";
    input.style.font = "25px Arial";
    input.style.border = "none";
    input.style.background = "transparent";
    input.style.outline = "none";
    input.style.zIndex = "10";
    input.style.padding = "2px";
    document.body.appendChild(input);

    input.focus();

    input.addEventListener("blur", () => {
      if (input.value.trim() !== "") {
        existingShapes.push({ x: pos.x, y: pos.y, text: input.value, type: "text", stroke: currentStroke, strokeWidth: currentLineWidth, strokeStyle: currentStrokeStyle });
        renderAll();
        notifyChange();
      }
      document.body.removeChild(input);
    });

    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        input.blur();
      }
    });
  });

  // initial paint
  renderAll();
  ctx.lineWidth = 2;
  notifyViewChange();
}

// Helpers
function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, Math.abs(Math.min(w, h)) / 2));
  const signW = w >= 0 ? 1 : -1;
  const signH = h >= 0 ? 1 : -1;
  const absW = Math.abs(w);
  const absH = Math.abs(h);
  ctx.beginPath();
  ctx.moveTo(x + radius * signW, y);
  ctx.lineTo(x + absW * signW - radius * signW, y);
  ctx.quadraticCurveTo(x + absW * signW, y, x + absW * signW, y + radius * signH);
  ctx.lineTo(x + absW * signW, y + absH * signH - radius * signH);
  ctx.quadraticCurveTo(x + absW * signW, y + absH * signH, x + absW * signW - radius * signW, y + absH * signH);
  ctx.lineTo(x + radius * signW, y + absH * signH);
  ctx.quadraticCurveTo(x, y + absH * signH, x, y + absH * signH - radius * signH);
  ctx.lineTo(x, y + radius * signH);
  ctx.quadraticCurveTo(x, y, x + radius * signW, y);
  ctx.stroke();
}

function drawRoundedTriangle(
  ctx: CanvasRenderingContext2D,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  r: number
) {
  const points = [p1, p2, p3];
  const radius = Math.max(0, r);

  function corner(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const cbx = b.x - c.x;
    const cby = b.y - c.y;
    const abLen = Math.hypot(abx, aby);
    const cbLen = Math.hypot(cbx, cby);
    const rab = Math.min(radius, abLen / 2);
    const rcb = Math.min(radius, cbLen / 2);
    const pStart = { x: b.x - (abx / abLen) * rab, y: b.y - (aby / abLen) * rab };
    const pEnd = { x: b.x - (cbx / cbLen) * rcb, y: b.y - (cby / cbLen) * rcb };
    return { pStart, pEnd };
  }

  const c1 = corner(points[3 - 3] || points[0], points[0], points[1]);
  const c2 = corner(points[0], points[1], points[2]);
  const c3 = corner(points[1], points[2], points[0]);

  ctx.beginPath();
  ctx.moveTo(c1.pStart.x, c1.pStart.y);
  ctx.quadraticCurveTo(points[0].x, points[0].y, c1.pEnd.x, c1.pEnd.y);
  ctx.lineTo(c2.pStart.x, c2.pStart.y);
  ctx.quadraticCurveTo(points[1].x, points[1].y, c2.pEnd.x, c2.pEnd.y);
  ctx.lineTo(c3.pStart.x, c3.pStart.y);
  ctx.quadraticCurveTo(points[2].x, points[2].y, c3.pEnd.x, c3.pEnd.y);
  ctx.closePath();
  ctx.stroke();
}

function drawArrowHead(ctx: CanvasRenderingContext2D, shape: Extract<Shape, { type: "line" }>) {
  const end = { x: shape.x2, y: shape.y2 };
  const start = { x: shape.x1, y: shape.y1 };
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const size = 10;
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - size * Math.cos(angle - Math.PI / 6), end.y - size * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - size * Math.cos(angle + Math.PI / 6), end.y - size * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function getBounds(shape: Shape) {
  if (shape.type === "rect" || shape.type === "ellipse") return { x: shape.x, y: shape.y, w: shape.width, h: shape.height };
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
    return { x: shape.x, y: shape.y - 16, w: 100, h: 20 };
  }
  return { x: 0, y: 0, w: 0, h: 0 };
}

function drawSelectionOverlay(ctx: CanvasRenderingContext2D, shape: Shape) {
  const b = getBounds(shape);
  ctx.save();
  ctx.strokeStyle = "#4f46e5";
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
  ctx.setLineDash([]);
  const handles = [
    { x: b.x, y: b.y, k: "nw" },
    { x: b.x + b.w, y: b.y, k: "ne" },
    { x: b.x, y: b.y + b.h, k: "sw" },
    { x: b.x + b.w, y: b.y + b.h, k: "se" },
  ];
  handles.forEach((h) => drawHandle(ctx, h.x, h.y));

  if (shape.type === "line") {
    // endpoints
    drawHandle(ctx, shape.x1, shape.y1);
    drawHandle(ctx, shape.x2, shape.y2);
    // midpoint for bending
    const mid = { x: (shape.x1 + shape.x2) / 2, y: (shape.y1 + shape.y2) / 2 };
    drawBendHandle(ctx, shape.cx ?? mid.x, shape.cy ?? mid.y);
  }

  ctx.restore();
}

function drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#111827";
  ctx.beginPath();
  ctx.rect(x - 4, y - 4, 8, 8);
  ctx.fill();
  ctx.stroke();
}

function drawBendHandle(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#22c55e";
  ctx.strokeStyle = "#065f46";
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function hitTestHandles(shape: Shape, mx: number, my: number): string | null {
  const within = (x: number, y: number, r = 6) => Math.hypot(mx - x, my - y) <= r;
  const b = getBounds(shape);
  const corners: Record<string, { x: number; y: number }> = {
    nw: { x: b.x, y: b.y },
    ne: { x: b.x + b.w, y: b.y },
    sw: { x: b.x, y: b.y + b.h },
    se: { x: b.x + b.w, y: b.y + b.h },
  };
  for (const k of Object.keys(corners)) {
    const c = corners[k];
    if (within(c.x, c.y, 8)) return k;
  }
  if (shape.type === "line") {
    if (within(shape.x1, shape.y1, 8)) return "end1";
    if (within(shape.x2, shape.y2, 8)) return "end2";
    const mid = { x: (shape.x1 + shape.x2) / 2, y: (shape.y1 + shape.y2) / 2 };
    if (within(shape.cx ?? mid.x, shape.cy ?? mid.y, 10)) return "bend";
  }
  return null;
}

function resizeShapeByHandle(shape: Shape, handle: string, mx: number, my: number) {
  if (shape.type === "rect" || shape.type === "ellipse") {
    const right = shape.x + shape.width;
    const bottom = shape.y + shape.height;
    if (handle === "nw") {
      shape.width = right - mx;
      shape.height = bottom - my;
      shape.x = mx;
      shape.y = my;
    } else if (handle === "ne") {
      shape.width = mx - shape.x;
      shape.height = bottom - my;
      shape.y = my;
    } else if (handle === "sw") {
      shape.width = right - mx;
      shape.height = my - shape.y;
      shape.x = mx;
    } else if (handle === "se") {
      shape.width = mx - shape.x;
      shape.height = my - shape.y;
    }
  } else if (shape.type === "triangle") {
    // resize by moving nearest vertex
    const d1 = Math.hypot(mx - shape.x1, my - shape.y1);
    const d2 = Math.hypot(mx - shape.x2, my - shape.y2);
    const d3 = Math.hypot(mx - shape.x3, my - shape.y3);
    const min = Math.min(d1, d2, d3);
    if (min === d1) {
      shape.x1 = mx; shape.y1 = my;
    } else if (min === d2) {
      shape.x2 = mx; shape.y2 = my;
    } else {
      shape.x3 = mx; shape.y3 = my;
    }
  } else if (shape.type === "circle") {
    shape.radius = Math.max(2, Math.hypot(mx - shape.x, my - shape.y));
  }
}
