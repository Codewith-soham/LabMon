import nodemailer, { type Transporter } from "nodemailer";
import { EventEmitter } from "node:events";
import { env } from "../config/env.js";

export interface OtpEmailEvent {
  to: string;
  otp: string;
  purpose: string;
}

export interface CredentialsEmailArgs {
  to: string;
  name: string;
  email: string;
  password: string;
  role: string;
  departmentName?: string | undefined;
}

// Typed view of the emitter: tests listen on it without needing a real mailbox.
interface MailerEventEmitter extends EventEmitter {
  emit(event: "otp", payload: OtpEmailEvent): boolean;
  emit(event: "credentials", payload: CredentialsEmailArgs): boolean;
  on(event: "otp", listener: (payload: OtpEmailEvent) => void): this;
  on(event: "credentials", listener: (payload: CredentialsEmailArgs) => void): this;
  off(event: "otp", listener: (payload: OtpEmailEvent) => void): this;
  off(event: "credentials", listener: (payload: CredentialsEmailArgs) => void): this;
  once(event: "otp", listener: (payload: OtpEmailEvent) => void): this;
  once(event: "credentials", listener: (payload: CredentialsEmailArgs) => void): this;
}

const otpEvents: MailerEventEmitter = new EventEmitter();

// `undefined` = not yet resolved; `null` = resolved to "no SMTP configured".
let transporter: Transporter | null | undefined;

const getTransporter = (): Transporter | null => {
  if (transporter !== undefined) {
    return transporter;
  }

  if (!env.SMTP_HOST || env.NODE_ENV === "test") {
    // SMTP not configured or running in test environment - fall back to logging and events
    transporter = null;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_SECURE === true,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  return transporter;
};

interface SendOtpEmailArgs {
  to: string;
  otp: string;
  purpose: string;
}

const sendOtpEmail = async ({ to, otp, purpose }: SendOtpEmailArgs): Promise<void> => {
  const subject = purpose === "login" ? "Your LABMON login OTP" : "Verify your LABMON email";
  const expiryMinutes = env.OTP_EXPIRY_MINUTES || 10;
  const text = `Your OTP is ${otp}. It expires in ${expiryMinutes} minutes.`;

  otpEvents.emit("otp", { to, otp, purpose });

  const transport = getTransporter();

  if (!transport) {
    console.log(`[mailer] SMTP not configured, OTP email to ${to}: ${text}`);
    return;
  }

  await transport.sendMail({
    from: env.MAIL_FROM ?? "LABMON <no-reply@labmon.local>",
    to,
    subject,
    text,
  });
};

const sendCredentialsEmail = async ({
  to,
  name,
  email,
  password,
  role,
  departmentName,
}: CredentialsEmailArgs): Promise<void> => {
  const roleLabel =
    role === "hod"
      ? "Head of Department (HOD)"
      : role === "labIncharge"
        ? "Lab Incharge"
        : role;

  const frontendBase = env.FRONTEND_URL || "http://localhost:5173";
  const loginUrl = `${frontendBase.replace(/\/+$/, "")}/login`;
  const deptText = departmentName ? ` for the ${departmentName} Department` : "";

  const subject = `Welcome to LABMON - Your ${roleLabel} Account Credentials`;
  const text = `Hello ${name},

You have been registered as a ${roleLabel}${deptText} on LABMON.

Here are your login credentials:
Email: ${email}
Password: ${password}

Please log in at ${loginUrl} using these credentials.

Regards,
LABMON Administration`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #0f172a; margin-top: 0;">Welcome to LABMON</h2>
      <p>Hello <strong>${name}</strong>,</p>
      <p>You have been registered as a <strong>${roleLabel}</strong>${deptText ? ` for the <strong>${departmentName}</strong> Department` : ""} on LABMON.</p>
      <div style="background-color: #f8fafc; border-left: 4px solid #e66a0a; padding: 16px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Email:</strong> ${email}</p>
        <p style="margin: 0; font-size: 14px;"><strong>Password:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${password}</code></p>
      </div>
      <p>Please log in to your account using the credentials above:</p>
      <div style="margin: 24px 0;">
        <a href="${loginUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #e66a0a; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-family: Arial, sans-serif; font-size: 15px;">Log In to LABMON</a>
      </div>
      <p style="font-size: 13px; color: #64748b; margin-top: 12px; word-break: break-all;">
        Or click/paste this URL into your browser: <br/>
        <a href="${loginUrl}" target="_blank" rel="noopener noreferrer" style="color: #e66a0a; font-weight: 500;">${loginUrl}</a>
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 12px; color: #64748b; margin: 0;">This is an automated message from LABMON Administration. Please do not reply directly to this email.</p>
    </div>
  `;

  otpEvents.emit("credentials", { to, name, email, password, role, departmentName });

  const transport = getTransporter();

  if (!transport) {
    console.log(`[mailer] SMTP not configured, credentials email to ${to}: password=${password}`);
    return;
  }

  try {
    await transport.sendMail({
      from: env.MAIL_FROM ?? "LABMON <no-reply@labmon.local>",
      to,
      subject,
      text,
      html,
    });
  } catch (error) {
    console.error(
      `[mailer] SMTP send failed for ${to} (${(error as Error).message}). Account was still created. Fallback credentials log: email=${email}, password=${password}`,
    );
  }
};

export { sendOtpEmail, sendCredentialsEmail, otpEvents };
