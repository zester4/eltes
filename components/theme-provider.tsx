"use client";

import type { ReactNode } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes/dist/types";

export function ThemeProvider({ children, ...props }: ThemeProviderProps & { children?: ReactNode }) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
