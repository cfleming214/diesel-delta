// Raw responses, kept 90 days so a disputed price can be traced to what the source returned.
// Local disk for development; production swaps in object storage behind the same RawStore.
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { RawStore } from './http';

export const RAW_RETENTION_DAYS = 90;

export function fileRawStore(root: string): RawStore & { purge(now?: Date): Promise<number> } {
  return {
    async put(key, body) {
      const path = join(root, `${key.replace(/[^a-zA-Z0-9/_-]/g, '_')}.txt`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
      return path;
    },
    /** Deletes run folders older than the retention window. Returns how many were removed. */
    async purge(now = new Date()) {
      const cutoff = now.getTime() - RAW_RETENTION_DAYS * 86_400_000;
      let removed = 0;
      for (const name of await readdir(root).catch(() => [] as string[])) {
        const path = join(root, name);
        if ((await stat(path)).mtimeMs < cutoff) {
          await rm(path, { recursive: true, force: true });
          removed++;
        }
      }
      return removed;
    },
  };
}

export function memoryRawStore(): RawStore & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    async put(key, body) {
      entries.set(key, body);
      return `memory:${key}`;
    },
  };
}
