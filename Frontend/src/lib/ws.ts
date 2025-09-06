export type MessageHandler = (data: any) => void;

export function createRoomSocket(token: string, onMessage: MessageHandler, onClose?: (ev: CloseEvent) => void) {
	// Use localhost for development, production URL for deployment
	const BASE_URL = import.meta.env.DEV 
		? "ws://localhost:3000" 
		: "wss://drawit-2.onrender.com";
	const url = `${BASE_URL}?token=${encodeURIComponent(token)}`;
	
	console.log("Attempting WebSocket connection to:", url);
	console.log("Token (first 20 chars):", token.substring(0, 20) + "...");
	
	const socket = new WebSocket(url);
	
	// Add connection timeout
	const connectionTimeout = setTimeout(() => {
		if (socket.readyState === WebSocket.CONNECTING) {
			console.error("WebSocket connection timeout after 10 seconds");
			socket.close();
		}
	}, 10000); // 10 second timeout
	
	socket.addEventListener("open", () => {
		console.log("✅ WebSocket connection opened successfully");
		clearTimeout(connectionTimeout);
	});
	
	socket.addEventListener("message", (ev) => {
		try { 
			onMessage(JSON.parse(ev.data)); 
		} catch (error) {
			console.error("Failed to parse WebSocket message:", error);
		}
	});
	
	socket.addEventListener("error", (error) => {
		console.error("❌ WebSocket error:", error);
		console.error("WebSocket readyState:", socket.readyState);
		console.error("WebSocket URL:", socket.url);
		clearTimeout(connectionTimeout);
	});
	
	socket.addEventListener("close", (ev) => {
		console.log("🔌 WebSocket connection closed - Code:", ev.code, "Reason:", ev.reason);
		console.log("Close was clean:", ev.wasClean);
		clearTimeout(connectionTimeout);
		
		// Provide more specific error messages based on close codes
		if (ev.code === 4000) {
			console.error("Server rejected connection: No URL provided");
		} else if (ev.code === 4001) {
			console.error("Server rejected connection: Unauthorized (invalid token)");
		} else if (ev.code === 1006) {
			console.error("Connection closed abnormally - server may be down or unreachable");
		} else if (ev.code === 1011) {
			console.error("Server error occurred");
		}
		
		if (onClose) {
			onClose(ev);
		}
	});
	
	return socket;
}

// Test function to debug WebSocket connection
export function testWebSocketConnection(token: string) {
	console.log("🧪 Testing WebSocket connection...");
	
	const BASE_URL = import.meta.env.DEV 
		? "ws://localhost:3000" 
		: "wss://drawit-2.onrender.com";
	const url = `${BASE_URL}?token=${encodeURIComponent(token)}`;
	
	console.log("Test URL:", url);
	console.log("Token length:", token.length);
	
	const testSocket = new WebSocket(url);
	
	testSocket.addEventListener("open", () => {
		console.log("✅ Test WebSocket connection successful!");
		testSocket.close();
	});
	
	testSocket.addEventListener("error", (error) => {
		console.error("❌ Test WebSocket connection failed:", error);
	});
	
	testSocket.addEventListener("close", (ev) => {
		console.log("🔌 Test WebSocket closed - Code:", ev.code, "Reason:", ev.reason);
	});
	
	return testSocket;
}

// Function to set up automatic token refresh
export function setupTokenRefresh() {
	// Check token every 5 minutes
	setInterval(async () => {
		const token = localStorage.getItem("authToken");
		if (token) {
			const validation = validateToken(token);
			if (!validation.isValid && validation.error === "Token is expired") {
				console.log("🔄 Token expired, refreshing automatically...");
				await getFreshToken();
			}
		}
	}, 5 * 60 * 1000); // 5 minutes
}

// Function to validate JWT token format
export function validateToken(token: string): { isValid: boolean; error?: string } {
	if (!token) {
		return { isValid: false, error: "Token is empty" };
	}
	
	// JWT tokens have 3 parts separated by dots
	const parts = token.split('.');
	if (parts.length !== 3) {
		return { isValid: false, error: "Invalid JWT format - should have 3 parts" };
	}
	
	try {
		// Decode the header and payload (without verification)
		const header = JSON.parse(atob(parts[0]));
		const payload = JSON.parse(atob(parts[1]));
		
		console.log("Token header:", header);
		console.log("Token payload:", payload);
		
		// Check if token is expired
		if (payload.exp && payload.exp < Date.now() / 1000) {
			return { isValid: false, error: "Token is expired" };
		}
		
		return { isValid: true };
	} catch (error) {
		return { isValid: false, error: "Failed to decode token: " + error };
	}
}

// Function to get a fresh token
export async function getFreshToken(): Promise<string | null> {
	try {
		// Try to get a new guest token
		const response = await fetch(`${import.meta.env.DEV ? 'http://localhost:3000' : 'https://drawit-2.onrender.com'}/guest`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ 
				username: `user_${Date.now()}` // Generate a unique username
			})
		});
		
		if (response.ok) {
			const data = await response.json();
			localStorage.setItem("authToken", data.token);
			console.log('✅ Got fresh token');
			return data.token;
		} else {
			console.error('❌ Failed to get fresh token:', response.status);
			return null;
		}
	} catch (error) {
		console.error('❌ Error getting fresh token:', error);
		return null;
	}
}
