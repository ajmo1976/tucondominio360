import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithAuth } from '../lib/api';

const SELECTED_CONDO_KEY = 'tc360.selectedCondoId';

export interface CondoItem {
  id: string;
  name: string;
  rif?: string;
  city?: string;
  state?: string;
  address?: string;
  role?: string;
}

interface CondoContextType {
  condos: CondoItem[];
  selectedCondo: CondoItem | null;
  loading: boolean;
  selectCondo: (condo: CondoItem) => Promise<void>;
  refreshCondos: () => Promise<void>;
}

const CondoContext = createContext<CondoContextType>({
  condos: [],
  selectedCondo: null,
  loading: true,
  selectCondo: async () => {},
  refreshCondos: async () => {},
});

export const useCondo = () => useContext(CondoContext);

export function CondoProvider({ children }: { children: React.ReactNode }) {
  const [condos, setCondos] = useState<CondoItem[]>([]);
  const [selectedCondo, setSelectedCondo] = useState<CondoItem | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCondos = async () => {
    setLoading(true);
    try {
      // 1. Obtener lista de condominios
      const res = await fetchWithAuth('/condos').catch(() => []);
      let list: CondoItem[] = [];

      if (Array.isArray(res) && res.length > 0) {
        list = res.map((c: any) => ({
          id: c.id,
          name: c.name,
          rif: c.rif,
          city: c.city,
          state: c.state,
          address: c.address,
          role: c.role,
        }));
      } else {
        // Fallback: condominios devueltos por el perfil de auth
        const me = await fetchWithAuth('/auth/me').catch(() => null);
        if (me?.condos && me.condos.length > 0) {
          list = me.condos.map((c: any) => ({
            id: c.condoId || c.condo_id,
            name: c.condoName || c.condo_name,
            role: c.role,
          }));
        }
      }

      setCondos(list);

      // 2. Recuperar la residencia activa previa guardada
      const savedId = await AsyncStorage.getItem(SELECTED_CONDO_KEY);
      const target = list.find((c) => c.id === savedId) || list[0] || null;
      setSelectedCondo(target);

      if (target?.id) {
        await AsyncStorage.setItem(SELECTED_CONDO_KEY, target.id);
      }
    } catch (e) {
      console.error('Error cargando condominios:', e);
    } finally {
      setLoading(false);
    }
  };

  const selectCondo = async (condo: CondoItem) => {
    setSelectedCondo(condo);
    await AsyncStorage.setItem(SELECTED_CONDO_KEY, condo.id);
  };

  useEffect(() => {
    loadCondos();
  }, []);

  return (
    <CondoContext.Provider
      value={{
        condos,
        selectedCondo,
        loading,
        selectCondo,
        refreshCondos: loadCondos,
      }}
    >
      {children}
    </CondoContext.Provider>
  );
}
