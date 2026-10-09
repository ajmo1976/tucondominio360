'use client';

import React, { useState } from 'react';
import { KeyRound, Loader2, User, Mail, Phone, Shield, CheckCircle2, X, AlertCircle } from 'lucide-react';
import { fetchWithAuth } from '../lib/api';

interface ProfileModalProps {
  onClose: () => void;
  currentUser: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    docNumber: string;
    role: string;
  };
  onProfileUpdated: (updatedUser: any) => void;
}

export function ProfileModal({ onClose, currentUser, onProfileUpdated }: ProfileModalProps) {
  const [formData, setFormData] = useState({
    firstName: currentUser.firstName || '',
    lastName: currentUser.lastName || '',
    email: currentUser.email || '',
    phone: currentUser.phone || '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Cambio de contraseña
  const [showPassword, setShowPassword] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError('El correo electrónico no es válido.');
      return;
    }
    setLoading(true);
    try {
      const updated = await fetchWithAuth('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(formData),
      });
      setSuccess(true);
      onProfileUpdated({
        ...currentUser,
        firstName: updated.first_name,
        lastName: updated.last_name,
        email: updated.email,
        phone: updated.phone,
      });
      setTimeout(onClose, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el perfil');
      setLoading(false);
    }
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (pw.next.length < 6) {
      setPwError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (pw.next !== pw.confirm) {
      setPwError('Las contraseñas no coinciden.');
      return;
    }
    setPwLoading(true);
    try {
      await fetchWithAuth('/auth/profile/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
      });
      setPwSuccess(true);
      setPw({ current: '', next: '', confirm: '' });
      setPwLoading(false);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña');
      setPwLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <User className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-base">Editar Mi Perfil</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>¡Perfil actualizado exitosamente!</span>
            </div>
          )}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nombre</label>
              <input
                type="text"
                required
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Apellido</label>
              <input
                type="text"
                required
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Correo Electrónico</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg pl-9 p-2.5 text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Cédula / Documento</label>
              <input
                type="text"
                disabled
                value={currentUser.docNumber ? `V-${currentUser.docNumber}` : '—'}
                className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2.5 text-slate-500 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Teléfono Móvil</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg pl-9 p-2.5 text-slate-900 font-mono"
                />
              </div>
            </div>
          </div>

          <div className="pt-1 flex items-center gap-2 text-[11px] text-slate-400">
            <Shield className="w-3.5 h-3.5 text-emerald-500" />
            <span>
              Rol: <strong className="text-slate-600">{currentUser.role || '—'}</strong>
            </span>
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-sm transition inline-flex items-center gap-2 disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>

        {/* Cambio de contraseña */}
        <div className="border-t border-slate-200">
          <button
            onClick={() => setShowPassword(!showPassword)}
            className="w-full px-6 py-3 flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
          >
            <span className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-slate-400" />
              Cambiar mi contraseña
            </span>
            <span className="text-slate-400">{showPassword ? '▲' : '▼'}</span>
          </button>

          {showPassword && (
            <form onSubmit={handlePassword} className="px-6 pb-6 space-y-3 text-xs">
              {pwSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>¡Contraseña cambiada exitosamente!</span>
                </div>
              )}
              {pwError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl felx items-start gap-2">
                  <span>{pwError}</span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Contraseña actual</label>
                <input
                  type="password"
                  required
                  value={pw.current}
                  onChange={(e) => setPw({ ...pw, current: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nueva contraseña</label>
                  <input
                    type="password"
                    required
                    value={pw.next}
                    onChange={(e) => setPw({ ...pw, next: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Confirmar</label>
                  <input
                    type="password"
                    required
                    value={pw.confirm}
                    onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={pwLoading}
                className="w-full px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold shadow-sm transition inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {pwLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {pwLoading ? 'Cambiando...' : 'Actualizar contraseña'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}