import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
const DATA_FILE = join(process.cwd(), "data", "app.json");
function emptyData() {
    return { users: [], chats: {}, rooms: [] };
}
async function readData() {
    try {
        const raw = await readFile(DATA_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        return {
            users: Array.isArray(parsed.users) ? parsed.users : [],
            chats: parsed.chats && typeof parsed.chats === "object" ? parsed.chats : {},
            rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
        };
    }
    catch {
        return emptyData();
    }
}
async function writeData(data) {
    await mkdir(dirname(DATA_FILE), { recursive: true });
    await writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}
let chain = Promise.resolve();
function runExclusive(fn) {
    const next = chain.then(fn, fn);
    chain = next.then(() => undefined, () => undefined);
    return next;
}
export function publicUser(user) {
    const { password: _p, ...rest } = user;
    return rest;
}
export async function addUser(user) {
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
export async function findUserByUsername(username) {
    return runExclusive(async () => {
        const data = await readData();
        return data.users.find((u) => u.username === username.trim());
    });
}
export async function getChatsByRoom(roomId) {
    return runExclusive(async () => {
        const data = await readData();
        return data.chats[roomId] ?? [];
    });
}
export async function getRoomBySlug(slug) {
    return runExclusive(async () => {
        const data = await readData();
        const r = data.rooms.find((x) => x.slug === slug);
        return r ?? null;
    });
}
//# sourceMappingURL=localStore.js.map