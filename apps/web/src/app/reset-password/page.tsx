'use client';

import React from 'react';
import { resetPassword } from '../../lib/api';
import { AuthShell } from '../../components/AuthShell';
import { SetPasswordForm } from '../../components/SetPasswordForm';

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Nueva contraseña"
      subtitle="Define la contraseña que usarás para entrar a TuCondominio360."
    >
      <SetPasswordForm submit={resetPassword} submitLabel="Guardar contraseña" />
    </AuthShell>
  );
}
