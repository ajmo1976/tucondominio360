'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
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
import { MyUnitsView } from '../components/MyUnitsView';
import { CommunityDashboard } from '../components/CommunityDashboard';
import { UsersView } from '../components/UsersView';
import { CompaniesView } from '../components/CompaniesView';
import { ConsultationsAdminView } from '../components/ConsultationsAdminView';
import { ConsultationsOwnerView } from '../components/ConsultationsOwnerView';
import { AmenitiesView } from '../components/AmenitiesView';
import { MaintenanceView } from '../components/MaintenanceView';
import { AnnouncementsView } from '../components/AnnouncementsView';
import { ProfileModal } from '../components/ProfileModal';
import { CondoSelectorModal } from '../components/CondoSelectorModal';
import { BankAccountsModal } from '../components/BankAccountsModal';
import { fetchWithAuth, getSession, logout, getMyModules } from '../lib/api';

/**
 * Estado inicial sin residencia cargada. Antes se arrancaba con una residencia
 * inventada (El Ávila, con su RIF y dirección). Ahora la pantalla arranca sin
 * residencia y muestra "—" hasta que el backend responde.
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

/** Etiquetas del rol dentro de una residencia (condo_user_access). */
const CONDO_ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  OWNER: 'Propietario',
  BOARD_PRESIDENT: 'Presidente de Junta',
  BOARD_TREASURER: 'Tesorero de Junta',
  BOARD_MEMBER: 'Miembro de Junta',
  TENANT: 'Arrendatario',
};

/** Etiquetas del rol dentro de la empresa administradora/junta (tenant_users). */
const TENANT_ROLE_LABELS: Record<string, string> = {
  OWNER: 'Dueño de Empresa',
  ADMIN: 'Administración de Empresa',
  STAFF: 'Staff de Empresa',
  VIEWER: 'Observador de Empresa',
};

