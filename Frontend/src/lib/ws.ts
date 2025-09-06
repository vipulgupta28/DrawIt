export type MessageHandler = (data: any) => void;

export function createRoomSocket(token: string, onMessage: MessageHandler, onClose?: (ev: CloseEvent) => void) {
	const BASE_URL = "wss://drawit-2.onrender.com";
	const url = `${BASE_URL}?token=${encodeURIComponent(token)}`;
	const socket = new WebSocket(url);
	
	// Add connection timeout
	const connectionTimeout = setTimeout(() => {
		if (socket.readyState === WebSocket.CONNECTING) {
			console.error("WebSocket connection timeout");
			socket.close();
		}
	}, 10000); // 10 second timeout
	
	socket.addEventListener("open", () => {
		console.log("WebSocket connection opened");
		clearTimeout(connectionTimeout);
	});
	
	socket.addEventListener("message", (ev) => {
		try { onMessage(JSON.parse(ev.data)); } catch (error) {
			console.error("Failed to parse WebSocket message:", error);
		}
	});
	
	socket.addEventListener("error", (error) => {
		console.error("WebSocket error:", error);
		clearTimeout(connectionTimeout);
	});
	
	if (onClose) {
		socket.addEventListener("close", (ev) => {
			console.log("WebSocket connection closed:", ev.code, ev.reason);
			clearTimeout(connectionTimeout);
			onClose(ev);
		});
	}
	
	return socket;
}
