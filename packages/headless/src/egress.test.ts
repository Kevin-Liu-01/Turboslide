// The network rule of a render page (gslides-parity SPEC-3 0.30, 8.6): local schemes, loopback
// names and allowlisted hosts pass; every other request is aborted, so a slide's markup cannot
// reach the network from a render, a thumbnail or an export. The route itself is Playwright's;
// this pins the decision function and the switch.
import { describe, expect, test } from 'vitest';

import { defaultEgress, egressAllowed } from './context.ts';

describe('egressAllowed', () => {
  test('lets the document and its own resources through and aborts the network', () => {
    for (const url of [
      'file:///tmp/turboslide/render/s1.html',
      'data:image/png;base64,AAAA',
      'blob:null/abc',
      'about:blank',
      'http://localhost:4333/edit/x',
      'http://127.0.0.1:4321/api/render/s1',
      'http://[::1]:4321/x',
    ])
      expect(egressAllowed(url), url).toBe(true);
    for (const url of [
      'https://attacker.example/beacon?deck=q4',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.1/x',
      'https://fonts.googleapis.com/css',
      'ftp://x.example/a',
      'not a url',
    ])
      expect(egressAllowed(url), url).toBe(false);
    expect(
      egressAllowed('https://cdn.generaltranslation.com/a.png', ['generaltranslation.com']),
    ).toBe(true);
    expect(
      egressAllowed('https://generaltranslation.com.evil.example/a', ['generaltranslation.com']),
    ).toBe(false);
  });

  test('the rule is deny unless TURBOSLIDE_EGRESS=open', () => {
    expect(defaultEgress({})).toBe('deny');
    expect(defaultEgress({ TURBOSLIDE_EGRESS: 'open' })).toBe('open');
    expect(defaultEgress({ TURBOSLIDE_EGRESS: 'yes' })).toBe('deny');
  });
});
