export interface TallyOptionInput {
  id: string;
  title: string;
  position: number;
}

export interface TallyVoteInput {
  optionId: string;
  aliquot: number;
}

export interface TallyOptionResult {
  optionId: string;
  title: string;
  units: number;
  unitPercentage: number;
  aliquotSum: number;
  aliquotPercentage: number;
}

export interface TallyResult {
  totalUnits: number;
  totalAliquot: number;
  options: TallyOptionResult[];
  winnerOptionId: string | null;
  result: 'APPROVED' | 'TIED' | 'NO_VOTES';
}

/** Redondeo determinista a `digits` decimales, siempre devolviendo un número finito (nunca NaN). */
function round(value: number, digits: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

/**
 * Recuento puro de una consulta. Decide por **cantidad de unidades**, no por
 * alícuota: la alícuota solo se reporta. Reglas (R3):
 * - 0 votos → `NO_VOTES` (sin decisión).
 * - Empate de unidades en el primer lugar → `TIED` (sin decisión, sin ganador).
 * - Mayoría por unidades → `APPROVED` con `winnerOptionId` (decisión tomada; no
 *   implica que "el sí ganó", simplemente que hay una opción mayoritaria).
 * `REJECTED` queda reservado y nunca se produce.
 */
export function computeConsultationTally(
  options: TallyOptionInput[],
  votes: TallyVoteInput[],
): TallyResult {
  const totalUnits = votes.length;
  const totalAliquot = round(
    votes.reduce((sum, vote) => sum + (Number.isFinite(vote.aliquot) ? vote.aliquot : 0), 0),
    5,
  );

  const ordered = [...options].sort((a, b) => a.position - b.position);

  const optionsResult: TallyOptionResult[] = ordered.map((option) => {
    const optionVotes = votes.filter((vote) => vote.optionId === option.id);
    const units = optionVotes.length;
    const aliquotSum = round(optionVotes.reduce((sum, vote) => sum + vote.aliquot, 0), 5);
    return {
      optionId: option.id,
      title: option.title,
      units,
      unitPercentage: totalUnits ? round((units / totalUnits) * 100, 1) : 0,
      aliquotSum,
      aliquotPercentage: totalAliquot ? round((aliquotSum / totalAliquot) * 100, 1) : 0,
    };
  });

  let winnerOptionId: string | null = null;
  let result: TallyResult['result'] = 'NO_VOTES';

  if (totalUnits > 0) {
    const maxUnits = Math.max(...optionsResult.map((option) => option.units));
    if (maxUnits > 0) {
      const leaders = optionsResult.filter((option) => option.units === maxUnits);
      if (leaders.length === 1) {
        // Decisión tomada: existe una opción mayoritaria por unidades.
        result = 'APPROVED';
        winnerOptionId = leaders[0].optionId;
      } else {
        // Empate: sin decisión.
        result = 'TIED';
        winnerOptionId = null;
      }
    }
  }

  return { totalUnits, totalAliquot, options: optionsResult, winnerOptionId, result };
}
