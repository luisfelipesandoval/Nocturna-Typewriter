import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeVisualLines,
  getCursorVisualPosition,
  evaluatePageOverflow,
  calculateTextMetrics,
} from './pagination';

test('computeVisualLines wraps words cleanly and respects newlines', () => {
  const lines = computeVisualLines('Primera línea\nSegunda línea corta', 40);
  assert.equal(lines.length, 2);
  assert.equal(lines[0], 'Primera línea');
  assert.equal(lines[1], 'Segunda línea corta');
});

test('getCursorVisualPosition tracks row and column accurately', () => {
  const sample = 'Hola mundo\nEscribiendo de noche';
  const posEnd = getCursorVisualPosition(sample, sample.length, 50);
  assert.equal(posEnd.visualRow, 1);
  assert.equal(posEnd.visualCol, 'Escribiendo de noche'.length);
  assert.equal(posEnd.totalVisualLines, 2);
});

test('evaluatePageOverflow splits overflow cleanly onto the next page when exceeding maxLinesPerPage', () => {
  const fiveLines = 'Línea 1\nLínea 2\nLínea 3\nLínea 4\nLínea 5\nLínea 6 que pasa a la hoja dos';
  const result = evaluatePageOverflow(fiveLines, 5, 50);
  assert.equal(result.shouldTurnPage, true);
  assert.equal(result.currentPageContent, 'Línea 1\nLínea 2\nLínea 3\nLínea 4\nLínea 5');
  assert.equal(result.carryOverContent, 'Línea 6 que pasa a la hoja dos');
});

test('evaluatePageOverflow does not split when within page line capacity', () => {
  const threeLines = 'Uno\nDos\nTres';
  const result = evaluatePageOverflow(threeLines, 10, 50);
  assert.equal(result.shouldTurnPage, false);
  assert.equal(result.currentPageContent, threeLines);
  assert.equal(result.carryOverContent, '');
});

test('calculateTextMetrics counts words, characters, and visual lines accurately', () => {
  const metrics = calculateTextMetrics('La máquina de escribir ilumina el papel en la noche.', 60);
  assert.equal(metrics.words, 10);
  assert.equal(metrics.characters, 52);
  assert.equal(metrics.visualLines, 1);
});
