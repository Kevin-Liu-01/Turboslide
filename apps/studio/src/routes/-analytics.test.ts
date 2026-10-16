// The analytics boot script (-analytics.ts): gtag.js loads on the measured pages of the production
// host alone, after the Consent Mode defaults and with the script's nonce, and the opt out flag
// turns measurement off for the rest of the document.
import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import {
  ANALYTICS_BOOT_SCRIPT,
  ANALYTICS_HOSTS,
  GA_DISABLE_KEY,
  GA_MEASUREMENT_ID,
  isMeasuredPath,
  stopAnalytics,
} from './-analytics';

type Appended = { async?: boolean; src?: string; nonce?: string };

/** Runs the boot script in a window with the given address; answers what it appended and queued. */
function boot(href: string): { appended: Appended[]; queued: unknown[][] | undefined } {
  const url = new URL(href);
  const appended: Appended[] = [];
  const sandbox: Record<string, unknown> = {
    location: { hostname: url.hostname, pathname: url.pathname },
    document: {
      currentScript: { nonce: 'n0nce' },
      createElement: () => ({}),
      head: { appendChild: (node: Appended) => appended.push(node) },
    },
  };
  sandbox.window = sandbox;
  runInNewContext(ANALYTICS_BOOT_SCRIPT, sandbox);
  const layer = sandbox.dataLayer as ArrayLike<unknown>[] | undefined;
  return { appended, queued: layer?.map((entry) => Array.from(entry)) };
}

describe('the analytics boot script', () => {
  it('loads gtag.js on a measured page of production after the consent defaults', () => {
    const { appended, queued } = boot('https://www.turboslide.com/home');
    expect(appended).toEqual([
      {
        async: true,
        src: `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`,
        nonce: 'n0nce',
      },
    ]);
    expect(queued?.map((entry) => entry.slice(0, 2))).toEqual([
      ['consent', 'default'],
      ['consent', 'default'],
      ['js', expect.anything()],
      ['config', GA_MEASUREMENT_ID],
    ]);
    const [regional, everywhere] = (queued ?? []).map((entry) => entry[2]) as Record<
      string,
      unknown
    >[];
    expect(regional).toMatchObject({ analytics_storage: 'denied', ad_storage: 'denied' });
    expect(regional?.region).toContain('DE');
    expect(regional?.region).toContain('GB');
    expect(regional?.region).toContain('CH');
    expect(everywhere).toEqual({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'granted',
    });
  });

  it('measures the docs and the apex twin', () => {
    expect(boot('https://www.turboslide.com/docs/agents/mcp').appended).toHaveLength(1);
    expect(boot('https://turboslide.com/faq').appended).toHaveLength(1);
    expect(ANALYTICS_HOSTS).toEqual(['www.turboslide.com', 'turboslide.com']);
  });

  it('loads nothing on the editor, the viewer and the other product routes', () => {
    for (const path of ['/', '/new', '/edit/q4', '/deck/q4', '/decks', '/device', '/signin']) {
      const { appended, queued } = boot(`https://www.turboslide.com${path}`);
      expect(appended, path).toEqual([]);
      expect(queued, path).toBeUndefined();
    }
  });

  it('loads nothing on a preview, a checkout or another host', () => {
    for (const origin of [
      'https://turboslide-abc123-general-translation.vercel.app',
      'http://localhost:4321',
      'https://slides.example.com',
    ]) {
      expect(boot(`${origin}/home`).appended, origin).toEqual([]);
    }
  });
});

describe('the measured paths', () => {
  it('are the product site and the docs', () => {
    for (const path of ['/home', '/about', '/features', '/faq', '/docs', '/docs/editor/slides']) {
      expect(isMeasuredPath(path), path).toBe(true);
    }
    for (const path of ['/', '/homework', '/documents', '/new', '/try', '/present/q4']) {
      expect(isMeasuredPath(path), path).toBe(false);
    }
  });

  it('turn off for the rest of the document through the opt out flag', () => {
    const target: Record<string, unknown> = {};
    stopAnalytics(target);
    expect(target[GA_DISABLE_KEY]).toBe(true);
    expect(GA_DISABLE_KEY).toBe(`ga-disable-${GA_MEASUREMENT_ID}`);
  });
});