export default function Home() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [currentTab, setCurrentTab] = useState('dashboard');
  // La pestaña inicial (gestión vs. portal) se decide solo en la primera carga
  // de perfil: cambiar de residencia no debe volver a saltar de pestaña.
  const initialTabSet = useRef(false);
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
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    docNumber: '',
    role: '',
    isSuperadmin: false,
    /** Staff de empresa administradora/junta o con rol de residencia (menú de gestión). */
    isStaff: false,
  });

  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [modulesByCondo, setModulesByCondo] = useState<Record<string, string[]>>({});

  // Guard de sesión: sin login real la app no pinta el dashboard.
  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    setAuthReady(true);
    // Cargar permisos efectivos y módulos del usuario autenticado
    (async () => {
      try {
        const meRes = await fetchWithAuth('/auth/me');
        if (meRes?.user) {
          const allPerms = (meRes.condos || []).reduce((acc: string[], c: any) => {
            const p = c.permissions || [];
            p.forEach((p: string) => { if (!acc.includes(p)) acc.push(p); });
            return acc;
          }, []);
          setUserPermissions(allPerms);
        }
        const modules = await getMyModules();
        setModulesByCondo(modules);
      } catch (err) {
        console.error('Error loading permissions/modules:', err);
      }
    })();
  }, [router]);

  // Cerrar sesión: limpia el token local y devuelve al login.
  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  // 1. Cargar lista de condominios al iniciar (una vez autenticado)
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

      // Pagos reportados por residentes (Conciliación).
      const paysRes = await fetchWithAuth(`/payments/condos/${condoId}`).catch(() => []);
      if (Array.isArray(paysRes)) setPayments(paysRes);

      // Perfil real del usuario autenticado
      const meRes = await fetchWithAuth('/auth/me').catch(() => null);
      if (meRes?.user) {
        const isSuper = Boolean(meRes.user.is_superadmin);
        // Rol efectivo en la residencia activa: primero el rol de residencia
        // (condo_user_access); si no tiene, el de la empresa administradora
        // (tenant_users, p. ej. OWNER/ADMIN de la administradora); si solo
        // ocupa unidades, es propietario del portal.
        // `isStaff` del backend marca al personal de gestión (rol de empresa o
        // rol de residencia de administración/junta); OWNER/TENANT de
        // residencia y simples ocupantes son propietarios del portal.
        const access = (meRes.condos || []).find((c: any) => c.condoId === condoId);
        const isStaff = Boolean(access?.isStaff);
        const role = isSuper
          ? 'Super Administrador'
          : access?.condoRole
            ? CONDO_ROLE_LABELS[access.condoRole] || access.condoRole
            : access?.tenantRole
              ? TENANT_ROLE_LABELS[access.tenantRole] || `Empresa (${access.tenantRole})`
              : 'Propietario · Portal de Recibos';
        setUserProfile({
          firstName: meRes.user.first_name || '',
          lastName: meRes.user.last_name || '',
          email: meRes.user.email || '',
          phone: meRes.user.phone || '',
          docNumber: meRes.user.doc_number || '',
          role,
          isSuperadmin: isSuper,
          isStaff,
        });
        // Pestaña inicial según el tipo de usuario: el personal de
        // administración (empresa o residencia) entra al dashboard de gestión;
        // el propietario al portal de transparencia. Solo la primera vez.
        if (!initialTabSet.current) {
          initialTabSet.current = true;
          if (!isSuper) setCurrentTab(isStaff ? 'dashboard' : 'community');
        }
      }
    } catch (err) {
      console.error('Error loading condo data:', err);
    }
  };

  useEffect(() => {
    if (authReady) loadCondos();
  }, [authReady]);

  useEffect(() => {
    if (selectedCondo?.id) {
      loadCondoData(selectedCondo.id);
    }
  }, [selectedCondo?.id]);

  // Sin sesión aún: pantalla de carga para no pintar la app a quien no entró.
  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black text-2xl mx-auto mb-4">
            360
          </div>
          <p className="text-sm text-slate-500 font-medium">Cargando TuCondominio360…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Barra Lateral de Navegación */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        isSuperadmin={userProfile.isSuperadmin}
        isStaff={userProfile.isStaff}
        permissions={userPermissions}
        modulesByCondo={modulesByCondo}
        selectedCondoId={selectedCondo?.id}
      />

      {/* Contenido Principal */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          bcvRate={bcvRate}
          condoName={selectedCondo?.name || '—'}
          condoRif={selectedCondo?.rif || '—'}
          condoLocation={[selectedCondo?.city, selectedCondo?.state].filter(Boolean).join(', ') || '—'}
          userName={`${userProfile.firstName} ${userProfile.lastName}`.trim() || userProfile.email}
          userEmail={userProfile.email}
          isSuperadmin={userProfile.isSuperadmin}
          role={userProfile.role}
          onLogout={handleLogout}
          onOpenProfile={() => setShowProfileModal(true)}
          onOpenCondoSelector={() => setShowCondoSelectorModal(true)}
        />

        <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
          {/* Sin residencia cargada no se pinta ninguna vista de datos. */}
          {!selectedCondo.id && currentTab !== 'my-bills' && currentTab !== 'users' && currentTab !== 'companies' && (
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

          {/* Dashboard General del propietario (transparencia comunitaria) */}
          {selectedCondo.id && currentTab === 'community' && (
            <CommunityDashboard condo={selectedCondo} />
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

          {selectedCondo.id && currentTab === 'access' && (
            <AccessView condoId={selectedCondo.id} />
          )}

          {selectedCondo.id && currentTab === 'amenities' && (
            <AmenitiesView condoId={selectedCondo.id} />
          )}

          {selectedCondo.id && currentTab === 'maintenance' && (
            <MaintenanceView condoId={selectedCondo.id} />
          )}

          {selectedCondo.id && currentTab === 'announcements' && (
            <AnnouncementsView condoId={selectedCondo.id} isSuperadmin={userProfile.isSuperadmin} />
          )}

          {/* Portal del Propietario: recibos en todas sus residencias */}
          {currentTab === 'my-bills' && (
            <MyBillsView bcvRate={bcvRate} />
          )}

          {/* Portal del Propietario: unidades consolidadas en todas sus residencias */}
          {currentTab === 'my-units' && (
            <MyUnitsView
              onGoToBills={
                // El botón solo aparece si puede abrir "Mis recibos" (mismo
                // criterio que el menú lateral: PAYMENTS_REPORT o superadmin).
                userProfile.isSuperadmin || userPermissions.includes('PAYMENTS_REPORT')
                  ? () => setCurrentTab('my-bills')
                  : undefined
              }
            />
          )}

          {/* Módulo de Usuarios y Accesos (solo administración) */}
          {currentTab === 'users' && (
            <UsersView />
          )}

          {/* Empresas administradoras (solo superadmin) */}
          {currentTab === 'companies' && (
            <CompaniesView />
          )}

          {/* Consultas y Asambleas Digitales (Admin o Propietario) */}
          {selectedCondo.id && currentTab === 'consultations' && (
            userProfile.isSuperadmin
              ? <ConsultationsAdminView condoId={selectedCondo.id} />
              : <ConsultationsOwnerView condoId={selectedCondo.id} />
          )}
        </main>
      </div>

      {/* Modal Editar Perfil de Usuario */}
      {showProfileModal && (
        <ProfileModal
          currentUser={userProfile}
          onClose={() => setShowProfileModal(false)}
          onProfileUpdated={(updated) => setUserProfile((prev) => ({ ...prev, ...updated }))}
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