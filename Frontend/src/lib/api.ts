import axios, { AxiosHeaders } from "axios";
import { clearAuthSession, getAuthToken } from "./authStorage";

const BASE_URL = "https://drawit-2.onrender.com";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1])) as { exp?: number };
    return Boolean(payload.exp && payload.exp < Date.now() / 1000);
  } catch {
    return true;
  }
}

api.interceptors.request.use(async (config) => {
  let token = getAuthToken();

  if (token && isTokenExpired(token)) {
    clearAuthSession();
    token = null;
  }

  if (token) {
    if (!config.headers) config.headers = new AxiosHeaders();
    (config.headers as AxiosHeaders).set("Authorization", `Bearer ${token}`);
  }
  return config;
});

export default api;


