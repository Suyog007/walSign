import { readFile, rename, writeFile } from 'node:fs/promises';
import { EventCursor } from './sui.js';

export interface TrackedDeadline {
  deadlineMs: number;
  /** Set once the "deadline approaching" warning went out for this deadline */
  warned: boolean;
}

export interface NotifierState {
  cursor: EventCursor | null;
  deadlines: Record<string, TrackedDeadline>;
}

export interface StateStore {
  load(): Promise<NotifierState>;
  save(state: NotifierState): Promise<void>;
}

export const emptyState = (): NotifierState => ({ cursor: null, deadlines: {} });

/** JSON file store, written atomically so a crash never leaves a half-written state */
export class FileStateStore implements StateStore {
  constructor(private readonly path: string) {}

  async load(): Promise<NotifierState> {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8'));
      return { cursor: parsed.cursor ?? null, deadlines: parsed.deadlines ?? {} };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyState();
      throw err;
    }
  }

  async save(state: NotifierState): Promise<void> {
    const tmp = `${this.path}.tmp`;
    await writeFile(tmp, JSON.stringify(state, null, 2));
    await rename(tmp, this.path);
  }
}
