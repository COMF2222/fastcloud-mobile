export function artworkCandidates(raw: string, pixels = 200): string[] {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !/^i[1-4]\.sndcdn\.com$/.test(url.hostname) || url.username || url.password) return [raw];
    const variants = pixels > 500 ? ["original", "t1080x1080", "t500x500"] : pixels > 200 ? ["t500x500", "t200x200"] : ["t200x200"];
    return [...new Set([...variants.map(variant => {
      const candidate = new URL(url);
      candidate.pathname = candidate.pathname.replace(/-(?:original|large|small|crop|t\d+x\d+)(\.[^/.]+)$/i, `-${variant}$1`);
      return candidate.href;
    }), raw])];
  } catch { return [raw]; }
}
