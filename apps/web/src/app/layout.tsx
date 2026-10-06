import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TuCondominio360 | SaaS de Gestión Inmobiliaria y Condominios',
  description: 'Plataforma integral para administración de condominios, conciliación bancaria, recibos y acceso en Venezuela',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="antialiased min-h-screen bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
