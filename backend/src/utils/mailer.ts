import nodemailer, { type Transporter } from "nodemailer";
import { EventEmitter } from "node:events";
import { env } from "../config/env.js";

export interface OtpEmailEvent {
  to: string;
  otp: string;
  purpose: string;
}

// Typed view of the emitter: it only ever carries the "otp" event. Tests listen
// on it to read the plaintext OTP without needing a real mailbox.
interface OtpEventEmitter extends EventEmitter {
  emit(event: "otp", payload: OtpEmailEvent): boolean;
  on(event: "otp", listener: (payload: OtpEmailEvent) => void): this;
  off(event: "otp", listener: (payload: OtpEmailEvent) => void): this;
  once(event: "otp", listener: (payload: OtpEmailEvent) => void): this;
}

const otpEvents: OtpEventEmitter = new EventEmitter();

// `undefined` = not yet resolved; `null` = resolved to "no SMTP configured".
let transporter: Transporter | null | undefined;

const getTransporter = (): Transporter | null => {
  if (transporter !== undefined) {
    return transporter;
  }

  if (!env.SMTP_HOST) {
    // SMTP not configured (local dev/test) - fall back to logging
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

export { sendOtpEmail, otpEvents };
