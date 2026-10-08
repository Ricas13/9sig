import type {MetadataRoute} from "next";
import {absolutePublicUrl,privateRoutePrefixes,publicIndexingEnabled} from "@/lib/public-seo";
export default function robots():MetadataRoute.Robots{
  if(!publicIndexingEnabled(process.env))return {rules:{userAgent:"*",disallow:"/"}};
  return {rules:{userAgent:"*",allow:"/",disallow:[...privateRoutePrefixes]},sitemap:absolutePublicUrl("/",process.env.NEXT_PUBLIC_APP_URL)+"sitemap.xml"};
}
