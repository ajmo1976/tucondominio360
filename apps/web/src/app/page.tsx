'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { DashboardView } from '../components/DashboardView';
import { ExpensesView } from '../components/ExpensesView';
import { BillsView } from '../components/BillsView';
import { PaymentsView } from '../components/PaymentsView';
import { UnitsView } from '../components/UnitsView';
import { AccessView } from '../components/AccessView';
import { ProfileModal } from '../components/ProfileModal';
import { CondoSelectorModal } from '../components/CondoSelectorModal';
import { BankAccountsModal } from '../components/BankAccountsModal';
import { fetchWithAuth } from '../lib/api';

const DEFAULT_CONDO = {
  id: '44444444-4444-4444-4444-444444444401',
  name: 'Residencias Parque El Ávila',
  rif: 'J-50123456-7',
  city: 'Caracas',
  state: 'Miranda',
  address: 'Av. Principal de Los Palos Grandes, 3ra Transversal',
  main_currency: 'USD',
  secondary_currency: 'VES',
};

export default function Home() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [bcvRate, setBcvRate] = useState('36.8500');
  const [condos, setCondos] = useState<any[]>([DEFAULT_CONDO]);
  const [selectedCondo, setSelectedCondo] = useState<any>(DEFAULT_CONDO);
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
  });

  // 1. Cargar lista de condominios al iniciar
  const loadCondos = async () => {
    try {
      const res = await fetchWithAuth('/condos').catch(() => []);
      if (Array.isArray(res) && res.length > 0) {
        setCondos(res);
        const target = res.find((c: any) => c.id === selectedCondo?.id) || res[0];
        setSelectedCondo(target);
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

      // Perfil de usuario
      const meRes = await fetchWithAuth('/auth/me').catch(() => null);
      if (meRes?.user) {
        setUserProfile({
          firstName: meRes.user.first_name,
          lastName: meRes.user.last_name,
          email: meRes.user.email,
          phone: meRes.user.phone,
          docNumber: meRes.user.doc_number,
          role: meRes.user.is_superadmin ? 'Super Administrador' : 'Administrador',
        });
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
      <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} />

      {/* Contenido Principal */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          bcvRate={bcvRate}
          condoName={selectedCondo?.name || 'Residencias Parque El Ávila'}
          condoRif={selectedCondo?.rif || 'J-50123456-7'}
          condoLocation={selectedCondo ? `${selectedCondo.city}, ${selectedCondo.state}` : 'Caracas, Miranda'}
          userName={`${userProfile.firstName} ${userProfile.lastName}`}
          onOpenProfile={() => setShowProfileModal(true)}
          onOpenCondoSelector={() => setShowCondoSelectorModal(true)}
        />

        <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
          {selectedCondo && currentTab === 'dashboard' && (
            <DashboardView
              condo={selectedCondo}
              summary={condoSummary}
              bcvRate={bcvRate}
              bankAccounts={condoBankAccounts}
              onRefreshCondoData={() => loadCondoData(selectedCondo.id)}
            />
          )}

          {selectedCondo && currentTab === 'expenses' && (
            <ExpensesView
              condoId={selectedCondo.id}
              bcvRate={bcvRate}
              onExpenseAdded={() => loadCondoData(selectedCondo.id)}
            />
          )}

          {selectedCondo && currentTab === 'bills' && (
            <BillsView
              condoId={selectedCondo.id}
              bcvRate={bcvRate}
            />
          )}

          {selectedCondo && currentTab === 'payments' && (
            <PaymentsView
              condoId={selectedCondo.id}
              payments={payments}
              onRefresh={() => loadCondoData(selectedCondo.id)}
              bcvRate={bcvRate}
            />
          )}

          {selectedCondo && currentTab === 'units' && (
            <UnitsView
              condoId={selectedCondo.id}
              units={units}
              onRefreshUnits={() => loadCondoData(selectedCondo.id)}
            />
          )}

          {currentTab === 'access' && (
            <AccessView />
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
          onSelectCondo={(condo) => setSelectedCondo(condo)}
          onClose={() => setShowCondoSelectorModal(false)}
          onCondoUpdated={() => {
            loadCondos();
            if (selectedCondo?.id) loadCondoData(selectedCondo.id);
          }}
        />
      )}

      {/* Modal Cuentas Bancarias del Conjunto */}
      {showBankModal && selectedCondo && (
        <BankAccountsModal
          condoId={selectedCondo.id}
          condoName={selectedCondo.name}
          bankAccounts={condoBankAccounts}
          onClose={() => setShowBankModal(false)}
          onAccountAdded={() => loadCondoData(selectedCondo.id)}
        />
      )}
    </div>
  );
}
