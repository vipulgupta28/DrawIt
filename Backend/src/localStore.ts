import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";

const DATA_FILE = join(process.cwd(), "data", "app.json");

export type StoredUser = {
  id: string;
  name: string;
  username: string;
  password: string;
};

export type ChatMessage = {
  id: string;
  roomId: string;
  message: string;
  createdAt: string;
};

export type StoredRoom = {
  id: string;
  slug: string;
  name?: string;
};

type AppData = {
  users: StoredUser[];
  chats: Record<string, ChatMessage[]>;
  rooms: StoredRoom[];
};

function emptyData(): AppData {
  return { users: [], chats: {}, rooms: [] };
}

async function readData(): Promise<AppData> {
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      chats: parsed.chats && typeof parsed.chats === "object" ? parsed.chats : {},
      rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
    };
  } catch {
    return emptyData();
  }
}

async function writeData(data: AppData): Promise<void> {
  await mkdir(dirname(DATA_FILE), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

let chain: Promise<unknown> = Promise.resolve();

function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export function publicUser(user: StoredUser) {
  const { password: _p, ...rest } = user;
  return rest;
}

export async function addUser(user: StoredUser): Promise<{ ok: true } | { ok: false; error: string }> {
  return runExclusive(async () => {
    const data = await readData();
    const uname = user.username.trim().toLowerCase();
    if (data.users.some((u) => u.username.trim().toLowerCase() === uname)) {
      return { ok: false, error: "Username already taken" };
    }
    data.users.push(user);
    await writeData(data);
    return { ok: true };
  });
}

export async function findUserByUsername(username: string): Promise<StoredUser | undefined> {
  return runExclusive(async () => {
    const data = await readData();
    return data.users.find((u) => u.username === username.trim());
  });
}

export async function getChatsByRoom(roomId: string): Promise<ChatMessage[]> {
  return runExclusive(async () => {
    const data = await readData();
    return data.chats[roomId] ?? [];
  });
}

export async function getRoomBySlug(slug: string): Promise<StoredRoom | null> {
  return runExclusive(async () => {
    const data = await readData();
    const r = data.rooms.find((x) => x.slug === slug);
    return r ?? null;
  });
}
