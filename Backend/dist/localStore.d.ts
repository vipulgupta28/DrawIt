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
export declare function publicUser(user: StoredUser): {
    id: string;
    name: string;
    username: string;
};
export declare function addUser(user: StoredUser): Promise<{
    ok: true;
} | {
    ok: false;
    error: string;
}>;
export declare function findUserByUsername(username: string): Promise<StoredUser | undefined>;
export declare function getChatsByRoom(roomId: string): Promise<ChatMessage[]>;
export declare function getRoomBySlug(slug: string): Promise<StoredRoom | null>;
//# sourceMappingURL=localStore.d.ts.map