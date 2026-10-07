import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "StrategyOS", template: "%s · StrategyOS" },
  description: "Operate rules-based investment strategies with transparent calculations, action queues and reconciliation."
};

const themeScript = `
(() => {
  try {
    const saved = localStorage.getItem("strategyos-theme");
    const theme = saved === "light" || saved === "dark"
      ? saved
      : (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.style.colorScheme = "dark";
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{__html:themeScript}}/></head>
    <body>{children}</body>
  </html>;
}
