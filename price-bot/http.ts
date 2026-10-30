// PoliteHttp: the bot's only network path. It enforces the collection rules in
// PRICE_BOT_PLAN.md §2 so adapters cannot skip them: an honest User-Agent, robots.txt, a minimum
// interval per host, backoff on 429/5xx, the per-source kill switch, and raw-response capture.
// It never retries around a block: a 401/403 or a challenge page stops the source.

export type RawStore = {
  /** Saves a raw response and returns its key. */
  put(key: string, body: string): Promise<string>;
};

export class BlockedError extends Error {
  constructor(
    readonly sourceId: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class DisabledError extends Error {}
export class DisallowedError extends Error {}

export type PoliteHttpOptions = {
  userAgent: string;
  /** Re-read before every request; false stops the source (the kill switch). */
  isEnabled: (sourceId: string) => boolean | Promise<boolean>;
  raw?: RawStore;
  maxAttempts?: number;
  timeoutMs?: number;
  /** Base delay for exponential backoff; jitter is added. */
  backoffMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export type PoliteRequest = {
  sourceId: string;
  /** Rate-limit key, usually the hostname. */
  host: string;
  /** Minimum time between requests to this host. */
  minIntervalMs: number;
  url: string;
  headers?: Record<string, string>;
  /** Where robots.txt lives for this host. */
  robotsUrl: string;
  /** Key for the raw response, e.g. `<run>/<task>`. */
  rawKey?: string;
};

export type PoliteResponse = { status: number; body: string; rawRef: string | null };

type Rules = { allow: string[]; disallow: string[] };

/**
 * Rules for our agent from a robots.txt: the group naming our product token, else `*`.
 * Supports Allow/Disallow with prefix matching, `*` wildcards and `$` anchors.
 */
export function parseRobots(text: string, agentToken: string): Rules {
  const groups: { agents: string[]; rules: Rules }[] = [];
  let current: { agents: string[]; rules: Rules } | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const field = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: { allow: [], disallow: [] } };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === 'disallow' && value) current.rules.disallow.push(value);
    if (field === 'allow' && value) current.rules.allow.push(value);
  }
  const token = agentToken.toLowerCase();
  const own = groups.find((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  return (own ?? groups.find((g) => g.agents.includes('*')))?.rules ?? { allow: [], disallow: [] };
}

function ruleMatches(rule: string, path: string): boolean {
  const anchored = rule.endsWith('$');
  const body = (anchored ? rule.slice(0, -1) : rule)
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path);
}

/** Longest matching rule wins; Allow wins a tie. */
export function robotsAllows(rules: Rules, pathAndQuery: string): boolean {
  let best = -1;
  let allowed = true;
  for (const r of rules.disallow) {
    if (ruleMatches(r, pathAndQuery) && r.length > best) {
      best = r.length;
      allowed = false;
    }
  }
  for (const r of rules.allow) {
    if (ruleMatches(r, pathAndQuery) && r.length >= best) {
      best = r.length;
      allowed = true;
    }
  }
  return allowed;
}

/** Pages that are bot challenges rather than content (CAPTCHA, JS checks). */
const CHALLENGE = /captcha|verify you are (a )?human|are you a robot|access denied|bot detection/i;

export function createPoliteHttp(opts: PoliteHttpOptions) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const maxAttempts = opts.maxAttempts ?? 3;
  const backoffMs = opts.backoffMs ?? 2000;
  const robots = new Map<string, Promise<Rules>>();
  /** Earliest time the next request to each host may start. */
  const nextSlot = new Map<string, number>();
  const counts = { requests: 0, retries: 0, robotsBlocked: 0 };

  async function rawFetch(url: string, headers: Record<string, string> = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
    try {
      counts.requests++;
      const res = await fetchImpl(url, {
        headers: { 'user-agent': opts.userAgent, ...headers },
        signal: ctrl.signal,
      });
      return {
        status: res.status,
        body: await res.text(),
        retryAfter: res.headers.get('retry-after'),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Reserves the next slot for a host, so concurrent callers queue instead of bursting. */
  async function waitForSlot(host: string, minIntervalMs: number) {
    const t = now();
    const at = Math.max(t, nextSlot.get(host) ?? 0);
    nextSlot.set(host, at + minIntervalMs);
    if (at > t) await sleep(at - t);
  }

  function rulesFor(robotsUrl: string): Promise<Rules> {
    let p = robots.get(robotsUrl);
    if (!p) {
      p = rawFetch(robotsUrl).then(
        (r) => {
          // A missing robots.txt allows everything; an error response or a block disallows all.
          if (r.status >= 400 && r.status < 500 && r.status !== 401 && r.status !== 403) {
            return { allow: [], disallow: [] };
          }
          if (r.status !== 200) return { allow: [], disallow: ['/'] };
          return parseRobots(r.body, opts.userAgent.split('/')[0]!);
        },
        () => ({ allow: [], disallow: ['/'] }),
      );
      robots.set(robotsUrl, p);
    }
    return p;
  }

  async function get(req: PoliteRequest): Promise<PoliteResponse> {
    const url = new URL(req.url);
    if (!robotsAllows(await rulesFor(req.robotsUrl), url.pathname + url.search)) {
      counts.robotsBlocked++;
      throw new DisallowedError(`robots.txt disallows ${url.pathname}`);
    }
    for (let attempt = 1; ; attempt++) {
      if (!(await opts.isEnabled(req.sourceId))) {
        throw new DisabledError(`source ${req.sourceId} is disabled`);
      }
      await waitForSlot(req.host, req.minIntervalMs);
      let res: Awaited<ReturnType<typeof rawFetch>> | null = null;
      let error: unknown = null;
      try {
        res = await rawFetch(req.url, req.headers);
      } catch (e) {
        error = e;
      }
      if (
        res &&
        (res.status === 401 || res.status === 403 || CHALLENGE.test(res.body.slice(0, 2000)))
      ) {
        throw new BlockedError(
          req.sourceId,
          res.status,
          `blocked by ${req.host} (HTTP ${res.status})`,
        );
      }
      const retryable = !res || res.status === 429 || res.status >= 500;
      if (!retryable) {
        const rawRef = opts.raw && req.rawKey ? await opts.raw.put(req.rawKey, res!.body) : null;
        return { status: res!.status, body: res!.body, rawRef };
      }
      if (attempt >= maxAttempts) {
        throw new Error(
          res ? `HTTP ${res.status} from ${req.host} after ${attempt} attempts` : String(error),
        );
      }
      counts.retries++;
      const retryAfter = Number(res?.retryAfter);
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : backoffMs * 2 ** (attempt - 1) * (1 + Math.random() * 0.5);
      // Push the host's next slot back too, so other workers also back off.
      nextSlot.set(req.host, Math.max(nextSlot.get(req.host) ?? 0, now() + wait));
      await sleep(wait);
    }
  }

  return { get, counts };
}

export type PoliteHttp = ReturnType<typeof createPoliteHttp>;
