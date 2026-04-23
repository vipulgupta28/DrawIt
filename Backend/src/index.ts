import express from "express";
import jwt, { type JwtPayload } from 'jsonwebtoken';
import {WebSocketServer} from "ws";
import crypto from "crypto";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import cors from "cors"
import { addUser, findUserByUsername, getChatsByRoom, getRoomBySlug, publicUser, type StoredUser } from "./localStore.js";
import http from "http"


interface ConnectedUser {
    userId: string;
    rooms: string[];
    ws: import('ws').WebSocket;
  }
  
  const users: ConnectedUser[] = [];
  

dotenv.config();




const JWT_SECRET = process.env.JWT_SECRET!

function checkUser(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & { id: string };
    return decoded.id; // we put id in payload during signin
  } catch (err) {
    return null;
  }
}

const app = express();

app.use(express.json());
app.use(cors());

const server = http.createServer(app);

const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:4173",
    "https://draw-it-sepia-one.vercel.app", // your deployed frontend
  ];
  

// Attach WebSocket server to the HTTP server with CORS configuration
const wss = new WebSocketServer({ 
  server,
  verifyClient: (info, done) => {
    const origin = info.origin;
    if (!origin || allowedOrigins.includes(origin)) {
      done(true);
    } else {
      done(false, 403, "Forbidden");
    }
  }
  
});

wss.on("connection", (ws, request) => {
  const url = request.url;
  const origin = request.headers.origin;
  
  console.log("🔌 New WebSocket connection attempt from origin:", origin);
  console.log("🔗 Connection URL:", url);
  
  if (!url) {
    console.warn("WebSocket connection rejected: no URL provided");
    ws.close(4000, "No URL provided");
    return;
  }

  const queryParams = new URLSearchParams(url.split("?")[1]);
  const token = queryParams.get("token") || "";
  const userId = checkUser(token);

  console.log("🔐 Token validation - User ID:", userId);

  if (!userId) {
    console.warn("❌ WebSocket unauthorized connection attempt from origin:", origin);
    ws.close(4001, "unauthorized");
    return;
  }
  
  console.log("✅ WebSocket connection established for user:", userId, "from origin:", origin);

  users.push({ userId, rooms: [], ws });

  // Set up keepalive ping-pong mechanism
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.ping();
      } catch (error) {
        console.error("Error sending ping:", error);
        clearInterval(pingInterval);
      }
    } else {
      clearInterval(pingInterval);
    }
  }, 30000); // Ping every 30 seconds

  ws.on("pong", () => {
    // Client responded to ping, connection is alive
  });

  ws.on("message", (data) => {
    try {
      const parseData = JSON.parse(data.toString());
      console.log("📨 Received message from user", userId, ":", parseData.type);

      if (parseData.type === "join_room") {
        console.log("🏠 User", userId, "attempting to join room:", parseData.roomId);
        const user = users.find((x) => x.ws === ws);
        console.log("👤 User found in users array:", !!user);
        if (user) {
          console.log("📋 User's current rooms:", user.rooms);
          console.log("🔄 Room already joined:", user.rooms.includes(parseData.roomId));
        }
        if (user && !user.rooms.includes(parseData.roomId)) {
          console.log("✅ Adding user", userId, "to room:", parseData.roomId);
          user.rooms.push(parseData.roomId);
          
          // Notify other users in the room
          users.forEach((otherUser) => {
            if (otherUser.ws !== ws && otherUser.rooms.includes(parseData.roomId)) {
              try {
                otherUser.ws.send(JSON.stringify({
                  type: "user_joined",
                  roomId: parseData.roomId,
                  userId: user.userId
                }));
                console.log("📤 Sent user_joined to user:", otherUser.userId);
              } catch (error) {
                console.error("❌ Failed to send user_joined to user:", otherUser.userId, error);
              }
            }
          });

          // Push updated room user list to all in room
          const roomUsers = users.filter(u => u.rooms.includes(parseData.roomId)).map(u => u.userId);
          console.log("👥 Room users after join:", roomUsers);
          users.forEach((u) => {
            if (u.rooms.includes(parseData.roomId)) {
              try {
                u.ws.send(JSON.stringify({ type: "room_users", roomId: parseData.roomId, users: roomUsers }));
                console.log("📤 Sent room_users to user:", u.userId);
              } catch (error) {
                console.error("❌ Failed to send room_users to user:", u.userId, error);
              }
            }
          });

          // Ask for current snapshot from someone in the room (not the joiner)
          const donor = users.find(u => u.ws !== ws && u.rooms.includes(parseData.roomId));
          if (donor) {
            try {
              donor.ws.send(JSON.stringify({ type: "request_snapshot", roomId: parseData.roomId }));
              console.log("📤 Sent request_snapshot to user:", donor.userId);
            } catch (error) {
              console.error("❌ Failed to send request_snapshot to user:", donor.userId, error);
            }
          } else {
            console.log("ℹ️ No donor found for snapshot request");
          }
          
          console.log("✅ User", userId, "successfully joined room", parseData.roomId);
          console.log("🔍 WebSocket state after join:", ws.readyState);
        } else {
          console.log("⚠️ User not found or already in room");
        }
      }
      
      if (parseData.type === "leave_room") {
      const user = users.find((x) => x.ws === ws);
      if (user) {
        user.rooms = user.rooms.filter((r) => r !== parseData.roomId);
        
        // Notify other users in the room
        users.forEach((otherUser) => {
          if (otherUser.rooms.includes(parseData.roomId)) {
            otherUser.ws.send(JSON.stringify({
              type: "user_left",
              roomId: parseData.roomId,
              userId: user.userId
            }));
          }
        });

        // Push updated room user list after leave
        const roomUsers = users.filter(u => u.rooms.includes(parseData.roomId)).map(u => u.userId);
        users.forEach((u) => {
          if (u.rooms.includes(parseData.roomId)) {
            u.ws.send(JSON.stringify({ type: "room_users", roomId: parseData.roomId, users: roomUsers }));
          }
        });
      }
    }

    if (parseData.type === "chat") {
      const { roomId, message } = parseData;
      users.forEach((user) => {
        if (user.rooms.includes(roomId)) {
          user.ws.send(
            JSON.stringify({
              type: "chat",
              message,
              roomId,
            })
          );
        }
      });
    }

    if (parseData.type === "canvas_update") {
      const { roomId, snapshot } = parseData;
      users.forEach((user) => {
        if (user.ws !== ws && user.rooms.includes(roomId)) {
          user.ws.send(
            JSON.stringify({
              type: "canvas_update",
              roomId,
              snapshot,
            })
          );
        }
      });
    }

      if (parseData.type === "get_room_users") {
        const { roomId } = parseData;
        const roomUsers = users.filter(user => user.rooms.includes(roomId));
        ws.send(JSON.stringify({
          type: "room_users",
          roomId,
          users: roomUsers.map(u => u.userId)
        }));
      }
      
    } catch (error) {
      console.error("❌ Error parsing WebSocket message from user", userId, ":", error);
      console.error("Raw message:", data.toString());
    }
  });

  ws.on("error", (err) => {
    try { console.error("WS error:", err); } catch {}
  });

  ws.on("close", (code, reason) => {
    console.log("🔌 WebSocket connection closed for user:", userId, "Code:", code, "Reason:", reason.toString());
    console.log("📊 Total connected users before cleanup:", users.length);
    
    // Clean up ping interval
    clearInterval(pingInterval);
    
    const idx = users.findIndex(u => u.ws === ws);
    if (idx >= 0) {
      const user = users[idx]!;
      // notify rooms this user left
      user.rooms.forEach((roomId) => {
        users.forEach((otherUser) => {
          if (otherUser.ws !== ws && otherUser.rooms.includes(roomId)) {
            try {
              otherUser.ws.send(JSON.stringify({ type: "user_left", roomId, userId: user.userId }));
            } catch {}
          }
        });
      });
      users.splice(idx, 1);
    }
  });
});

