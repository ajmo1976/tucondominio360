'use client';

import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';

/**
 * Confirmación de borrado estilo AWS Console: la destrucción permanente tiene
 * consecuencias irreversibles, así que no basta un confirm() del navegador.
 * El usuario debe leer los riesgos listados y escribir el nombre exacto del
 * recurso para que se habilite el botón "Eliminar definitivamente".
 */

interface ConfirmDeleteModalProps {
  title: string;
  /** Nombre legible del recurso (se muestra en la advertencia). */
  resourceName: string;
  /** Texto exacto que el usuario debe teclear para habilitar el botón. */
  typePhrase: string;
  /** Consecuencias del borrado permanente, una por línea. */
  risks: string[];
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/** Comparación indulgente: ignora mayúsculas y espacios sobrantes. */
function phraseMatches(input: string, expected: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return norm(input) === norm(expected);
}

export function ConfirmDeleteModal({
  title,
  resourceName,
  typePhrase,
  risks,
  busy = false,
  error = null,
  onConfirm,
  onClose,
}: ConfirmDeleteModalProps) {
  const [typed, setTyped] = useState('');
  const matched = phraseMatches(typed, typePhrase);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Encabezado */}
        <div className="bg-rose-600 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="font-bold text-base leading-tight">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-rose-700 rounded-lg text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed">
            Estás a punto de eliminar <span className="font-bold text-slate-900">{resourceName}</span> de
            forma <span className="font-bold text-rose-600">permanente e irreversible</span>.
          </p>

          {/* Riesgos del borrado */}
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
            <p className="font-bold text-rose-800 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Riesgos del borrado permanente
            </p>
            <ul className="list-disc ml-4 space-y-1 text-slate-700">
              {risks.map((risk, i) => (
                <li key={i}>{risk}</li>
              ))}
            </ul>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-300 text-rose-800 rounded-xl font-semibold">
              {error}
            </div>
          )}

          {/* Zona de tipeo (como en AWS) */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Para confirmar, escribe: <span className="font-mono text-rose-600">{typePhrase}</span>
            </label>
            <input
              type="text"
              autoFocus
              value={typed}
              disabled={busy}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={typePhrase}
              className={`w-full bg-white border rounded-lg p-2.5 text-slate-900 font-mono outline-none transition ${
                matched
                  ? 'border-emerald-500 ring-2 ring-emerald-200'
                  : typed.length > 0
                    ? 'border-rose-400 ring-2 ring-rose-200'
                    : 'border-slate-300 focus:border-rose-500'
              }`}
            />
            <p className="text-[11px] text-slate-400 mt-1">
              {matched
                ? '✓ Confirmación válida. Puedes eliminar.'
                : 'Escribir el texto exacto habilita el botón de eliminar.'}
            </p>
          </div>

          {/* Acciones */}
          <div className="flex justify-end space-x-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!matched || busy}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? 'Eliminando...' : 'Eliminar definitivamente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}