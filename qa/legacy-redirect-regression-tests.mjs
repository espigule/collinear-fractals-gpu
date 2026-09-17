#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { decodeExplorerLocation } from '../src/state/legacy_state.mjs';

const html = readFileSync(new URL('../tools/legacy_redirect.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
assert.equal(scripts.length, 1, 'The standalone redirect should contain one self-contained script.');
const redirectScript = scripts[0][1];
const currentBase = 'https://complextrees.com/collinear-fractals-gpu/';
const archiveBase = 'https://complextrees.com/collinear/legacy-2026-09/';

function runRedirect(search = '', hash = '', rejectNavigation = false) {
  const links = {
    'explorer-destination': { href: currentBase },
    'archive-destination': { href: archiveBase }
  };
  const replacements = [];
  vm.runInNewContext(redirectScript, {
    URLSearchParams,
    window: {
      location: {
        search, hash,
        replace(destination) {
          replacements.push(destination);
          if (rejectNavigation) throw new Error('Navigation blocked in this environment');
        }
      }
    },
    document: {
      getElementById(id) {
        assert.ok(Object.hasOwn(links, id), `Unexpected DOM access: ${id}`);
        return links[id];
      }
    }
  }, { timeout: 1000, filename: 'legacy_redirect.html' });
  assert.equal(replacements.length, 1, 'Use one history-replacing navigation.');
  return { destination: replacements[0], currentLink: links['explorer-destination'].href, archiveLink: links['archive-destination'].href };
}

test('empty and tracking-only short links reach the fresh current explorer without forced migration', () => {
  assert.deepEqual(runRedirect(), { destination: currentBase, currentLink: currentBase, archiveLink: archiveBase });
  for (const search of ['?utm_source=newsletter', '?utm_campaign=n%3D4&ref=a+b&encoded=%2f%20%2F', '?not_n=4&cRe=1&cIm=2']) {
    const result = runRedirect(search, '#introduction');
    assert.equal(result.destination, currentBase + search + '#introduction');
    assert.equal(result.archiveLink, archiveBase + search + '#introduction');
    const target = new URL(result.destination);
    assert.equal(decodeExplorerLocation({ search: target.search, hash: target.hash }).source, 'default');
  }
});

test('old query and hash state preserve original bytes and receive the migration marker', () => {
  const search = '?utm_source=a+b&escaped=%2f%2F%20&n=5&n=6';
  const hash = '#cx=1.500000&cy=1.658312&panels=0011&centerX=-0.000000&centerY=1.2e-10';
  const result = runRedirect(search, hash);
  assert.equal(result.destination, currentBase + search + '&legacy=1' + hash);
  assert.equal(result.currentLink, result.destination);
  assert.equal(result.archiveLink, archiveBase + search + hash);
  assert.equal(runRedirect('', '#n=4&cx=0&cy=2').destination, currentBase + '?legacy=1#n=4&cx=0&cy=2');
  assert.equal(runRedirect('?n=5&cx=1&cy=2').destination, currentBase + '?n=5&cx=1&cy=2&legacy=1');
});

test('explicit legacy key detection includes archived aliases without guessing coordinate names', () => {
  for (const key of ['n', 'cx', 'cy', 'panels', 'zoom', 'centerX', 'centerY', 'queue', 'mmin1', 'mmax2', 'thicknessRE', 'thicknessME', 'useTrapOnly', 'realBandEnabled', 'heightRE', 'heightME', 'depth', 'skipRE', 'skipME', 'useRectTrap']) {
    for (const [search, hash] of [[`?${key}=1`, ''], ['', `#${key}=1`]]) {
      assert.equal(new URL(runRedirect(search, hash).destination).searchParams.get('legacy'), '1', key);
    }
  }
  assert.equal(runRedirect('', '#%6e=5').destination, currentBase + '?legacy=1#%6e=5');
  assert.equal(runRedirect('', '#note=n%3D4&not_n=5').destination, currentBase + '#note=n%3D4&not_n=5');
});

test('existing markers are preserved or overridden through one additive marker', () => {
  for (const search of ['?legacy=1&x=%2f', '?legacy=%31&x=%2f']) {
    assert.equal(runRedirect(search, '#n=5').destination, currentBase + search + '#n=5');
  }
  const conflict = runRedirect('?legacy=0&x=a+b', '#n=5');
  assert.equal(conflict.destination, currentBase + '?legacy=1&legacy=0&x=a+b#n=5');
  assert.equal(new URL(conflict.destination).searchParams.get('legacy'), '1');
});

test('modern hash keys remain authoritative even when the short-route redirect recognizes shared core keys', () => {
  const result = runRedirect('?utm_source=old-link', '#n=5&cx=1&cy=2&pm=rn&k=0&focus=dynamical');
  const target = new URL(result.destination);
  const imported = decodeExplorerLocation({ search: target.search, hash: target.hash });
  assert.equal(imported.importedLegacy, false);
  assert.equal(imported.state.n, 5);
  assert.equal(imported.state.cx, 1);
  assert.equal(imported.state.cy, 2);
  assert.equal(imported.state.parameterMode, 'rn');
  assert.equal(imported.state.kMax, 0);
  assert.equal(imported.state.focusedPanel, 'dynamical');
});

test('untrusted query destinations cannot turn the fixed redirect into an open redirect', () => {
  const search = '?next=https%3A%2F%2Fevil.example%2F&redirect_uri=%2F%2Fevil.example&n=4';
  const hash = '#cx=0&cy=2&panels=0100&note=%3Cscript%3E';
  const result = runRedirect(search, hash);
  const target = new URL(result.destination);
  assert.equal(target.origin, 'https://complextrees.com');
  assert.equal(target.pathname, '/collinear-fractals-gpu/');
  assert.equal(target.hash, hash);
  assert.equal(result.archiveLink, archiveBase + search + hash);
  assert.equal({}.polluted, undefined);
});

test('blocked automatic navigation retains working exact-state links and a self-contained fallback document', () => {
  const result = runRedirect('?n=4', '#cx=0&cy=2&panels=0100', true);
  assert.equal(result.currentLink, result.destination);
  assert.equal(result.archiveLink, archiveBase + '?n=4#cx=0&cy=2&panels=0100');
  assert.match(html, /<link rel="canonical" href="https:\/\/complextrees\.com\/collinear-fractals-gpu\/">/);
  assert.match(html, /<noscript>/);
  assert.doesNotMatch(html, /<script[^>]+src\s*=|<link[^>]+rel\s*=\s*["']stylesheet|<img\b|<iframe\b/i);
  assert.doesNotMatch(html, /http-equiv\s*=\s*["']refresh/i, 'A meta refresh would discard query/hash state.');
});
