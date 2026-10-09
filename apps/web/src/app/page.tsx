'use client';

import React, { useState, useEffect } from 'react';
import { Building2 } from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { DashboardView } from '../components/DashboardView';
import { ExpensesView } from '../components/ExpensesView';
import { BillsView } from '../components/BillsView';
import { PaymentsView } from '../components/PaymentsView';
import { UnitsView } from '../components/UnitsView';
import { AccessView } from '../components/AccessView';
import { MyBillsView } from '../components/MyBillsView';
import { ProfileModal } from '../components/ProfileModal';
import { CondoSelectorModal } from '../components/CondoSelectorModal';
import { BankAccountsModal } from '../components/BankAccountsModal';
import { fetchWithAuth, setDevUserEmail } from '../lib/api';

/**
 * Estado inicial sin residencia cargada. Antes se arrancaba con una residencia
 * inventada (El Ávila, con su RIF y dirección) para que la interfaz no se
 * viera vacía, lo que hacía que esa residencia fantasma apareciera en toda
 * pantalla si la carga del catálogo fallaba o tardaba. Ahora la pantalla
 * arranca sin residencia y muestra "—" hasta que el backend responde.
 */
const NO_CONDO = {
  id: '',
  name: '',
  rif: '',
  city: '',
  state: '',
  address: '',
  main_currency: 'USD',
  secondary_currency: 'VES',
};

