import * as cheerio from "cheerio";

import { slug } from "./spell-page-parser.js";


const d20Origin = "https://www.d20pfsrd.com";


function spellUrl(name: string): string {
  const spellSlug = slug(name);
  return `${d20Origin}/magic/all-spells/${spellSlug[0]}/${spellSlug}/`;
}


export function d20CandidateUrls(name: string): string[] {
  const names = [name];
  const commaBase = name.split(",", 1)[0]?.trim();
  if (commaBase && commaBase !== name) names.push(commaBase);
  const numberedBase = name.replace(/\s+(?:[IVX]+|\d+)$/i, "").trim();
  if (numberedBase && numberedBase !== name) names.push(numberedBase);
  return [...new Set(names.map(spellUrl))];
}


export function d20SearchUrl(name: string): string {
  return `${d20Origin}/?s=${encodeURIComponent(name)}`;
}


export function d20SearchResultUrls(html: string, sourceUrl: string): string[] {
  const $ = cheerio.load(html);
  const urls: string[] = [];
  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    let resolved: URL;
    try {
      resolved = new URL(href, sourceUrl);
    } catch {
      return;
    }
    if (resolved.origin !== d20Origin || !/^\/magic\/all-spells\/[a-z0-9]\/[a-z0-9-]+\/?$/i.test(resolved.pathname)) return;
    resolved.search = "";
    resolved.hash = "";
    if (!resolved.pathname.endsWith("/")) resolved.pathname += "/";
    urls.push(resolved.toString());
  });
  return [...new Set(urls)];
}
