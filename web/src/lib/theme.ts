import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const KEY = "vantage-theme";

function initial(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* private mode or blocked storage */
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Theme follows the OS by default, and the explicit choice once one is made. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initial);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}
