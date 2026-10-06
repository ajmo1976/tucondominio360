'use client';

import React, { useState } from 'react';
import { QrCode, Shield, Car, User, Clock, CheckCircle2, Plus } from 'lucide-react';

export function AccessView() {
  const [invitations, setInvitations] = useState([
    {
      id: '1',
      visitorName: 'Alejandro Colmenares',
      docNumber: 'V-20123456',
      unitCode: 'A-11',
      plate: 'AB123CD',
      validUntil: 'Hoy, 10:00 PM',
      status: 'ACTIVO',
      qrCode: 'TC360-QR-9941',
    },
    {
      id: '2',
      visitorName: 'Delivery - Yummy Food',
      docNumber: 'V-24567890',
      unitCode: 'A-21',
      plate: 'MOTO-55',
      validUntil: 'Hoy, 06:30 PM',
      status: 'USADO',
      qrCode: 'TC360-QR-8820',
    },
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Control de Acceso y Garita</h1>
          <p className="text-sm text-slate-500">
            Pases de acceso digital QR para visitantes, entregas y registro de vehículos en garita.
          </p>
        </div>
        <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-2">
          <Plus className="w-4 h-4" />
          <span>Generar Nuevo Pase QR</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {invitations.map((inv) => (
          <div
            key={inv.id}
            className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4 hover:border-emerald-300 transition"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                Apto {inv.unitCode}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  inv.status === 'ACTIVO'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {inv.status}
              </span>
            </div>

            <div className="flex items-center space-x-3">
              <div className="w-16 h-16 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center p-2">
                <QrCode className="w-12 h-12 text-slate-800" />
              </div>
              <div className="space-y-1 text-xs">
                <p className="font-bold text-slate-900 text-sm">{inv.visitorName}</p>
                <p className="text-slate-500 font-mono">{inv.docNumber}</p>
                <p className="text-emerald-700 font-semibold flex items-center gap-1">
                  <Car className="w-3.5 h-3.5" />
                  <span>Placa: {inv.plate}</span>
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Válido hasta: {inv.validUntil}
              </span>
              <span className="font-mono text-slate-400">{inv.qrCode}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
