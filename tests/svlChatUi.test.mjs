import assert from 'node:assert/strict';
import test from 'node:test';
import { SVL_UI_TYPES, splitSvlUiContent, validateSvlUiDocument } from '../src/components/SvlChatUi.tsx';

test('all supported interactive component types are unique', () => {
  assert.ok(SVL_UI_TYPES.length >= 26);
  assert.equal(new Set(SVL_UI_TYPES).size, SVL_UI_TYPES.length);
});

test('valid widgets parse inside text', () => {
  const fence = String.fromCharCode(96).repeat(3);
  const src = 'Before\n' + fence + 'svl-ui\n{"title":"Panel","components":[{"type":"lightsaber"},{"type":"button","action":"Sprawdź stan"}]}\n' + fence + '\nAfter';
  const parts = splitSvlUiContent(src);
  assert.equal(parts.length, 3);
  assert.equal(parts[0].kind, 'text');
  assert.equal(parts[1].kind, 'ui');
  assert.equal(parts[2].kind, 'text');
});

test('rejects unknown components and excessive document size', () => {
  assert.equal(validateSvlUiDocument({ components: [{ type: 'script' }] }), null);
  assert.equal(validateSvlUiDocument({ components: [] }), null);
  assert.equal(validateSvlUiDocument({ components: Array.from({ length: 41 }, () => ({ type: 'text' })) }), null);
});

test('unsafe links cannot be rendered', () => {
  const doc = validateSvlUiDocument({ components: [{ type: 'link', href: 'javascript:alert(1)' }] });
  assert.equal(doc?.components[0].href, undefined);
});