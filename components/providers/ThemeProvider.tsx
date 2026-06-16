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

const STORAGE_KEY = "theme";

function getThemeByHour(): Theme {
  const hour = new Date().getHours();
  if (hour < 8) return "deep-blue";
  if (hour < 14) return "deep-green";
  return "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("deep-green");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === "dark" || stored === "deep-blue" || stored === "deep-green") {
      setTheme(stored);
    }
    setTheme(getThemeByHour());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
    window.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
  }, [theme, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const id = setInterval(() => {
      setTheme(getThemeByHour());
    }, 60_000);
    return () => clearInterval(id);
  }, [mounted]);

  const toggleTheme = () => {
    setTheme((prev) => {
      if (prev === "dark") return "deep-blue";
      if (prev === "deep-blue") return "deep-green";
      return "dark";
    });
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