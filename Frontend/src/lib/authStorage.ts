/** Browser session for DrawIt — token + profile (no external auth provider). */

export const AUTH_TOKEN_KEY = "authToken";
export const AUTH_USER_KEY = "user";

export type StoredAuthUser = {
  id: string;
  username: string;
  name?: string;
};

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getAuthUser(): StoredAuthUser | null {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAuthUser;
  } catch {
    return null;
  }
}

export function saveAuthSession(token: string, user: StoredAuthUser) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function setAuthTokenOnly(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}
