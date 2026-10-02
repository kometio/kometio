export interface ParsedVideoEmbed {
  provider: 'youtube' | 'vimeo';
  embedUrl: string;
}

// Recognizes YouTube/Vimeo URLs only (the block's own scope, per the plan
// doc: "solo embed link YouTube/Vimeo, niente encoding/hosting video lato
// nostro") and normalizes every recognized form into that provider's own
// embed URL — youtube-nocookie.com specifically, YouTube's own
// privacy-enhanced domain that defers third-party cookies until playback
// starts (no equivalent domain exists for Vimeo).
export function parseVideoEmbedUrl(url: string): ParsedVideoEmbed | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^(www|m)\./, '');

  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id = parsed.pathname.startsWith('/embed/')
      ? parsed.pathname.slice('/embed/'.length)
      : parsed.searchParams.get('v');
    if (!id) return null;
    return {
      provider: 'youtube',
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
    };
  }

  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1);
    if (!id) return null;
    return {
      provider: 'youtube',
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
    };
  }

  if (host === 'vimeo.com') {
    const id = parsed.pathname.split('/').find((segment) => segment !== '');
    if (!id || !/^\d+$/.test(id)) return null;
    return {
      provider: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${id}`,
    };
  }

  if (host === 'player.vimeo.com') {
    const match = /^\/video\/(\d+)/.exec(parsed.pathname);
    if (!match) return null;
    return {
      provider: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${match[1]}`,
    };
  }

  return null;
}
