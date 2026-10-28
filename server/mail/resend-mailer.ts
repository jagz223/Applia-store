import { Resend } from "resend";

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export interface MailSender {
  send(message: MailMessage): Promise<void>;
}

function resolvePublicAppUrl(): string {
  const raw =
    process.env.APP_PUBLIC_URL?.trim() ||
    process.env.FRONTEND_URL?.trim() ||
    process.env.PUBLIC_SITE_URL?.trim() ||
    "";
  return raw.replace(/\/$/, "") || "http://localhost:5000";
}

function resolveMailFrom(): string {
  return process.env.MAIL_FROM?.trim() || "Applia <onboarding@resend.dev>";
}

class ResendMailSender implements MailSender {
  private client: Resend | null;

  constructor() {
    const key = process.env.RESEND_API_KEY?.trim();
    this.client = key ? new Resend(key) : null;
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.client) {
      console.warn("[mail] RESEND_API_KEY missing; skipped send to", message.to, message.subject);
      return;
    }
    const result = await this.client.emails.send({
      from: resolveMailFrom(),
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (result.error) {
      throw new Error(result.error.message || "RESEND_SEND_FAILED");
    }
  }
}

let sharedSender: MailSender | null = null;

export function getMailSender(): MailSender {
  if (!sharedSender) sharedSender = new ResendMailSender();
  return sharedSender;
}

export function getPublicAppUrl(): string {
  return resolvePublicAppUrl();
}

export function buildRegistrationSecurityEmail(params: {
  recipientName: string;
  verifyUrl: string;
  revokeUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = "Registro en Applia — confirma o anula si no fuiste tú";
  const text = [
    `Hola ${params.recipientName},`,
    "",
    "Se creó una cuenta en Applia con este correo.",
    `Si fuiste tú, confirma aquí: ${params.verifyUrl}`,
    `Si NO fuiste tú, anula el registro aquí: ${params.revokeUrl}`,
  ].join("\n");
  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
      <p>Hola ${escapeHtml(params.recipientName)},</p>
      <p>Te has registrado en <strong>Applia</strong> con este correo.</p>
      <p>
        <a href="${params.verifyUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:8px">
          Confirmar que soy yo
        </a>
      </p>
      <p>Si <strong>no fuiste tú</strong>, anula el registro:</p>
      <p>
        <a href="${params.revokeUrl}" style="display:inline-block;padding:10px 16px;background:#b91c1c;color:#fff;text-decoration:none;border-radius:8px">
          No fui yo — anular registro
        </a>
      </p>
    </div>
  `;
  return { subject, html, text };
}

export function buildPasswordResetEmail(params: {
  recipientName: string;
  resetUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = "Restablecer contraseña — Applia";
  const text = [
    `Hola ${params.recipientName},`,
    "",
    "Recibimos una solicitud para restablecer tu contraseña.",
    `Abre este enlace (válido por poco tiempo): ${params.resetUrl}`,
    "Si no solicitaste este cambio, ignora este correo.",
  ].join("\n");
  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
      <p>Hola ${escapeHtml(params.recipientName)},</p>
      <p>Recibimos una solicitud para restablecer tu contraseña en Applia.</p>
      <p>
        <a href="${params.resetUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:8px">
          Restablecer contraseña
        </a>
      </p>
      <p style="color:#555;font-size:14px">Si no solicitaste este cambio, ignora este correo.</p>
    </div>
  `;
  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