app.post("/signup", async (req, res) => {
  try {
    const { name, username, password } = req.body;

    if (!name || !username || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = crypto.randomUUID();
    const user: StoredUser = {
      id,
      name: String(name).trim(),
      username: String(username).trim(),
      password: hashedPassword,
    };

    const inserted = await addUser(user);
    if (!inserted.ok) {
      return res.status(400).json({ error: inserted.error });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      token,
      user: publicUser(user),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/signin", async (req, res) => {
    try {

      const { username, password } = req.body;
  
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
  
      const user = await findUserByUsername(username);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
  
      // 2. Compare password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
  
      const token = jwt.sign(
        { id: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.json({ token, user: publicUser(user) });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Server error" });
    }
  });


// Lightweight guest token (username only)
app.post("/guest", (req, res) => {
  const { username } = req.body || {};
  if (!username || typeof username !== "string") {
    return res.status(400).json({ error: "username required" });
  }
  const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
  const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: "6h" });
  return res.json({ token, user: { id, username } });
});



  app.get("/chats/:roomId", async (req, res) => {
    try {
      const roomId = req.params.roomId;
      const messages = await getChatsByRoom(roomId);
      return res.json({ messages });
    } catch (e) {
      return res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/room/:slug", async (req, res) => {
    try {
      const slug = req.params.slug;
      const room = await getRoomBySlug(slug);
      return res.json({ room });
    } catch (e) {
      return res.status(500).json({ error: "Server error" });
    }
  });


app.get("/health", (req, res) => {
  res.send("OK");
});



server.listen(3000);
