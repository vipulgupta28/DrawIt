// canvas.tsx — top-level whiteboard surface + UI chrome
import { useEffect, useMemo, useRef, useState } from "react";
import api from "../lib/api";
import { createRoomSocket, validateToken, getFreshToken } from "../lib/ws";
import initDraw, {
  setTool,
  undo,
  redo,
  clearAll,
  exportPNG,
  onChange,
  replaceSnapshot,
  getSnapshot,
  onViewChange,
  getViewTransform,
  setZoom,
  resetView,
  onSelectionChange,
  deleteSelected,
  duplicateSelected,
  setTheme as setDrawTheme,
  toggleGrid,
  isGridVisible,
} from "./draw";
import {
  Square,
  Circle,
  Slash,
  Type,
  MousePointer,
  PenTool,
  ArrowRight,
  Diamond,
  Hand,
  Eraser,
  Menu,
  Download,
  Trash2,
  Share2,
  Users,
  LogOut,
  Moon,
  Sun,
  HelpCircle,
  Copy,
  Check,
  X,
  Plus,
  Minus,
  RotateCcw,
  Grid3x3,
  ImageDown,
  LogIn,
} from "lucide-react";

import Sidebar from "./Sidebar";
import AuthModal from "./authModal";
import {
  clearAuthSession,
  getAuthToken,
  getAuthUser,
  setAuthTokenOnly,
} from "../lib/authStorage";

type ToolId =
  | "select"
  | "hand"
  | "rect"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "pen"
  | "text"
  | "eraser";

const TOOLS: { id: ToolId; label: string; shortcut: string; icon: React.ComponentType<{ className?: string }>; draw: string }[] = [
  { id: "select", label: "Selection", shortcut: "V", icon: MousePointer, draw: "select" },
  { id: "hand", label: "Pan (Hand)", shortcut: "H", icon: Hand, draw: "hand" },
  { id: "rect", label: "Rectangle", shortcut: "R", icon: Square, draw: "rect" },
  { id: "diamond", label: "Diamond", shortcut: "D", icon: Diamond, draw: "diamond" },
  { id: "ellipse", label: "Ellipse", shortcut: "O", icon: Circle, draw: "ellipse" },
  { id: "arrow", label: "Arrow", shortcut: "A", icon: ArrowRight, draw: "arrow" },
  { id: "line", label: "Line", shortcut: "L", icon: Slash, draw: "line" },
  { id: "pen", label: "Draw", shortcut: "P", icon: PenTool, draw: "pen" },
  { id: "text", label: "Text", shortcut: "T", icon: Type, draw: "text" },
  { id: "eraser", label: "Eraser", shortcut: "E", icon: Eraser, draw: "eraser" },
];

