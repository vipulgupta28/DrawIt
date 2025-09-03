export type MessageHandler = (data: any) => void;

export function createRoomSocket(token: string, onMessage: MessageHandler, onClose?: (ev: CloseEvent) => void) {
	const BASE_URL = " https://drawit-2.onrender.com";
	const wsUrl = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://');
	const url = `${wsUrl}?token=${encodeURIComponent(token)}`;
	const socket = new WebSocket(url);
	
	socket.addEventListener("message", (ev) => {
		try { onMessage(JSON.parse(ev.data)); } catch {}
	});
	if (onClose) socket.addEventListener("close", onClose);
	return socket;
}
