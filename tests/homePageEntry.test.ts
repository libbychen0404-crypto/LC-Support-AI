import { afterEach, describe, expect, it, vi } from 'vitest';
import HomePage from '../app/page';

const redirectMock = vi.hoisted(() =>
  vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  })
);

vi.mock('next/navigation', () => ({
  redirect: redirectMock
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('root route on real-users', () => {
  it('redirects / to /real', async () => {
    expect(() => HomePage()).toThrow('REDIRECT:/real');
  });
});
