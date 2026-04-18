import { useState } from "react";
import api from "../lib/api";
import { saveAuthSession, type StoredAuthUser } from "../lib/authStorage";
import { PenTool, UserRound, Lock, User as UserIcon, Loader2, ArrowRight } from "lucide-react";

interface AuthModalProps {
  onLogin: (username: string) => void;
  onContinueAsGuest?: () => Promise<void> | void;
  theme?: "light" | "dark";
}

export default function AuthModal({ onLogin, onContinueAsGuest, theme = "light" }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (username.trim() === "" || password.trim() === "") {
      setError("Please fill in all fields");
      return;
    }
    if (mode === "signup" && name.trim() === "") {
      setError("Please enter your name");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (mode === "signup") {
        const response = await api.post("/signup", { name: name.trim(), username: username.trim(), password });
        if (response.data.token && response.data.user) {
          const u = response.data.user as StoredAuthUser;
          saveAuthSession(response.data.token, u);
          onLogin(u.username);
        }
      } else {
        const response = await api.post("/signin", { username: username.trim(), password });
        if (response.data.token && response.data.user) {
          const u = response.data.user as StoredAuthUser;
          saveAuthSession(response.data.token, u);
          onLogin(u.username);
        }
      }
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "response" in err &&
        err.response && typeof err.response === "object" && "data" in err.response &&
        err.response.data && typeof err.response.data === "object" && "error" in err.response.data
        ? String(err.response.data.error)
        : "Something went wrong. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const clearForm = () => { setUsername(""); setPassword(""); setName(""); setError(""); };
  const handleModeChange = (m: "login" | "signup") => { setMode(m); clearForm(); };

  const isDark = theme === "dark";
  const card = isDark
    ? "bg-[#1a1a1c] border-white/10 text-gray-100"
    : "bg-white border-black/5 text-gray-900";
  const iconColor = isDark ? "text-gray-500" : "text-gray-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className={`absolute inset-0 ${isDark ? "bg-black/70" : "bg-black/40"} backdrop-blur-sm`} />
      <div className={`relative w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${card}`}>
        {/* header */}
        <div className={`px-8 pt-8 pb-5 ${isDark ? "bg-gradient-to-br from-indigo-500/10 to-transparent" : "bg-gradient-to-br from-indigo-50 to-white"}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg">
              <PenTool className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">
                <span className="text-indigo-500">Draw</span>It
              </h2>
              <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>Collaborative whiteboard</p>
            </div>
          </div>

          <div className={`inline-flex items-center rounded-lg p-1 ${isDark ? "bg-white/5" : "bg-gray-100"}`}>
            <button
              onClick={() => handleModeChange("login")}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${mode === "login" ? (isDark ? "bg-[#1a1a1c] shadow text-white" : "bg-white shadow text-gray-900") : (isDark ? "text-gray-400" : "text-gray-500")}`}
            >Sign in</button>
            <button
              onClick={() => handleModeChange("signup")}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${mode === "signup" ? (isDark ? "bg-[#1a1a1c] shadow text-white" : "bg-white shadow text-gray-900") : (isDark ? "text-gray-400" : "text-gray-500")}`}
            >Create account</button>
          </div>
        </div>

        {/* body */}
        <div className="px-8 py-6 space-y-3.5">
          <style>{`
            .drawit-field { display: flex; align-items: center; gap: 10px; border-radius: 10px; padding: 10px 12px; border: 1px solid; transition: border-color 150ms, box-shadow 150ms; }
            .drawit-field:focus-within { box-shadow: 0 0 0 3px rgba(99,102,241,0.25); border-color: #6366f1; }
            .drawit-field input { width: 100%; background: transparent; outline: none; font-size: 14px; color: inherit; }
            .drawit-field input::placeholder { color: inherit; opacity: 0.55; }
          `}</style>
          {mode === "signup" && (
            <Field icon={<UserRound className={`w-4 h-4 ${iconColor}`} />} dark={isDark}>
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          )}
          <Field icon={<UserIcon className={`w-4 h-4 ${iconColor}`} />} dark={isDark}>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </Field>
          <Field icon={<Lock className={`w-4 h-4 ${iconColor}`} />} dark={isDark}>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            />
          </Field>

          {error && (
            <div className={`text-sm rounded-lg px-3 py-2 ${isDark ? "bg-red-500/10 text-red-300 border border-red-500/20" : "bg-red-50 text-red-700 border border-red-100"}`}>
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="group w-full mt-1 rounded-lg py-2.5 text-sm font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/20 disabled:opacity-60 flex items-center justify-center gap-2 transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {mode === "login" ? "Sign in" : "Create account"}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>

          {onContinueAsGuest && (
            <>
              <div className="flex items-center gap-3 my-1">
                <div className={`flex-1 h-px ${isDark ? "bg-white/10" : "bg-gray-200"}`} />
                <span className={`text-[10px] uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-400"}`}>or</span>
                <div className={`flex-1 h-px ${isDark ? "bg-white/10" : "bg-gray-200"}`} />
              </div>
              <button
                onClick={async () => { setGuestLoading(true); try { await onContinueAsGuest(); } finally { setGuestLoading(false); } }}
                disabled={guestLoading}
                className={`w-full rounded-lg py-2.5 text-sm font-medium transition-all border ${isDark ? "border-white/10 hover:bg-white/5 text-gray-200" : "border-gray-200 hover:bg-gray-50 text-gray-700"} disabled:opacity-60 flex items-center justify-center gap-2`}
              >
                {guestLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Continue as guest
              </button>
            </>
          )}

          <p className={`text-xs text-center pt-1 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
            {mode === "login" ? "New here?" : "Already have an account?"}{" "}
            <button
              className="text-indigo-500 hover:text-indigo-400 font-medium"
              onClick={() => handleModeChange(mode === "login" ? "signup" : "login")}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ children, icon, dark }: { children: React.ReactNode; icon: React.ReactNode; dark?: boolean }) {
  return (
    <label
      className="drawit-field"
      style={{
        background: dark ? "#0f0f10" : "#fafafa",
        borderColor: dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
        color: dark ? "#f3f4f6" : "#111827",
      }}
    >
      {icon}
      <div className="flex-1">{children}</div>
    </label>
  );
}
