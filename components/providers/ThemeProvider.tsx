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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("deep-green");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === "dark" || stored === "deep-blue" || stored === "deep-green") {
      setTheme(stored);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem(STORAGE_KEY, theme);
      window.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
    }
  }, [theme, mounted]);

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