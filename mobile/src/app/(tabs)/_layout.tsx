import { Tabs } from 'expo-router';
import { Home, Receipt, Users, CheckSquare, User } from 'lucide-react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#059669',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: { borderTopColor: '#e2e8f0', backgroundColor: '#ffffff' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="comunidad"
        options={{
          title: 'Recibos',
          tabBarIcon: ({ color, size }) => <Receipt size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="unidades"
        options={{
          title: 'Unidades',
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="conciliacion"
        options={{
          title: 'Conciliación',
          tabBarIcon: ({ color, size }) => <CheckSquare size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
