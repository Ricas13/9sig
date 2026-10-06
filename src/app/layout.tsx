import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "StrategyOS", template: "%s · StrategyOS" },
  description: "Operate rules-based investment strategies with transparent calculations, action queues and reconciliation."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
