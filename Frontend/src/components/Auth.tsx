import React, { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Lock, User, Eye, EyeOff, Github, Chrome } from "lucide-react";

// Glassmorphism Auth Forms — Sign In / Sign Up
// - TailwindCSS for styling (no import needed in this environment)
// - Framer Motion for smooth transitions
// - Lucide icons for crisp UI
// Drop this component into your app and it should render full-screen.
// Hook up the onSubmit handlers to your backend as needed.

export default function GlassAuth() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Basic form state (demo only)
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
    remember: true,
    terms: false,
  });

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Please enter a valid email.";
    if (form.password.length < 6) return "Password must be at least 6 characters.";
    if (mode === "signup") {
      if (form.name.trim().length < 2) return "Please enter your full name.";
      if (form.password !== form.confirm) return "Passwords do not match.";
      if (!form.terms) return "You must accept the Terms to continue.";
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const error = validate();
    if (error) {
      alert(error);
      return;
    }
    setLoading(true);
    try {
      // Simulate request — replace with your API call
      await new Promise((r) => setTimeout(r, 900));
      alert(`${mode === "signin" ? "Signed in" : "Account created"} for ${form.email}!`);
    } finally {
      setLoading(false);
    }
  }

  const isSignIn = mode === "signin";

  return (
    <div className="min-h-screen w-full relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-indigo-700 via-fuchsia-600 to-cyan-500 animate-gradient" />
      <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-black/10 blur-3xl" />

      {/* Centered container */}
      <div className="flex items-center justify-center px-4 py-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          {/* Glass card */}
          <div className="relative rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl p-6 sm:p-8 text-white">
            {/* Header / Tabs */}
            <div className="mb-8 flex items-center gap-2">
              <button
                className={`px-4 py-2 rounded-xl transition border ${
                  isSignIn
                    ? "bg-white/20 border-white/30 shadow-md"
                    : "bg-white/5 border-transparent hover:bg-white/10"
                }`}
                onClick={() => setMode("signin")}
                aria-pressed={isSignIn}
              >
                Sign In
              </button>
              <button
                className={`px-4 py-2 rounded-xl transition border ${
                  !isSignIn
                    ? "bg-white/20 border-white/30 shadow-md"
                    : "bg-white/5 border-transparent hover:bg-white/10"
                }`}
                onClick={() => setMode("signup")}
                aria-pressed={!isSignIn}
              >
                Sign Up
              </button>
              <div className="ml-auto text-sm text-white/70">Glass Auth</div>
            </div>

            {/* Form */}
            <form onSubmit={onSubmit} className="space-y-5">
              {!isSignIn && (
                <Field label="Full name" htmlFor="name">
                  <div className="relative">
                    <input
                      id="name"
                      type="text"
                      placeholder="Jane Doe"
                      className="input-glass pr-10"
                      value={form.name}
                      onChange={(e) => updateField("name", e.target.value)}
                      required
                    />
                    <User className="icon-input" />
                  </div>
                </Field>
              )}

              <Field label="Email" htmlFor="email">
                <div className="relative">
                  <input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    className="input-glass pr-10"
                    value={form.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    required
                  />
                  <Mail className="icon-input" />
                </div>
              </Field>

              <Field label="Password" htmlFor="password">
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={isSignIn ? "Your password" : "Create a strong password"}
                    className="input-glass pr-12"
                    value={form.password}
                    onChange={(e) => updateField("password", e.target.value)}
                    required
                    minLength={6}
                  />
                  <Lock className="icon-input" />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-white/70 hover:text-white"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>

              {!isSignIn && (
                <Field label="Confirm password" htmlFor="confirm">
                  <div className="relative">
                    <input
                      id="confirm"
                      type={showPassword ? "text" : "password"}
                      placeholder="Re-enter password"
                      className="input-glass pr-10"
                      value={form.confirm}
                      onChange={(e) => updateField("confirm", e.target.value)}
                      required
                      minLength={6}
                    />
                    <Lock className="icon-input" />
                  </div>
                </Field>
              )}

              {/* Row: remember/terms + forgot */}
              <div className="flex items-center justify-between">
                {isSignIn ? (
                  <label className="flex items-center gap-2 text-sm text-white/80">
                    <input
                      type="checkbox"
                      checked={form.remember}
                      onChange={(e) => updateField("remember", e.target.checked)}
                      className="checkbox-glass"
                    />
                    Remember me
                  </label>
                ) : (
                  <label className="flex items-center gap-2 text-sm text-white/80">
                    <input
                      type="checkbox"
                      checked={form.terms}
                      onChange={(e) => updateField("terms", e.target.checked)}
                      className="checkbox-glass"
                      required
                    />
                    I accept the <a href="#" className="underline decoration-white/50 hover:decoration-white">Terms</a>
                  </label>
                )}

                {isSignIn && (
                  <a href="#" className="text-sm text-white/80 hover:text-white underline underline-offset-4">
                    Forgot password?
                  </a>
                )}
              </div>

              <motion.button
                type="submit"
                whileTap={{ scale: 0.98 }}
                disabled={loading}
                className="w-full rounded-xl bg-white/20 border border-white/30 backdrop-blur-md py-3 font-medium shadow-lg hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/40 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (isSignIn ? "Signing in…" : "Creating account…") : isSignIn ? "Sign In" : "Create Account"}
              </motion.button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-white/20" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-transparent px-2 text-white/70 backdrop-blur-sm">Or continue with</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <OAuthButton onClick={() => alert("Continue with Google (stub)")}> 
                  <Chrome size={18} /> Google
                </OAuthButton>
                <OAuthButton onClick={() => alert("Continue with GitHub (stub)")}> 
                  <Github size={18} /> GitHub
                </OAuthButton>
              </div>

              <p className="text-center text-sm text-white/80">
                {isSignIn ? (
                  <>
                    Don’t have an account?{" "}
                    <button type="button" className="underline decoration-white/50 hover:decoration-white" onClick={() => setMode("signup")}>
                      Create one
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button type="button" className="underline decoration-white/50 hover:decoration-white" onClick={() => setMode("signin")}>
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </form>
          </div>

          {/* Footer note */}
          <p className="mt-6 text-center text-white/80 text-xs">
            Tip: Glassmorphism uses transparency + blur. Tweak the <code>bg-white/10</code> & <code>backdrop-blur</code> utilities to match your theme.
          </p>
        </motion.div>
      </div>

      {/* Local styles for animation & inputs */}
      <style>{`
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradientMove 12s ease infinite;
        }
        @keyframes gradientMove {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .input-glass {
          @apply w-full rounded-xl border border-white/20 bg-white/10 backdrop-blur-md px-4 py-3 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/40 shadow-inner;
        }
        .icon-input { 
          position: absolute; 
          right: 0.75rem; 
          top: 50%; 
          transform: translateY(-50%); 
          opacity: 0.8; 
        }
        .checkbox-glass { 
          @apply h-4 w-4 rounded-md border border-white/30 bg-white/10 backdrop-blur-sm checked:bg-white/70 checked:border-white/70 focus:ring-2 focus:ring-white/40;
        }
      `}</style>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="text-sm font-medium text-white/90">
        {label}
      </label>
      {children}
    </div>
  );
}

function OAuthButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md py-2.5 text-sm font-medium shadow hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/30"
    >
      {children}
    </button>
  );
}
