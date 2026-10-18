'use client';

import React from 'react';
import { acceptInvitation } from '../../lib/api';
import { AuthShell } from '../../components/AuthShell';
import { SetPasswordForm } from '../../components/SetPasswordForm';

export default function AcceptInvitePage() {
  return (
    <AuthShell
      title="Activa tu cuenta"
      subtitle="Te invitaron a TuCondominio360. Define tu contraseña para entrar."
    >
      <SetPasswordForm
        submit={acceptInvitation}
        submitLabel="Activar mi cuenta"
        showGoogle
      />
    </AuthShell>
  );
}
