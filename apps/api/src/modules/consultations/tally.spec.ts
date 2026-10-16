import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { computeConsultationTally } from './tally';

const opts = [
  { id: 'a', title: 'A', position: 0 },
  { id: 'b', title: 'B', position: 1 },
  { id: 'c', title: 'C', position: 2 },
];

test('un solo voto → APROBADA con 100%', () => {
  const r = computeConsultationTally(opts, [{ optionId: 'a', aliquot: 1.2 }]);
  assert.equal(r.result, 'APPROVED');
  assert.equal(r.winnerOptionId, 'a');
  assert.equal(r.options.find(o => o.optionId === 'a')!.unitPercentage, 100);
});

test('empate → TIED y sin ganador', () => {
  const r = computeConsultationTally(opts, [
    { optionId: 'a', aliquot: 1 }, { optionId: 'b', aliquot: 1 },
  ]);
  assert.equal(r.result, 'TIED');
  assert.equal(r.winnerOptionId, null);
});

test('sin votos → NO_VOTES y 0% (nunca NaN)', () => {
  const r = computeConsultationTally(opts, []);
  assert.equal(r.result, 'NO_VOTES');
  assert.equal(r.winnerOptionId, null);
  assert.ok(r.options.every(o => o.unitPercentage === 0 && Number.isFinite(o.unitPercentage)));
});

test('mayoría simple = opción más votada, aunque no supere 50%', () => {
  const r = computeConsultationTally(opts, [
    { optionId: 'b', aliquot: 5 }, { optionId: 'b', aliquot: 5 },
    { optionId: 'a', aliquot: 1 }, { optionId: 'c', aliquot: 1 },
  ]);
  assert.equal(r.result, 'APPROVED');
  assert.equal(r.winnerOptionId, 'b');
});

test('decide por unidades, no por alícuota', () => {
  const r = computeConsultationTally(opts, [
    { optionId: 'a', aliquot: 0.1 }, { optionId: 'a', aliquot: 0.1 },
    { optionId: 'b', aliquot: 50 },
  ]);
  assert.equal(r.winnerOptionId, 'a');                     // 2 unidades vs 1
  assert.ok(r.options.find(o => o.optionId === 'b')!.aliquotPercentage > 90); // alícuota se reporta, no decide
});
