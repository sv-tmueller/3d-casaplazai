// @vitest-environment happy-dom
/**
 * The dev-only kit showcase (dev/kit.html, issue #178) mounts every kit
 * component without throwing and names each of its controls.
 */
import { describe, expect, it } from 'vitest';
import { mountShowcase } from '../../src/ui/showcase';

describe('kit showcase', () => {
  it('renders every section and names every button', () => {
    document.body.innerHTML = '<main id="host"></main>';
    const host = document.getElementById('host')!;
    mountShowcase(host);
    expect(host.querySelectorAll('.kit-section').length).toBeGreaterThanOrEqual(8);
    for (const btn of host.querySelectorAll('button')) {
      const name = btn.getAttribute('aria-label') ?? btn.textContent ?? '';
      expect(name.trim().length, btn.outerHTML).toBeGreaterThan(0);
    }
  });
});
