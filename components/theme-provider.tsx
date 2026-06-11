"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Dark is the product default; "light" stays available as an override. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
