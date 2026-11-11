import test from 'node:test';
import assert from 'node:assert/strict';
import { SVL_UI_TYPES, validateSvlUiDocument, splitSvlUiContent } from '../src/components/SvlChatUi.tsx';
import { SVL_UI_CATEGORIES } from '../src/components/SvlUiExtras.tsx';

test('all catalog types are accepted by the agent JSON renderer', () => {
  const all = Object.values(SVL_UI_CATEGORIES).flat();
  for (const type of all) {
    assert.ok(SVL_UI_TYPES.includes(type), 'Missing type: ' + type);
    const doc = validateSvlUiDocument({ title: 'Test', components: [{ type, label: 'Demo', status: 'UNVERIFIED' }] });
    assert.ok(doc, 'Rejected type: ' + type);
    assert.equal(doc.components[0].type, type);
  }
});
test('rejects undeclared widgets and unsafe links', () => {
  assert.equal(validateSvlUiDocument({components:[{type:'raw_html',value:'<script/>'}]}),null);
  const doc = validateSvlUiDocument({ components:[{type:'image',href:'javascript:alert(1)'}] });
  assert.ok(doc);
  assert.equal(doc.components[0].href,undefined);
});
test('parses image prompts and blue chip groups alongside ordinary text', () => {
  const body = 'Hello\n' + '```svl-ui\n' + JSON.stringify({
    components: [{type:'chip_group', options:['Flota', 'Bastilla']},
      {type:'image_prompt',title:'Grafika', value:'Spaceship'}],
  }) + '\n```\nDone';
  const parts = splitSvlUiContent(body);
  assert.equal(parts.filter(p=>p.kind==='ui').length,1);
  assert.ok(parts.some(p=>p.kind==='text' && p.text.includes('Hello')));
});
