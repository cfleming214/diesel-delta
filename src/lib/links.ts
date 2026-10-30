/**
 * Short links printed on share cards. The mock derives a stable code from the card contents; the
 * production service (dd.app redirects to the live Delta) is configured at go-live.
 */
export interface LinkService {
  shortLink(payload: Record<string, string | number>): string;
}

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export const mockLinks: LinkService = {
  shortLink(payload) {
    const text = JSON.stringify(payload);
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
    let code = '';
    for (let i = 0; i < 4; i++, h = Math.floor(h / ALPHABET.length))
      code += ALPHABET[h % ALPHABET.length];
    return `dd.app/d/${code}`;
  },
};

export const links: LinkService = mockLinks;
