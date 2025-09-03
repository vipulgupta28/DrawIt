export type MessageHandler = (data: any) => void;

export function createRoomSocket(token: string, onMessage: MessageHandler, onClose?: (ev: CloseEvent) => void) {
	const url = `ws://localhost:3000?token=${encodeURIComponent(token)}`;
	const socket = new WebSocket(url);
	
	socket.addEventListener("message", (ev) => {
		try { onMessage(JSON.parse(ev.data)); } catch {}
	});
	if (onClose) socket.addEventListener("close", onClose);
	return socket;
}
