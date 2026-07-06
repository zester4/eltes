"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes/dist/types";
import type { ReactNode } from "react";

export function ThemeProvider({
  children,
  ...props
}: ThemeProviderProps & { children?: ReactNode }) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
