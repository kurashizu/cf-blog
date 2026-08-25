"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "deep-blue" | "deep-green";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
});

// Explicit user picks only. Deliberately NOT the legacy "theme" key: old
// builds wrote the hour-based auto theme there on every change, so treating
// that key as a user preference froze returning visitors on whatever theme
// happened to be active during their last visit (e.g. deep-blue at 3pm).
const STORAGE_KEY = "theme-user";
const LEGACY_STORAGE_KEY = "theme";

function getThemeByHour(): Theme {
  const hour = new Date().getHours();
  if (hour < 8) return "deep-blue";
  if (hour < 14) return "deep-green";
  return "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("deep-green");
  const [mounted, setMounted] = useState(false);
  // null = auto mode (follow the clock); a Theme = the user's explicit pick.
  // Only toggleTheme writes to localStorage, so auto-rotation never turns
  // into a phantom "stored preference".
  const [userTheme, setUserTheme] = useState<Theme | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
      // Purge the legacy auto-written key so it can never be mistaken for
      // a user preference again.
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      /* storage unavailable — stay in auto mode */
    }
    if (stored === "dark" || stored === "deep-blue" || stored === "deep-green") {
      setUserTheme(stored);
      setTheme(stored);
    } else {
      setTheme(getThemeByHour());
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-theme", theme);
    window.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
  }, [theme, mounted]);

  // Auto-rotate by hour only while the user hasn't picked a theme —
  // otherwise the interval would silently revert their choice.
  useEffect(() => {
    if (!mounted || userTheme) return;
    const id = setInterval(() => {
      setTheme(getThemeByHour());
    }, 60_000);
    return () => clearInterval(id);
  }, [mounted, userTheme]);

  const toggleTheme = () => {
    const next: Theme =
      theme === "dark" ? "deep-blue" : theme === "deep-blue" ? "deep-green" : "dark";
    setUserTheme(next);
    setTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — the pick still applies for this session */
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}