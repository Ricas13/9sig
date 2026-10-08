import type {MetadataRoute} from "next";
import {absolutePublicUrl,publicIndexingEnabled,publicSeoRoutes} from "@/lib/public-seo";
export default function sitemap():MetadataRoute.Sitemap{
  if(!publicIndexingEnabled(process.env))return [];
  return publicSeoRoutes.map(path=>({url:absolutePublicUrl(path,process.env.NEXT_PUBLIC_APP_URL),
    changeFrequency:path==="/"?"weekly":"monthly",priority:path==="/"?1:0.65}));
}
