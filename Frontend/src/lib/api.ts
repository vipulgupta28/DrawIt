import axios, { AxiosHeaders } from "axios";

const BASE_URL = "https://drawit-2.onrender.com";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Function to check if token is expired
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp && payload.exp < Date.now() / 1000;
  } catch {
    return true; // If we can't parse it, consider it expired
  }
}

// Function to refresh token (you'll need to implement this based on your auth flow)
async function refreshToken(): Promise<string | null> {
  try {
    // Try to get a new guest token or refresh the existing one
    const response = await api.post('/guest', { 
      username: `user_${Date.now()}` // Generate a unique username
    });
    return response.data.token;
  } catch (error) {
    console.error('Failed to refresh token:', error);
    return null;
  }
}

api.interceptors.request.use(async (config) => {
  let token = localStorage.getItem("authToken");
  
  // Check if token is expired and try to refresh
  if (token && isTokenExpired(token)) {
    console.log('🔄 Token expired, attempting to refresh...');
    const newToken = await refreshToken();
    if (newToken) {
      localStorage.setItem("authToken", newToken);
      token = newToken;
      console.log('✅ Token refreshed successfully');
    } else {
      console.error('❌ Failed to refresh token');
      // Clear the expired token
      localStorage.removeItem("authToken");
      token = null;
    }
  }
  
  if (token) {
    if (!config.headers) config.headers = new AxiosHeaders();
    (config.headers as AxiosHeaders).set("Authorization", `Bearer ${token}`);
  }
  return config;
});

export default api;


