import nodemailer from "nodemailer"
import { EventEmitter } from "node:events"

// emits "otp" whenever an OTP email is dispatched, used by tests to read the
// plaintext OTP without needing a real mailbox
const otpEvents = new EventEmitter()

let transporter

const getTransporter = () => {
    if (transporter !== undefined) {
        return transporter
    }

    if (!process.env.SMTP_HOST) {
        // SMTP not configured (local dev/test) - fall back to logging
        transporter = null
        return transporter
    }

    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    })

    return transporter
}

const sendOtpEmail = async ({ to, otp, purpose }) => {
    const subject = purpose === "login" ? "Your LABMON login OTP" : "Verify your LABMON email"
    const expiryMinutes = process.env.OTP_EXPIRY_MINUTES || 10
    const text = `Your OTP is ${otp}. It expires in ${expiryMinutes} minutes.`

    otpEvents.emit("otp", { to, otp, purpose })

    const transport = getTransporter()

    if (!transport) {
        console.log(`[mailer] SMTP not configured, OTP email to ${to}: ${text}`)
        return
    }

    await transport.sendMail({
        from: process.env.MAIL_FROM || "LABMON <no-reply@labmon.local>",
        to,
        subject,
        text
    })
}

export {
    sendOtpEmail,
    otpEvents
}
