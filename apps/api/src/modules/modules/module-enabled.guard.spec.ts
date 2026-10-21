import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { extractCondoId } from './module-enabled.guard';

test('prefiere el condoId de la ruta', () => {
  assert.equal(
    extractCondoId({ params: { condoId: 'a' }, query: { condoId: 'b' }, body: {} } as any),
    'a',
  );
});

test('cae a query y body', () => {
  assert.equal(
    extractCondoId({ params: {}, query: { condoId: 'b' }, body: {} } as any),
    'b',
  );
  assert.equal(
    extractCondoId({ params: {}, query: {}, body: { condoId: 'c' } } as any),
    'c',
  );
});

test('devuelve undefined si no hay condoId', () => {
  assert.equal(
    extractCondoId({ params: {}, query: {}, body: {} } as any),
    undefined,
  );
});