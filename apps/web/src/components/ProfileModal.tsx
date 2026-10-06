'use client';

import React, { useState } from 'react';
import { X, User, Mail, Phone, Shield, CheckCircle2 } from 'lucide-react';
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
    firstName: currentUser.firstName || 'Arnaldo',
    lastName: currentUser.lastName || 'Martínez',
    email: currentUser.email || 'superadmin@tucondominio360.com',
    phone: currentUser.phone || '+584120000000',
    docNumber: currentUser.docNumber || '18456123',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      console.error('Error updating profile:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <User className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-base">Editar Perfil de Administrador</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>¡Perfil actualizado exitosamente en la base de datos!</span>
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
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Cédula / Documento</label>
              <input
                type="text"
                disabled
                value={`V-${formData.docNumber}`}
                className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2.5 text-slate-500 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Teléfono Móvil</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
              />
            </div>
          </div>

          <div className="pt-2">
            <span className="text-[11px] text-slate-400 block font-medium">
              Rol: <strong>Super Administrador</strong> (Control total del SaaS)
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
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-sm transition"
            >
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
