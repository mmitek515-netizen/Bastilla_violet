import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SelectedModules, selectedModules } from '../src/components/SelectedModules.tsx';

const props = {
  onSelect: () => {},
  onRefresh: () => {},
  onRestart: () => {},
  restarting: false,
};

test('selected navigation exposes only the five requested modules', () => {
  assert.deepEqual(selectedModules.map((module) => module.id), [
    'dashboard', 'fleet', 'system', 'processes', 'hypercom',
  ]);
  const dashboard = renderToStaticMarkup(React.createElement(SelectedModules, { ...props, module: 'dashboard' }));
  for (const label of ['Flota', 'Diagnostyka', 'Procesy i naprawy', 'HyperCom']) {
    assert.ok(dashboard.includes(label));
  }
  assert.ok(dashboard.includes('Brak odczytu'));
});

test('fleet, process, and HyperCom views render without fabricated state', () => {
  const fleet = renderToStaticMarkup(React.createElement(SelectedModules, { ...props, module: 'fleet' }));
  assert.ok(fleet.includes('Brak potwierdzonego połączenia z API Floty.'));
  const processes = renderToStaticMarkup(React.createElement(SelectedModules, { ...props, module: 'processes' }));
  assert.ok(processes.includes('Samonaprawa'));
  assert.ok(processes.includes('Niezweryfikowana'));
  const hypercom = renderToStaticMarkup(React.createElement(SelectedModules, { ...props, module: 'hypercom' }));
  assert.ok(hypercom.includes('/api/apps/preview/hyper_com_module/index.html'));
});
