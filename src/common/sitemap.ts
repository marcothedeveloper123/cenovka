export function parseSitemapUrls(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const url = m[1]!.trim();
    if (url) out.push(url);
  }
  return out;
}
