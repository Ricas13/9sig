import type { Metadata } from "next";
import "./globals.css";

export const metadata:Metadata={title:"9Sig Journey",description:"A simple 3QQQ 9Sig journey tracker."};

export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}