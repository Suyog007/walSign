import { describe, expect, it } from 'vitest';
import { toDateTimeLocal } from './dateUtils';
import { parseDeadlineInput } from '../services/workflowService';

describe('toDateTimeLocal', () => {
  it('formats a timestamp for a datetime-local input in local time', () => {
    const ms = new Date(2026, 0, 5, 9, 7).getTime();
    expect(toDateTimeLocal(ms)).toBe('2026-01-05T09:07');
  });

  it('round-trips through the deadline parser', () => {
    const ms = new Date(2030, 6, 1, 18, 30).getTime();
    expect(parseDeadlineInput(toDateTimeLocal(ms), 0)).toEqual({ deadlineMs: ms });
  });
});
