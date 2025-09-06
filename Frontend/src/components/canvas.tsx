// Canvas.tsx
import { useEffect, useRef, useState } from "react";
import api from "../lib/api";
import { createRoomSocket, testWebSocketConnection, validateToken, getFreshToken } from "../lib/ws";
import initDraw, { setTool, undo, redo, clearAll, exportPNG, onChange, replaceSnapshot, getSnapshot, onViewChange, getViewTransform, setZoom } from "./draw";
import {
  Square,
  Circle,
  Slash,
  Triangle,
  Type,
  MousePointer,
  PenTool,
  ArrowRight,
} from "lucide-react";

import Sidebar from "./Sidebar";
import AuthModal from "./authModal";

export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");
  const [roomUsers, setRoomUsers] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [activeTool, setActiveTool] = useState<string>("rect");
  const [zoomPct, setZoomPct] = useState<number>(100);

  // Check for stored authentication and room parameters on component mount
  useEffect(() => {
    const storedToken = localStorage.getItem("authToken");
    const storedUser = localStorage.getItem("user");
    
    if (storedToken && storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setUsername(user.username);
        
        // Check if there's a room parameter in the URL
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get("room");
        
        if (roomParam && storedToken) {
          // Auto-join the room from URL
          connectToRoom(storedToken, roomParam);
        }
      } catch (e) {
        console.error("Failed to parse stored user data");
        localStorage.removeItem("authToken");
        localStorage.removeItem("user");
      }
    }
  }, []);

 

  useEffect(() => {
    if (canvasRef.current) {
      initDraw(canvasRef.current);
    }
  }, []);

  useEffect(() => {
    const unsub = onViewChange((v) => {
      setZoomPct(Math.round(v.scale * 100));
    });
    const v = getViewTransform();
    setZoomPct(Math.round(v.scale * 100));
    return () => { unsub && unsub(); };
  }, []);

  useEffect(() => {
    // listen to local changes and broadcast if connected
    const unsubscribe = onChange((snap) => {
      if (ws && roomId) {
        ws.send(JSON.stringify({ type: "canvas_update", roomId, snapshot: snap }));
      }
    });
    return () => { unsubscribe(); };
  }, [ws, roomId]);

  // no DB persistence for canvas

  // removed autosave

  // removed save-on-unmount

  // Function to show notifications
  function showNotification(message: string) {
    setNotifications(prev => [...prev, message]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n !== message));
    }, 3000);
  }

  // Function to leave current room
  function leaveCurrentRoom() {
    if (ws && roomId) {
      // Send leave room message
      ws.send(JSON.stringify({ type: "leave_room", roomId }));
      // Close existing websocket to avoid stale connections
      try { ws.close(); } catch {}
    }
  }

  // connect helper
  async function connectToRoom(token: string, rid: string) {
    console.log("🔗 Attempting to connect to room:", rid);
    
    // Validate token first
    const tokenValidation = validateToken(token);
    if (!tokenValidation.isValid) {
      console.error("❌ Invalid token:", tokenValidation.error);
      
      // If token is expired, try to get a fresh one
      if (tokenValidation.error === "Token is expired") {
        console.log("🔄 Token expired, attempting to get fresh token...");
        const freshToken = await getFreshToken();
        if (freshToken) {
          console.log("✅ Got fresh token, retrying connection...");
          return connectToRoom(freshToken, rid);
        } else {
          alert("Session expired. Please refresh the page to get a new session.");
          return;
        }
      } else {
        alert("Invalid authentication token. Please sign in again.");
        return;
      }
    }
    
    // Test WebSocket connection first
    console.log("🧪 Testing WebSocket connection...");
    testWebSocketConnection(token);
    
    // Leave current room if any
    leaveCurrentRoom();
    // Ensure any previous socket is closed before opening a new one
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.close(); } catch {}
    }
    
    const socket = createRoomSocket(token, () => {}, undefined);
    let triedGuest = false;
    
    socket.addEventListener("open", () => {
      console.log("WebSocket connected, joining room:", rid);
      socket.send(JSON.stringify({ type: "join_room", roomId: rid }));
      // Request current room users (server also pushes on join)
      socket.send(JSON.stringify({ type: "get_room_users", roomId: rid }));
    });
    
    socket.addEventListener("message", (ev) => {
      try {
        const data = JSON.parse(ev.data);
        console.log("WebSocket message received:", data);
        if (data.type === "canvas_update" && data.roomId === rid) {
          replaceSnapshot(data.snapshot);
        } else if (data.type === "room_users" && data.roomId === rid) {
          setRoomUsers(data.users || []);
        } else if (data.type === "request_snapshot" && data.roomId === rid) {
          // another client requested current snapshot for this room
          const snap = getSnapshot();
          socket.send(JSON.stringify({ type: "canvas_snapshot", roomId: rid, snapshot: snap }));
        } else if (data.type === "canvas_snapshot" && data.roomId === rid) {
          replaceSnapshot(data.snapshot);
        } else if (data.type === "user_joined" && data.roomId === rid) {
          showNotification(`User joined the room`);
        } else if (data.type === "user_left" && data.roomId === rid) {
          showNotification(`User left the room`);
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    });
    
    socket.addEventListener("error", (error) => {
      console.error("WebSocket error:", error);
      alert("Failed to connect to room. Please try again.");
    });
    
    socket.addEventListener("close", async (ev) => {
      console.log("WebSocket connection closed", ev.code, ev.reason);
      if (ev.code === 4001) {
        try {
          if (!triedGuest) {
            triedGuest = true;
            // obtain a guest token and retry once
            const guestName = `guest-${Math.random().toString(36).slice(2,8)}`;
            const resp = await api.post("/guest", { username: guestName });
            if (resp.data?.token) {
              // only refresh the token; do NOT overwrite stored user profile
              localStorage.setItem("authToken", resp.data.token);
              // keep showing existing username if already set
              connectToRoom(resp.data.token, rid);
              return;
            }
          }
        } catch (e) {
          console.error("Guest fallback failed", e);
        }
        alert("Your session expired or is invalid. Please login again.");
        handleLogout();
      }
    });
    
    setWs(socket);
    setRoomId(rid);
    
    // Clear room parameter from URL after joining
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState({}, "", url.toString());
  }

  async function createShareLink() {
    const storedToken = localStorage.getItem("authToken");
    if (!storedToken) {
      alert("Please login first to create a share link");
      return;
    }

    const rid = cryptoRandom(8);
    const base = window.location.origin + window.location.pathname;
    const url = `${base}?room=${rid}`;
    try {
      connectToRoom(storedToken, rid);
      await navigator.clipboard.writeText(url);
      alert("Share link copied!\n" + url);
    } catch (e) {
      console.error(e);
      alert("Failed to create share link");
    }
  }

  async function joinFromInput() {
    const storedToken = localStorage.getItem("authToken");
    if (!storedToken) {
      alert("Please login first to join a room");
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
      if (!rid) return alert("Please enter a valid link or room id");
      
      connectToRoom(storedToken, rid);
      setShowJoinModal(false);
      alert("Connected to room");
    } catch (e) {
      console.error(e);
      alert("Failed to join room");
    }
  }

  function cryptoRandom(len: number) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function handleLogout() {
    // Leave current room and save canvas before logout
    leaveCurrentRoom();
    
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    setUsername(null);
    setRoomId(null);
    if (ws) {
      ws.close();
      setWs(null);
    }
  }

  return (
    <div className="bg-black w-full h-screen overflow-hidden">

        <Sidebar/>

      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-20">
        <div className="flex bg-white text-black rounded-xl gap-2 p-3 shadow-lg items-center">
          <button onClick={() => { setTool("rect"); setActiveTool("rect"); }} className={`p-1 rounded ${activeTool === "rect" ? 'bg-gray-300' : 'hover:bg-gray-200'}`}>
            <Square className="w-5 h-5" />
          </button>
          <button onClick={() => { setTool("select" as any); setActiveTool("select"); }} className={`p-1 rounded ${activeTool === "select" ? 'bg-gray-300' : 'hover:bg-gray-200'}`}>
            <MousePointer className="w-5 h-5" />
          </button>
          <button onClick={() => { setTool("line"); setActiveTool("line"); }} className={`p-1 rounded ${activeTool === "line" ? 'bg-gray-300' : 'hover:bg-gray-200'}`}>
            <Slash className="w-5 h-5" />
          </button>
          <button onClick={() => { setTool("ellipse"); setActiveTool("ellipse"); }} className={`p-1 rounded ${activeTool === "ellipse" ? 'bg-gray-300' : 'hover:bg-gray-200'}`}>
            <Circle className="w-5 h-5" />
          </button>
          <button onClick={() => { setTool("triangle"); setActiveTool("triangle"); }} className={`p-1 rounded ${activeTool === "triangle" ? 'bg-gray-300' : 'hover:bg-gray-200'}`}>
            <Triangle className="w-5 h-5" />
          </button>
          <button onClick={() => { setTool("text"); setActiveTool("text"); }} className={`p-1 rounded ${activeTool === "text" ? 'bg-gray-300' : 'hover:bg-gray-200'}`}>
            <Type className="w-5 h-5" />
          </button>
          <button onClick={() => { setTool("arrow" as any); setActiveTool("arrow"); }} className={`px-2 py-1 text-xs rounded ${activeTool === "arrow" ? 'bg-gray-300' : 'bg-gray-100 hover:bg-gray-200'}`}><ArrowRight className="w-5 h-5"/></button>
          <button onClick={() => { setTool("pen" as any); setActiveTool("pen"); }} className={`p-1 rounded ${activeTool === "pen" ? 'bg-gray-300' : 'hover:bg-gray-200'}`}>
            <PenTool className="w-5 h-5" />
          </button>
          <div className="w-px h-6 bg-gray-300 mx-1" />
          <button onClick={() => undo()} className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200">Undo</button>
          <button onClick={() => redo()} className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200">Redo</button>
          <div className="w-px h-6 bg-gray-300 mx-1" />
          <button onClick={() => setZoom(1/1.1)} className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200">-</button>
          <span className="text-xs text-gray-700 px-2 w-10 text-center">{zoomPct}%</span>
          <button onClick={() => setZoom(1.1)} className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200">+</button>
          <button onClick={() => clearAll()} className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200">Clear</button>
          <button
            onClick={() => {
              const dataUrl = exportPNG();
              if (!dataUrl) return;
              const a = document.createElement("a");
              a.href = dataUrl;
              a.download = "drawing.png";
              a.click();
            }}
            className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
          >
            Export
          </button>

        </div>
      </div>

             {username && (
         <div className="fixed top-4 left-4 z-20">
           <div className="bg-white/90 text-black rounded-xl px-3 py-2 shadow flex items-center gap-3">
             <span>{username}</span>
             {roomId && (
               <div className="flex items-center gap-2">
                 <div className={`w-2 h-2 rounded-full ${ws && ws.readyState === WebSocket.OPEN ? 'bg-green-500' : 'bg-red-500'}`}></div>
                 <span className="text-xs text-gray-600">Room: {roomId}</span>
                 <span className="text-xs text-gray-500">({roomUsers.length} users)</span>
               </div>
             )}
             <button
               onClick={handleLogout}
               className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 transition-colors"
             >
               Logout
             </button>
           </div>
         </div>
       )}

      <div className="fixed top-4 right-4 z-20">
        <div className="flex bg-white text-black rounded-xl gap-2 p-3 shadow-lg items-center">
          <button onClick={createShareLink} className="px-3 py-1 text-xs rounded bg-indigo-100 hover:bg-indigo-200">Share</button>
          <button onClick={() => setShowJoinModal(true)} className="px-3 py-1 text-xs rounded bg-emerald-100 hover:bg-emerald-200">Join</button>
        </div>
      </div>

      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowJoinModal(false)} />
          <div className="relative w-96 max-w-[90vw] rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold mb-3">Join a session</h3>
            <input
              type="text"
              value={joinUrl}
              onChange={(e) => setJoinUrl(e.target.value)}
              placeholder="Paste share link or enter room id"
              className="w-full border rounded px-3 py-2 mb-3"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowJoinModal(false)} className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300">Cancel</button>
              <button onClick={joinFromInput} className="px-3 py-1 rounded bg-emerald-500 text-white hover:bg-emerald-600">Join</button>
            </div>
          </div>
        </div>
      )}

             {/* Notifications */}
       {notifications.length > 0 && (
         <div className="fixed top-20 right-4 z-30 space-y-2">
           {notifications.map((notification, index) => (
             <div
               key={index}
               className="bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm animate-in slide-in-from-right"
             >
               {notification}
             </div>
           ))}
         </div>
       )}

       <canvas
         ref={canvasRef}
         className="absolute top-0 left-0 w-full h-full"
       />
    
      {!username && (
        <AuthModal onLogin={(u) => setUsername(u)} />
      )}
    </div>
  );
}