export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");
  const [roomUsers, setRoomUsers] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<{ id: number; msg: string; tone: "info" | "success" | "error" }[]>([]);
  const [activeTool, setActiveTool] = useState<ToolId>("select");
  const [zoomPct, setZoomPct] = useState<number>(100);
  const [selectionCount, setSelectionCount] = useState<number>(0);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [grid, setGrid] = useState<boolean>(true);

  // restore theme
  useEffect(() => {
    const t = (localStorage.getItem("drawit:theme") as "light" | "dark") || "light";
    setTheme(t);
    setDrawTheme(t);
    document.documentElement.dataset.theme = t;
  }, []);

  // session + room from url
  useEffect(() => {
    const storedToken = getAuthToken();
    const user = getAuthUser();
    if (storedToken && user) setUsername(user.username);
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get("room");
    if (roomParam) {
      if (storedToken) connectToRoom(storedToken, roomParam);
      else guestAndJoin(roomParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (canvasRef.current) initDraw(canvasRef.current);
  }, []);

  useEffect(() => {
    const unsub = onViewChange((v) => setZoomPct(Math.round(v.scale * 100)));
    const v = getViewTransform();
    setZoomPct(Math.round(v.scale * 100));
    return () => { unsub && unsub(); };
  }, []);

  useEffect(() => {
    const unsub = onSelectionChange((n) => setSelectionCount(n));
    return () => { unsub && unsub(); };
  }, []);

  useEffect(() => {
    const unsub = onChange((snap) => {
      if (ws && roomId && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "canvas_update", roomId, snapshot: snap }));
      }
    });
    return () => { unsub(); };
  }, [ws, roomId]);

  // close popovers on escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowMenu(false);
        setShowHelp(false);
        setShowJoinModal(false);
        setShowShare(false);
      }
      if (e.key === "?") setShowHelp((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // listen to global shortcuts that affect ui tool state (tool key presses)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = document.activeElement as HTMLElement | null;
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const map: Record<string, ToolId> = {
        v: "select", "1": "select",
        h: "hand",
        r: "rect", "2": "rect",
        d: "diamond", "3": "diamond",
        o: "ellipse", "4": "ellipse",
        a: "arrow", "5": "arrow",
        l: "line", "6": "line",
        p: "pen", "7": "pen",
        t: "text", "8": "text",
        e: "eraser",
      };
      const t = map[e.key.toLowerCase()];
      if (t) setActiveTool(t);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function notify(msg: string, tone: "info" | "success" | "error" = "info") {
    const id = Date.now() + Math.random();
    setNotifications((prev) => [...prev, { id, msg, tone }]);
    setTimeout(() => setNotifications((prev) => prev.filter((n) => n.id !== id)), 3200);
  }

  function selectTool(id: ToolId) {
    setActiveTool(id);
    setTool(id as any);
  }

  function doToggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    setDrawTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("drawit:theme", next);
  }

  function doToggleGrid() {
    toggleGrid();
    setGrid(isGridVisible());
  }

  function leaveCurrentRoom() {
    if (ws && roomId) {
      try { ws.send(JSON.stringify({ type: "leave_room", roomId })); } catch { /* ignore */ }
      try { ws.close(); } catch { /* ignore */ }
    }
  }

  async function guestAndJoin(rid: string) {
    try {
      const guestName = `guest-${Math.random().toString(36).slice(2, 8)}`;
      const resp = await api.post("/guest", { username: guestName });
      if (resp.data?.token) {
        setAuthTokenOnly(resp.data.token);
        setUsername(guestName);
        connectToRoom(resp.data.token, rid);
      }
    } catch {
      notify("Failed to join as guest", "error");
    }
  }

  async function connectToRoom(token: string, rid: string) {
    const tokenValidation = validateToken(token);
    if (!tokenValidation.isValid) {
      if (tokenValidation.error === "Token is expired") {
        const freshToken = await getFreshToken();
        if (freshToken) return connectToRoom(freshToken, rid);
      }
      notify("Session expired. Please sign in again.", "error");
      return;
    }

    leaveCurrentRoom();
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.close(); } catch { /* ignore */ }
    }

    const socket = createRoomSocket(token, () => {}, undefined);
    let triedGuest = false;

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "join_room", roomId: rid }));
      socket.send(JSON.stringify({ type: "get_room_users", roomId: rid }));
    });

    socket.addEventListener("message", (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "canvas_update" && data.roomId === rid) {
          replaceSnapshot(data.snapshot);
        } else if (data.type === "room_users" && data.roomId === rid) {
          setRoomUsers(data.users || []);
        } else if (data.type === "request_snapshot" && data.roomId === rid) {
          const snap = getSnapshot();
          socket.send(JSON.stringify({ type: "canvas_snapshot", roomId: rid, snapshot: snap }));
        } else if (data.type === "canvas_snapshot" && data.roomId === rid) {
          replaceSnapshot(data.snapshot);
        } else if (data.type === "user_joined" && data.roomId === rid) {
          notify(`${data.userId || "Someone"} joined`, "success");
        } else if (data.type === "user_left" && data.roomId === rid) {
          notify(`${data.userId || "Someone"} left`, "info");
        }
      } catch (e) {
        console.error("Failed to parse WS message", e);
      }
    });

    socket.addEventListener("error", () => {
      notify("Connection error", "error");
    });

    socket.addEventListener("close", async (ev) => {
      if (ev.code === 4001) {
        try {
          if (!triedGuest) {
            triedGuest = true;
            const guestName = `guest-${Math.random().toString(36).slice(2, 8)}`;
            const resp = await api.post("/guest", { username: guestName });
            if (resp.data?.token) {
              setAuthTokenOnly(resp.data.token);
              connectToRoom(resp.data.token, rid);
              return;
            }
          }
        } catch { /* ignore */ }
        notify("Session expired — please sign in again", "error");
        handleLogout();
      }
    });

    setWs(socket);
    setRoomId(rid);

    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState({}, "", url.toString());
  }

  async function createShareLink() {
    const storedToken = getAuthToken();
    if (!storedToken) {
      notify("Please sign in to start a session", "error");
      return;
    }
    const rid = cryptoRandom(8);
    const base = window.location.origin + window.location.pathname;
    const url = `${base}?room=${rid}`;
    try {
      connectToRoom(storedToken, rid);
      setShareUrl(url);
      setShowShare(true);
      try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* ignore */ }
    } catch {
      notify("Failed to create share link", "error");
    }
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* ignore */ }
  }

  function joinFromInput() {
    const storedToken = getAuthToken();
    if (!storedToken) {
      notify("Please sign in to join a session", "error");
      return;
    }
    try {
      let rid: string | null = null;
      try {
        const u = new URL(joinUrl);
        rid = u.searchParams.get("room");
      } catch {
        rid = joinUrl.trim();
      }
      if (!rid) return notify("Enter a valid link or room id", "error");
      connectToRoom(storedToken, rid);
      setShowJoinModal(false);
      setJoinUrl("");
    } catch {
      notify("Failed to join session", "error");
    }
  }

  function leaveRoom() {
    leaveCurrentRoom();
    setWs(null);
    setRoomId(null);
    setRoomUsers([]);
    notify("Left session", "info");
  }

  function cryptoRandom(len: number) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function handleLogout() {
    leaveCurrentRoom();
    clearAuthSession();
    setUsername(null);
    setRoomId(null);
    if (ws) { try { ws.close(); } catch { /* ignore */ } setWs(null); }
  }

  function doExportPNG(transparent = false) {
    const dataUrl = exportPNG({ transparent });
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `drawit-${Date.now()}.png`;
    a.click();
  }

  function doSaveJSON() {
    const snap = getSnapshot();
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `drawit-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function doOpenJSON() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/json";
    inp.onchange = () => {
      const file = inp.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const snap = JSON.parse(String(reader.result));
          if (snap && Array.isArray(snap.shapes)) replaceSnapshot(snap);
        } catch {
          notify("Invalid file", "error");
        }
      };
      reader.readAsText(file);
    };
    inp.click();
  }

  const connected = !!(ws && ws.readyState === WebSocket.OPEN && roomId);

  const userColors = useMemo(() => {
    const palette = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
    return (u: string) => palette[Math.abs(hashString(u)) % palette.length];
  }, []);

  return (
    <div className={`relative w-full h-screen overflow-hidden select-none ${theme === "dark" ? "bg-[#121212] text-gray-100" : "bg-[#fafaf7] text-gray-900"}`}>

      <canvas ref={canvasRef} className="absolute top-0 left-0" />

      {/* Properties sidebar (left) */}
      <Sidebar theme={theme} selectionCount={selectionCount} />

      {/* Top toolbar (center) */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-30">
        <div className={`flex items-center gap-1 rounded-xl px-2 py-2 shadow-xl backdrop-blur-md border ${theme === "dark" ? "bg-[#1e1e1e]/90 border-white/10" : "bg-white/95 border-black/5"}`}>
          {TOOLS.map((t, i) => {
            const Icon = t.icon;
            const active = activeTool === t.id;
            return (
              <button
                key={t.id}
                onClick={() => selectTool(t.id)}
                title={`${t.label} — ${t.shortcut}`}
                className={`relative group p-2 rounded-lg transition-all ${active ? (theme === "dark" ? "bg-indigo-500/30 text-indigo-200" : "bg-indigo-100 text-indigo-700") : (theme === "dark" ? "hover:bg-white/5 text-gray-300" : "hover:bg-black/5 text-gray-700")}`}
              >
                <Icon className="w-5 h-5" />
                <span className={`absolute -bottom-1 right-0.5 text-[9px] font-semibold opacity-60 ${active ? "" : ""}`}>{t.shortcut}</span>
                <span className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white shadow-lg">
                  {t.label} <kbd className="ml-1 px-1 py-0.5 bg-gray-700 rounded text-[10px]">{t.shortcut}</kbd>
                </span>
                {i === 1 && <span className="sr-only" />}
              </button>
            );
          })}
          <div className={`mx-1 h-6 w-px ${theme === "dark" ? "bg-white/10" : "bg-black/10"}`} />
          <button
            onClick={() => selectionCount ? duplicateSelected() : undo()}
            title={selectionCount ? "Duplicate (Ctrl+D)" : "Undo (Ctrl+Z)"}
            className={`p-2 rounded-lg ${theme === "dark" ? "hover:bg-white/5 text-gray-300" : "hover:bg-black/5 text-gray-700"}`}
          >
            {selectionCount ? <Copy className="w-5 h-5" /> : <RotateCcw className="w-5 h-5" />}
          </button>
          {selectionCount > 0 && (
            <button
              onClick={() => deleteSelected()}
              title="Delete (Del)"
              className={`p-2 rounded-lg ${theme === "dark" ? "hover:bg-red-500/20 text-red-300" : "hover:bg-red-50 text-red-600"}`}
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Top-left menu */}
      <div className="fixed top-4 left-4 z-30">
        <div className="relative">
          <button
            onClick={() => setShowMenu((v) => !v)}
            className={`p-2.5 rounded-xl shadow-xl backdrop-blur-md border ${theme === "dark" ? "bg-[#1e1e1e]/90 border-white/10 hover:bg-white/5 text-gray-200" : "bg-white/95 border-black/5 hover:bg-black/5 text-gray-800"}`}
            title="Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className={`absolute left-0 mt-2 w-64 z-50 rounded-xl shadow-2xl overflow-hidden border ${theme === "dark" ? "bg-[#1e1e1e] border-white/10 text-gray-200" : "bg-white border-black/5 text-gray-800"}`}>
                <MenuItem onClick={() => { doOpenJSON(); setShowMenu(false); }} icon={<ImageDown className="w-4 h-4" />} label="Open from file" shortcut="" />
                <MenuItem onClick={() => { doSaveJSON(); setShowMenu(false); }} icon={<Download className="w-4 h-4" />} label="Save as JSON" shortcut="" />
                <MenuItem onClick={() => { doExportPNG(false); setShowMenu(false); }} icon={<Download className="w-4 h-4" />} label="Export PNG" shortcut="" />
                <MenuItem onClick={() => { doExportPNG(true); setShowMenu(false); }} icon={<Download className="w-4 h-4" />} label="Export PNG (transparent)" shortcut="" />
                <div className={`my-1 mx-3 h-px ${theme === "dark" ? "bg-white/10" : "bg-black/10"}`} />
                <MenuItem onClick={() => { clearAll(); setShowMenu(false); }} icon={<Trash2 className="w-4 h-4" />} label="Clear canvas" shortcut="" danger />
                <div className={`my-1 mx-3 h-px ${theme === "dark" ? "bg-white/10" : "bg-black/10"}`} />
                <MenuItem onClick={doToggleTheme} icon={theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />} label={theme === "dark" ? "Light mode" : "Dark mode"} shortcut="" />
                <MenuItem onClick={doToggleGrid} icon={<Grid3x3 className="w-4 h-4" />} label={grid ? "Hide grid" : "Show grid"} shortcut="" />
                <MenuItem onClick={() => { setShowHelp(true); setShowMenu(false); }} icon={<HelpCircle className="w-4 h-4" />} label="Keyboard shortcuts" shortcut="?" />
                {username && (
                  <>
                    <div className={`my-1 mx-3 h-px ${theme === "dark" ? "bg-white/10" : "bg-black/10"}`} />
                    <MenuItem onClick={() => { handleLogout(); setShowMenu(false); }} icon={<LogOut className="w-4 h-4" />} label="Sign out" shortcut="" danger />
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Top-right: collab + user */}
      <div className="fixed top-4 right-4 z-30">
        <div className="flex items-center gap-2">
          {username && (
            <div className={`hidden sm:flex items-center gap-2 rounded-xl px-3 py-2 shadow-xl backdrop-blur-md border ${theme === "dark" ? "bg-[#1e1e1e]/90 border-white/10" : "bg-white/95 border-black/5"}`}>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white font-semibold text-xs"
                style={{ background: userColors(username) }}
                title={username}
              >
                {username.slice(0, 2).toUpperCase()}
              </div>
              <div className="text-sm font-medium truncate max-w-[140px]">{username}</div>
            </div>
          )}

          {connected && roomUsers.length > 0 && (
            <div className={`flex items-center gap-1 rounded-xl px-2 py-2 shadow-xl backdrop-blur-md border ${theme === "dark" ? "bg-[#1e1e1e]/90 border-white/10" : "bg-white/95 border-black/5"}`}>
              <Users className={`w-4 h-4 ${theme === "dark" ? "text-gray-300" : "text-gray-600"}`} />
              <div className="flex -space-x-2">
                {roomUsers.slice(0, 5).map((u) => (
                  <div
                    key={u}
                    title={u}
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold border-2 ${theme === "dark" ? "border-[#1e1e1e]" : "border-white"}`}
                    style={{ background: userColors(u) }}
                  >
                    {u.slice(0, 2).toUpperCase()}
                  </div>
                ))}
                {roomUsers.length > 5 && (
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 ${theme === "dark" ? "border-[#1e1e1e] bg-gray-700 text-gray-200" : "border-white bg-gray-100 text-gray-700"}`}>
                    +{roomUsers.length - 5}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className={`flex items-center gap-1 rounded-xl p-1.5 shadow-xl backdrop-blur-md border ${theme === "dark" ? "bg-[#1e1e1e]/90 border-white/10" : "bg-white/95 border-black/5"}`}>
            {!connected ? (
              <>
                <button
                  onClick={createShareLink}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center gap-1.5"
                >
                  <Share2 className="w-4 h-4" /> Share
                </button>
                <button
                  onClick={() => setShowJoinModal(true)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 ${theme === "dark" ? "hover:bg-white/5 text-gray-200" : "hover:bg-black/5 text-gray-700"}`}
                >
                  <LogIn className="w-4 h-4" /> Join
                </button>
              </>
            ) : (
              <>
                <div className={`flex items-center gap-2 px-2 text-sm ${theme === "dark" ? "text-gray-200" : "text-gray-700"}`}>
                  <span className="relative flex w-2 h-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="font-mono text-xs">{roomId}</span>
                </div>
                <button
                  onClick={() => { setShareUrl(`${window.location.origin}${window.location.pathname}?room=${roomId}`); setShowShare(true); }}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center gap-1.5"
                >
                  <Share2 className="w-4 h-4" /> Invite
                </button>
                <button
                  onClick={leaveRoom}
                  className={`p-1.5 rounded-lg transition-colors ${theme === "dark" ? "hover:bg-red-500/20 text-red-300" : "hover:bg-red-50 text-red-600"}`}
                  title="Leave session"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bottom-left: zoom controls */}
      <div className="fixed bottom-4 left-4 z-30 flex items-center gap-2">
        <div className={`flex items-center gap-0.5 rounded-xl px-1 py-1 shadow-xl backdrop-blur-md border ${theme === "dark" ? "bg-[#1e1e1e]/90 border-white/10" : "bg-white/95 border-black/5"}`}>
          <button onClick={() => setZoom(1 / 1.2)} className={`p-1.5 rounded-lg ${theme === "dark" ? "hover:bg-white/5 text-gray-200" : "hover:bg-black/5 text-gray-700"}`} title="Zoom out">
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={() => resetView()}
            className={`px-2 py-1 text-xs font-mono min-w-[56px] rounded-lg ${theme === "dark" ? "hover:bg-white/5 text-gray-200" : "hover:bg-black/5 text-gray-700"}`}
            title="Reset zoom & pan"
          >
            {zoomPct}%
          </button>
          <button onClick={() => setZoom(1.2)} className={`p-1.5 rounded-lg ${theme === "dark" ? "hover:bg-white/5 text-gray-200" : "hover:bg-black/5 text-gray-700"}`} title="Zoom in">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className={`flex items-center gap-0.5 rounded-xl p-1 shadow-xl backdrop-blur-md border ${theme === "dark" ? "bg-[#1e1e1e]/90 border-white/10" : "bg-white/95 border-black/5"}`}>
          <button onClick={undo} className={`p-1.5 rounded-lg ${theme === "dark" ? "hover:bg-white/5 text-gray-200" : "hover:bg-black/5 text-gray-700"}`} title="Undo (Ctrl+Z)">
            <RotateCcw className="w-4 h-4" />
          </button>
          <button onClick={redo} className={`p-1.5 rounded-lg ${theme === "dark" ? "hover:bg-white/5 text-gray-200" : "hover:bg-black/5 text-gray-700"}`} title="Redo (Ctrl+Shift+Z)">
            <RotateCcw className="w-4 h-4 scale-x-[-1]" />
          </button>
        </div>
      </div>

      {/* Bottom-right: help + brand */}
      <div className="fixed bottom-4 right-4 z-30 flex items-center gap-2">
        <div className={`rounded-xl px-3 py-2 shadow-xl backdrop-blur-md border text-xs font-medium flex items-center gap-1.5 ${theme === "dark" ? "bg-[#1e1e1e]/90 border-white/10 text-gray-300" : "bg-white/95 border-black/5 text-gray-600"}`}>
          <span className="text-indigo-500 font-bold">Draw</span>
          <span>It</span>
        </div>
        <button
          onClick={() => setShowHelp(true)}
          className={`p-2 rounded-xl shadow-xl backdrop-blur-md border ${theme === "dark" ? "bg-[#1e1e1e]/90 border-white/10 hover:bg-white/5 text-gray-200" : "bg-white/95 border-black/5 hover:bg-black/5 text-gray-700"}`}
          title="Help & shortcuts (?)"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
      </div>

      {/* Join modal */}
      {showJoinModal && (
        <Modal onClose={() => setShowJoinModal(false)} theme={theme}>
          <h3 className="text-lg font-semibold mb-1">Join a session</h3>
          <p className={`text-sm mb-4 ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>Paste an invite link or enter a room id.</p>
          <input
            type="text"
            value={joinUrl}
            onChange={(e) => setJoinUrl(e.target.value)}
            placeholder="https://...?room=abcd1234"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") joinFromInput(); }}
            className={`w-full rounded-lg px-3 py-2.5 outline-none transition-all focus:ring-2 ${theme === "dark" ? "bg-[#0f0f10] border border-white/10 focus:ring-indigo-500/50 text-gray-100 placeholder-gray-500" : "bg-gray-50 border border-gray-200 focus:ring-indigo-500/30 focus:border-indigo-500 text-gray-900 placeholder-gray-400"}`}
          />
          <div className="flex gap-2 justify-end mt-4">
            <button onClick={() => setShowJoinModal(false)} className={`px-4 py-2 rounded-lg text-sm font-medium ${theme === "dark" ? "hover:bg-white/5 text-gray-200" : "hover:bg-black/5 text-gray-700"}`}>Cancel</button>
            <button onClick={joinFromInput} className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white">Join</button>
          </div>
        </Modal>
      )}

      {/* Share modal */}
      {showShare && (
        <Modal onClose={() => setShowShare(false)} theme={theme}>
          <h3 className="text-lg font-semibold mb-1">Live collaboration</h3>
          <p className={`text-sm mb-4 ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>Share this link to invite others to draw with you in real time.</p>
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 font-mono text-sm ${theme === "dark" ? "bg-[#0f0f10] border border-white/10 text-gray-200" : "bg-gray-50 border border-gray-200 text-gray-800"}`}>
            <span className="truncate flex-1">{shareUrl}</span>
            <button
              onClick={copyShareLink}
              className="px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-1"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {connected && (
            <div className={`mt-4 rounded-lg px-3 py-2 text-sm ${theme === "dark" ? "bg-emerald-500/10 text-emerald-300" : "bg-emerald-50 text-emerald-700"}`}>
              <span className="font-medium">Session live</span> — {roomUsers.length} participant{roomUsers.length === 1 ? "" : "s"}
            </div>
          )}
          <div className="flex gap-2 justify-end mt-4">
            <button onClick={() => setShowShare(false)} className={`px-4 py-2 rounded-lg text-sm font-medium ${theme === "dark" ? "hover:bg-white/5 text-gray-200" : "hover:bg-black/5 text-gray-700"}`}>Done</button>
          </div>
        </Modal>
      )}

      {/* Help / shortcuts modal */}
      {showHelp && (
        <Modal onClose={() => setShowHelp(false)} theme={theme} size="lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Keyboard shortcuts</h3>
            <button onClick={() => setShowHelp(false)} className={`p-1 rounded ${theme === "dark" ? "hover:bg-white/5" : "hover:bg-black/5"}`}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Section title="Tools">
              <Row theme={theme} label="Selection" keys={["V"]} />
              <Row theme={theme} label="Hand (pan)" keys={["H"]} />
              <Row theme={theme} label="Rectangle" keys={["R"]} />
              <Row theme={theme} label="Diamond" keys={["D"]} />
              <Row theme={theme} label="Ellipse" keys={["O"]} />
              <Row theme={theme} label="Arrow" keys={["A"]} />
              <Row theme={theme} label="Line" keys={["L"]} />
              <Row theme={theme} label="Draw" keys={["P"]} />
              <Row theme={theme} label="Text" keys={["T"]} />
              <Row theme={theme} label="Eraser" keys={["E"]} />
            </Section>
            <Section title="Edit">
              <Row theme={theme} label="Undo" keys={["Ctrl", "Z"]} />
              <Row theme={theme} label="Redo" keys={["Ctrl", "Shift", "Z"]} />
              <Row theme={theme} label="Select all" keys={["Ctrl", "A"]} />
              <Row theme={theme} label="Duplicate" keys={["Ctrl", "D"]} />
              <Row theme={theme} label="Delete" keys={["Delete"]} />
              <Row theme={theme} label="Nudge" keys={["Arrows"]} />
              <Row theme={theme} label="Deselect" keys={["Esc"]} />
            </Section>
            <Section title="View">
              <Row theme={theme} label="Pan" keys={["Space", "+", "Drag"]} />
              <Row theme={theme} label="Zoom" keys={["Ctrl", "Wheel"]} />
              <Row theme={theme} label="Reset view" keys={["Click", "%"]} />
            </Section>
            <Section title="While drawing">
              <Row theme={theme} label="Perfect shapes" keys={["Shift"]} />
              <Row theme={theme} label="Help" keys={["?"]} />
            </Section>
          </div>
        </Modal>
      )}

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="fixed top-24 right-4 z-40 space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`px-4 py-2.5 rounded-xl shadow-xl backdrop-blur-md border text-sm font-medium flex items-center gap-2 animate-[slideIn_200ms_ease-out] ${
                n.tone === "success" ? (theme === "dark" ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-200" : "bg-emerald-50 border-emerald-200 text-emerald-800")
                : n.tone === "error" ? (theme === "dark" ? "bg-red-500/20 border-red-500/30 text-red-200" : "bg-red-50 border-red-200 text-red-800")
                : (theme === "dark" ? "bg-[#1e1e1e]/90 border-white/10 text-gray-200" : "bg-white/95 border-black/5 text-gray-800")
              }`}
            >
              {n.msg}
            </div>
          ))}
        </div>
      )}

      {!username && (
        <AuthModal
          onLogin={(u) => setUsername(u)}
          onContinueAsGuest={async () => {
            try {
              const guestName = `guest-${Math.random().toString(36).slice(2, 8)}`;
              const resp = await api.post("/guest", { username: guestName });
              if (resp.data?.token) {
                setAuthTokenOnly(resp.data.token);
                setUsername(guestName);
              }
            } catch {
              notify("Could not start a guest session", "error");
            }
          }}
          theme={theme}
        />
      )}

      <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

function MenuItem({ onClick, icon, label, shortcut, danger }: { onClick: () => void; icon: React.ReactNode; label: string; shortcut?: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${danger ? "text-red-500 hover:bg-red-500/10" : "hover:bg-indigo-500/10"}`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {shortcut && <kbd className="text-[10px] opacity-60">{shortcut}</kbd>}
    </button>
  );
}

function Modal({ children, onClose, theme, size = "md" }: { children: React.ReactNode; onClose: () => void; theme: "light" | "dark"; size?: "md" | "lg" }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative w-full ${size === "lg" ? "max-w-2xl" : "max-w-md"} rounded-2xl p-6 shadow-2xl border ${theme === "dark" ? "bg-[#1a1a1c] border-white/10 text-gray-100" : "bg-white border-black/5 text-gray-900"}`}
      >
        {children}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h4 className="text-xs uppercase tracking-wider font-semibold opacity-60 mb-2">{title}</h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, keys, theme }: { label: string; keys: string[]; theme: "light" | "dark" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-1">
        {keys.map((k, i) => (
          <kbd key={i} className={`text-[11px] font-mono rounded-md px-1.5 py-0.5 border ${theme === "dark" ? "bg-[#0f0f10] border-white/10 text-gray-200" : "bg-gray-50 border-gray-200 text-gray-700"}`}>{k}</kbd>
        ))}
      </div>
    </div>
  );
}
