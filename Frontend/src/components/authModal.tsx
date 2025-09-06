import { useState } from "react";
import api from "../lib/api";

interface AuthModalProps {
  onLogin: (username: string) => void;
}

export default function AuthModal({ onLogin }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
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
        // Sign up
        const response = await api.post("/signup", {
          name: name.trim(),
          username: username.trim(),
          password: password
        });
        
        if (response.data.token && response.data.user) {
          // Auto-login after successful signup
          localStorage.setItem("authToken", response.data.token);
          localStorage.setItem("user", JSON.stringify(response.data.user));
          onLogin(response.data.user.username);
        }
      } else {
        // Login
        await handleLogin();
      }
    } catch (err: unknown) {
      const errorMessage = err && typeof err === 'object' && 'response' in err && 
        err.response && typeof err.response === 'object' && 'data' in err.response && 
        err.response.data && typeof err.response.data === 'object' && 'error' in err.response.data
        ? String(err.response.data.error)
        : "An error occurred. Please try again.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    const response = await api.post("/signin", {
      username: username.trim(),
      password: password
    });
    
    if (response.data.token) {
      // Store token in localStorage for persistence
      localStorage.setItem("authToken", response.data.token);
      localStorage.setItem("user", JSON.stringify(response.data.user));
      onLogin(response.data.user.username);
    }
  };

  const clearForm = () => {
    setUsername("");
    setPassword("");
    setName("");
    setError("");
  };

  const handleModeChange = (newMode: "login" | "signup") => {
    setMode(newMode);
    clearForm();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl border border-gray-200/20 shadow-2xl p-8 w-96 max-w-[90vw]">
        <div className="flex items-center gap-2 mb-8">
          <button
            className={`px-6 py-3 rounded-xl transition-all duration-200 font-medium ${
              mode === "login" 
                ? "bg-black text-white shadow-lg" 
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            onClick={() => handleModeChange("login")}
          >
            Login
          </button>
          <button
            className={`px-6 py-3 rounded-xl transition-all duration-200 font-medium ${
              mode === "signup" 
                ? "bg-black text-white shadow-lg" 
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            onClick={() => handleModeChange("signup")}
          >
            Sign Up
          </button>
          <div className="ml-auto text-sm text-gray-500 font-medium">Welcome</div>
        </div>

        <div className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Full Name</label>
              <input
                type="text"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-black/20 focus:border-black transition-all duration-200"
              />
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Username</label>
            <input
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-black/20 focus:border-black transition-all duration-200"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-black/20 focus:border-black transition-all duration-200"
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center bg-red-50 p-3 rounded-lg">
              {error}
            </div>
          )}
          
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full rounded-xl bg-black text-white py-3 font-semibold shadow-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Processing..." : (mode === "login" ? "Login" : "Create account")}
          </button>

          <p className="text-sm text-gray-500 text-center">
            {mode === "login" ? (
              <>
                Don't have an account?{" "}
                <button
                  className="text-black underline font-medium hover:text-gray-700"
                  onClick={() => handleModeChange("signup")}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  className="text-black underline font-medium hover:text-gray-700"
                  onClick={() => handleModeChange("login")}
                >
                  Login
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
