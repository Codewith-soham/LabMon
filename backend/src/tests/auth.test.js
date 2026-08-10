// Integration tests for /api/v1/auth/register, /verify-email, /login and
// /verify-login-otp. Runs the real Express app in-process against MONGO_URL
// from .env, using randomly generated users each run so tests don't collide
// with each other or with real data. Created users are deleted again in
// `after`. SMTP is not configured in tests, so mailer.js falls back to
// logging the email and emitting an "otp" event - tests listen on that
// event to read the plaintext OTP instead of a real mailbox.

import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import dotenv from "dotenv"
import mongoose from "mongoose"

dotenv.config()

const { app } = await import("../app.js")
const { User } = await import("../models/user.model.js")
const { ROLES, OTP_PURPOSE } = await import("../config/constants.js")
const { otpEvents } = await import("../utils/mailer.js")

let server
let baseUrl
const createdUserIds = []

before(async () => {
    await mongoose.connect(process.env.MONGO_URL)
    server = app.listen(0)
    const { port } = server.address()
    baseUrl = `http://127.0.0.1:${port}`
})

after(async () => {
    if (createdUserIds.length) {
        await User.deleteMany({ _id: { $in: createdUserIds } })
    }
    await mongoose.disconnect()
    await new Promise((resolve) => server.close(resolve))
})

function randomUser(overrides = {}) {
    const id = crypto.randomBytes(6).toString("hex")
    return {
        name: `Test User ${id}`,
        email: `test.${id}@labmon.test`,
        password: `Pw_${crypto.randomBytes(8).toString("hex")}`,
        role: ROLES.LAB_INCHARGE,
        ...overrides
    }
}

async function postJson(path, payload) {
    const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
    const body = await res.json()
    return { res, body }
}

function waitForOtp(email, purpose) {
    return new Promise((resolve) => {
        const handler = (payload) => {
            if (payload.to === email && payload.purpose === purpose) {
                otpEvents.off("otp", handler)
                resolve(payload.otp)
            }
        }
        otpEvents.on("otp", handler)
    })
}

async function registerRandomUser(overrides = {}) {
    const payload = randomUser(overrides)
    const otpPromise = waitForOtp(payload.email, OTP_PURPOSE.EMAIL_VERIFICATION)
    const { res, body } = await postJson("/api/v1/auth/register", payload)
    if (res.status === 201) {
        createdUserIds.push(body.data._id)
    }
    const otp = await otpPromise
    return { payload, res, body, otp }
}

async function registerAndVerifyUser(overrides = {}) {
    const { payload, otp } = await registerRandomUser(overrides)
    await postJson("/api/v1/auth/verify-email", { email: payload.email, otp })
    return { payload }
}

test("register - creates a new, unverified user and never returns the password", async () => {
    const { res, body, payload } = await registerRandomUser()

    assert.equal(res.status, 201)
    assert.equal(body.success, true)
    assert.equal(body.data.email, payload.email)
    assert.equal(body.data.password, undefined)
    assert.equal(body.data.isEmailVerified, false)
})

test("register - rejects a duplicate email with 409", async () => {
    const { payload } = await registerRandomUser()

    const { res, body } = await postJson("/api/v1/auth/register", payload)

    assert.equal(res.status, 409)
    assert.equal(body.success, false)
})

test("verify-email - accepts the correct OTP and marks the user verified", async () => {
    const { payload, otp } = await registerRandomUser()

    const { res, body } = await postJson("/api/v1/auth/verify-email", { email: payload.email, otp })

    assert.equal(res.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.isEmailVerified, true)
})

test("verify-email - rejects an incorrect OTP with 400", async () => {
    const { payload } = await registerRandomUser()

    const { res, body } = await postJson("/api/v1/auth/verify-email", { email: payload.email, otp: "000000" })

    assert.equal(res.status, 400)
    assert.equal(body.success, false)
})

test("login - rejects an unverified account with 403", async () => {
    const { payload } = await registerRandomUser()

    const { res, body } = await postJson("/api/v1/auth/login", {
        email: payload.email,
        password: payload.password
    })

    assert.equal(res.status, 403)
    assert.equal(body.success, false)
})

test("login - succeeds with correct credentials, sends a login OTP, and completes login only after verification", async () => {
    const { payload } = await registerAndVerifyUser()

    const loginOtpPromise = waitForOtp(payload.email, OTP_PURPOSE.LOGIN)
    const { res: loginRes, body: loginBody } = await postJson("/api/v1/auth/login", {
        email: payload.email,
        password: payload.password
    })

    assert.equal(loginRes.status, 200)
    assert.equal(loginBody.success, true)

    const otp = await loginOtpPromise

    const { res, body } = await postJson("/api/v1/auth/verify-login-otp", { email: payload.email, otp })
    const cookies = res.headers.getSetCookie()

    assert.equal(res.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.user.email, payload.email)
    assert.ok(cookies.some((c) => c.startsWith("accessToken=")))
    assert.ok(cookies.some((c) => c.startsWith("refreshToken=")))
    assert.ok(cookies.every((c) => /HttpOnly/i.test(c)))
})

test("verify-login-otp - rejects an incorrect OTP with 400", async () => {
    const { payload } = await registerAndVerifyUser()

    await postJson("/api/v1/auth/login", { email: payload.email, password: payload.password })

    const { res, body } = await postJson("/api/v1/auth/verify-login-otp", { email: payload.email, otp: "000000" })

    assert.equal(res.status, 400)
    assert.equal(body.success, false)
})

test("login - rejects an incorrect password with 401", async () => {
    const { payload } = await registerAndVerifyUser()

    const { res, body } = await postJson("/api/v1/auth/login", {
        email: payload.email,
        password: "definitely-the-wrong-password"
    })

    assert.equal(res.status, 401)
    assert.equal(body.success, false)
})

test("login - rejects an unknown email with 401", async () => {
    const { res, body } = await postJson("/api/v1/auth/login", {
        email: `nobody.${crypto.randomBytes(6).toString("hex")}@labmon.test`,
        password: "whatever-password"
    })

    assert.equal(res.status, 401)
    assert.equal(body.success, false)
})