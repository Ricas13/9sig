import type { Metadata } from "next";
import {siteOrigin,publicIndexingEnabled} from "@/lib/public-seo";
import "./globals.css";

// SEO indexing is an operational release gate. Resolve runtime environment on Oracle Docker.
export const dynamic="force-dynamic";

const brand=process.env.NEXT_PUBLIC_BRAND_NAME?.trim()||"Rebalune";
const origin=siteOrigin(process.env.NEXT_PUBLIC_APP_URL);
export const metadata: Metadata = {
  metadataBase:origin,
  applicationName:brand,
  title:{default:brand+" | Rules-Based Portfolio Tracker",template:"%s | "+brand},
  description:"Track self-selected investment strategies, portfolio prices, scheduled reviews, and rules-based rebalancing. Transparent calculations and user-confirmed trades.",
  alternates:{canonical:"/"},
  openGraph:{type:"website",locale:"en_GB",siteName:brand,url:"/",title:brand+" | Rules-Based Portfolio Tracker",
    description:"Track portfolio strategies, scheduled reviews and transparent rebalance calculations."},
  twitter:{card:"summary",title:brand+" | Rules-Based Portfolio Tracker",description:"Keep track of your investment strategies and review dates."},
  robots:publicIndexingEnabled(process.env)?{index:true,follow:true}:{index:false,follow:false,noarchive:true},
  verification:process.env.GOOGLE_SITE_VERIFICATION?{google:process.env.GOOGLE_SITE_VERIFICATION}:undefined,
  category:"finance"
};

const themeScript = `
(() => {
  try {
    const saved = (localStorage.getItem("rebalune-theme") ?? localStorage.getItem("strategyos-theme"));
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
