// =============================================================================
// Plantillas de correo (HTML simple, en español)
// =============================================================================

export interface EmailTemplate {
  subject: string;
  html: string;
}

function layout(title: string, body: string, cta: { label: string; url: string }): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
    <h2 style="color:#0f172a">${title}</h2>
    <p style="font-size:14px;line-height:1.6">${body}</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${cta.url}" style="background:#0f172a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px">${cta.label}</a>
    </p>
    <p style="font-size:12px;color:#6b7280">Si el botón no funciona, copia y pega este enlace en tu navegador:<br>${cta.url}</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="font-size:12px;color:#9ca3af">TuCondominio360 — Gestión de condominios</p>
  </div>`;
}

/** Correo de invitación: el destinatario define su clave o entra con Google. */
export function invitationEmail(link: string): EmailTemplate {
  return {
    subject: 'Invitación a TuCondominio360',
    html: layout(
      'Te han invitado a TuCondominio360',
      'Se creó una cuenta para ti. Activa tu acceso definiendo tu contraseña o entrando con tu cuenta de Google. El enlace vence en 7 días.',
      { label: 'Activar mi acceso', url: link },
    ),
  };
}

/** Correo de restablecimiento de contraseña. */
export function passwordResetEmail(link: string): EmailTemplate {
  return {
    subject: 'Restablece tu contraseña — TuCondominio360',
    html: layout(
      'Restablecer contraseña',
      'Recibimos una solicitud para restablecer tu contraseña. Si no fuiste tú, ignora este correo. El enlace vence en 1 hora.',
      { label: 'Crear nueva contraseña', url: link },
    ),
  };
}

/** Correo de verificación de dirección. */
export function emailVerificationEmail(link: string): EmailTemplate {
  return {
    subject: 'Verifica tu correo — TuCondominio360',
    html: layout(
      'Verifica tu correo electrónico',
      'Confirma que esta dirección es tuya para completar la configuración de tu cuenta. El enlace vence en 24 horas.',
      { label: 'Verificar mi correo', url: link },
    ),
  };
}