export default function Home() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [bcvRate, setBcvRate] = useState<string>('');
  const [condos, setCondos] = useState<any[]>([]);
  const [selectedCondo, setSelectedCondo] = useState<any>(NO_CONDO);
  const [condoSummary, setCondoSummary] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [condoBankAccounts, setCondoBankAccounts] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [showBankModal, setShowBankModal] = useState(false);
  const [units, setUnits] = useState<any[]>([]);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showCondoSelectorModal, setShowCondoSelectorModal] = useState(false);

  const [userProfile, setUserProfile] = useState({
    firstName: 'Arnaldo',
    lastName: 'Martínez',
    email: 'superadmin@tucondominio360.com',
    phone: '+584120000000',
    docNumber: '18456123',
    role: 'Super Administrador',
    isSuperadmin: true,
  });

  // Cambio de usuario demo (modo propietario): se guarda el email elegido y se
  // recarga la app para emitir un token nuevo y refrescar todo el estado.
  const handleUserChange = (email: string) => {
    setDevUserEmail(email);
    window.location.reload();
  };

  // 1. Cargar lista de condominios al iniciar
  const loadCondos = async () => {
    try {
      const res = await fetchWithAuth('/condos').catch(() => []);
      if (Array.isArray(res) && res.length > 0) {
        setCondos(res);
        // Recordar la última residencia elegida: el dashboard abre en la que el
        // usuario dejó seleccionada, no siempre en la primera alfabética.
        const savedId = typeof window !== 'undefined' ? window.localStorage.getItem('tc360.selectedCondoId') : null;
        const target =
          res.find((c: any) => c.id === (selectedCondo?.id || savedId)) ||
          res[0];
        setSelectedCondo(target);
        if (target?.id && typeof window !== 'undefined') {
          window.localStorage.setItem('tc360.selectedCondoId', target.id);
        }
        loadCondoData(target.id);
      }
    } catch (err) {
      console.error('Error loading condos:', err);
    }
  };

  // 2. Cargar datos específicos del condominio activo
  const loadCondoData = async (condoId: string) => {
    try {
      // Tasa BCV
      const bcv = await fetch('http://localhost:3001/api/bcv/current')
        .then((r) => r.json())
        .catch(() => null);
      if (bcv?.rate) setBcvRate(Number(bcv.rate).toFixed(4));

      // Resumen Financiero del Condominio
      const summary = await fetchWithAuth(`/condos/${condoId}/summary`).catch(() => null);
      if (summary) setCondoSummary(summary);

      // Cuentas Receptoras propias de este condominio
      const accountsRes = await fetchWithAuth(`/condos/${condoId}/bank-accounts`).catch(() => []);
      if (Array.isArray(accountsRes)) setCondoBankAccounts(accountsRes);

      // Cuentas Bancarias del Condominio
      const banksRes = await fetchWithAuth(`/condos/${condoId}/bank-accounts`).catch(() => []);
      if (Array.isArray(banksRes)) setBankAccounts(banksRes);

      // Unidades e Inmuebles
      const unitsRes = await fetchWithAuth(`/condos/${condoId}/units`).catch(() => []);
      if (Array.isArray(unitsRes)) setUnits(unitsRes);

      // Pagos reportados por residentes (Conciliación). Sin esta carga la
      // pantalla de Conciliación siempre decía "no hay reportes" aunque el
      // backend tuviera pagos pendientes.
      const paysRes = await fetchWithAuth(`/payments/condos/${condoId}`).catch(() => []);
      if (Array.isArray(paysRes)) setPayments(paysRes);

      // Perfil de usuario
      const meRes = await fetchWithAuth('/auth/me').catch(() => null);
      if (meRes?.user) {
        const isSuper = Boolean(meRes.user.is_superadmin);
        setUserProfile({
          firstName: meRes.user.first_name,
          lastName: meRes.user.last_name,
          email: meRes.user.email,
          phone: meRes.user.phone,
          docNumber: meRes.user.doc_number,
          role: isSuper ? 'Super Administrador' : 'Propietario · Portal de Recibos',
          isSuperadmin: isSuper,
        });
        // Un propietario entra directo a su portal de recibos: los módulos de
        // administración no aplican a su sesión.
        if (!isSuper) setCurrentTab('my-bills');
      }
    } catch (err) {
      console.error('Error loading condo data:', err);
    }
  };

  useEffect(() => {
    loadCondos();
  }, []);

  useEffect(() => {
    if (selectedCondo?.id) {
      loadCondoData(selectedCondo.id);
    }
  }, [selectedCondo?.id]);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Barra Lateral de Navegación */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        isSuperadmin={userProfile.isSuperadmin}
      />

      {/* Contenido Principal */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          bcvRate={bcvRate}
          condoName={selectedCondo?.name || '—'}
          condoRif={selectedCondo?.rif || '—'}
          condoLocation={[selectedCondo?.city, selectedCondo?.state].filter(Boolean).join(', ') || '—'}
          userName={`${userProfile.firstName} ${userProfile.lastName}`}
          userEmail={userProfile.email}
          isSuperadmin={userProfile.isSuperadmin}
          onUserChange={handleUserChange}
          onOpenProfile={() => setShowProfileModal(true)}
          onOpenCondoSelector={() => setShowCondoSelectorModal(true)}
        />

        <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
          {/* Sin residencia cargada no se pinta ninguna vista de datos: antes se
              mostraba la del resumen de una residencia fija. El portal de
              recibos del propietario es multi-residencia, así que tampoco
              aplica aquí. */}
          {!selectedCondo.id && currentTab !== 'access' && currentTab !== 'my-bills' && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-10 text-center">
              <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h2 className="font-bold text-slate-800">No hay una residencia seleccionada</h2>
              <p className="text-sm text-slate-500 mt-1">
                Elige una residencia para ver su información, o regístrala si aún no tienes ninguna.
              </p>
              <button
                onClick={() => setShowCondoSelectorModal(true)}
                className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition"
              >
                <Building2 className="w-4 h-4" />
                Gestionar Residencias
              </button>
            </div>
          )}

          {selectedCondo.id && currentTab === 'dashboard' && (
            <DashboardView
              condo={selectedCondo}
              summary={condoSummary}
              bcvRate={bcvRate}
              bankAccounts={condoBankAccounts}
              onRefreshCondoData={() => loadCondoData(selectedCondo.id)}
            />
          )}

          {selectedCondo.id && currentTab === 'expenses' && (
            <ExpensesView
              condoId={selectedCondo.id}
              bcvRate={bcvRate}
              onExpenseAdded={() => loadCondoData(selectedCondo.id)}
            />
          )}

          {selectedCondo.id && currentTab === 'bills' && (
            <BillsView
              condoId={selectedCondo.id}
              bcvRate={bcvRate}
            />
          )}

          {selectedCondo.id && currentTab === 'payments' && (
            <PaymentsView
              condoId={selectedCondo.id}
              payments={payments}
              onRefresh={() => loadCondoData(selectedCondo.id)}
              bcvRate={bcvRate}
            />
          )}

          {selectedCondo.id && currentTab === 'units' && (
            <UnitsView
              condoId={selectedCondo.id}
              units={units}
              onRefreshUnits={() => loadCondoData(selectedCondo.id)}
            />
          )}

          {currentTab === 'access' && (
            <AccessView />
          )}

          {/* Portal del Propietario: recibos en todas sus residencias */}
          {currentTab === 'my-bills' && (
            <MyBillsView bcvRate={bcvRate} />
          )}
        </main>
      </div>

      {/* Modal Editar Perfil de Usuario */}
      {showProfileModal && (
        <ProfileModal
          currentUser={userProfile}
          onClose={() => setShowProfileModal(false)}
          onProfileUpdated={(updated) => setUserProfile(updated)}
        />
      )}

      {/* Modal Cambiador de Condominios / Residencias */}
      {showCondoSelectorModal && (
        <CondoSelectorModal
          condos={condos}
          selectedCondo={selectedCondo}
          onSelectCondo={(condo) => {
            setSelectedCondo(condo);
            if (condo?.id && typeof window !== 'undefined') {
              window.localStorage.setItem('tc360.selectedCondoId', condo.id);
            }
          }}
          onClose={() => setShowCondoSelectorModal(false)}
          onCondoUpdated={() => {
            loadCondos();
            if (selectedCondo?.id) loadCondoData(selectedCondo.id);
          }}
          onCondoDeleted={(deleted) => {
            loadCondos();
            if (deleted?.id === selectedCondo?.id) {
              // Se borró la residencia activa: volver al estado vacío y olvidar
              // la selección para no intentar cargar datos de una casa que ya
              // no existe.
              setSelectedCondo(NO_CONDO);
              setCondoSummary(null);
              setUnits([]);
              setPayments([]);
              setCondoBankAccounts([]);
              if (typeof window !== 'undefined') {
                window.localStorage.removeItem('tc360.selectedCondoId');
              }
            }
          }}
        />
      )}

      {/* Modal Cuentas Bancarias del Conjunto */}
      {showBankModal && selectedCondo && (
        <BankAccountsModal
          condoId={selectedCondo.id}
          condoName={selectedCondo.name}
          condoRif={selectedCondo.rif}
          bankAccounts={condoBankAccounts}
          onClose={() => setShowBankModal(false)}
          onAccountAdded={() => loadCondoData(selectedCondo.id)}
        />
      )}
    </div>
  );
}
