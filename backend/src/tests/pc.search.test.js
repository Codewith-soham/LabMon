// Integration tests for GET /api/v1/pc/search. Runs the real Express app
// in-process against MONGO_URL from .env. Seeds two departments (each with
// one lab and a couple of PCs) plus one user per role (labIncharge/hod in
// dept A, labIncharge in dept B, deanInfra with no department, admin with no
// department) and logs each in through the real OTP flow, mirroring the
// pattern in auth.test.js. All seeded data is deleted again in `after`.

import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import dotenv from "dotenv"
import mongoose from "mongoose"

dotenv.config()

const { app } = await import("../app.js")
const { User } = await import("../models/user.model.js")
const { Dept } = await import("../models/department.model.js")
const { Lab } = await import("../models/lab.model.js")
const { Pc } = await import("../models/pc.model.js")
const { ROLES, OTP_PURPOSE } = await import("../config/constants.js")
const { otpEvents } = await import("../utils/mailer.js")

let server
let baseUrl

const createdUserIds = []
const createdDeptIds = []
const createdLabIds = []
const createdPcIds = []

// per-role access tokens, populated in `before`
const tokens = {}

// seeded PCs, populated in `before`
let pcs = {}

before(async () => {
    await mongoose.connect(process.env.MONGO_URL)
    server = app.listen(0)
    const { port } = server.address()
    baseUrl = `http://127.0.0.1:${port}`

    const suffix = crypto.randomBytes(6).toString("hex")

    // --- departments & labs ---
    const deptA = await Dept.create({ name: `Dept A ${suffix}`, code: `DA${suffix}` })
    const deptB = await Dept.create({ name: `Dept B ${suffix}`, code: `DB${suffix}` })
    createdDeptIds.push(deptA._id, deptB._id)

    const labA = await Lab.create({ name: `Lab A ${suffix}`, department: deptA._id })
    const labB = await Lab.create({ name: `Lab B ${suffix}`, department: deptB._id })
    createdLabIds.push(labA._id, labB._id)

    // --- PCs ---
    const pcA1 = await Pc.create({
        deadStockNo: `DSN-A1-${suffix}`,
        department: deptA._id,
        lab: labA._id,
        warranty: { status: "Active" },
        config: { cpu: "Intel Core i5-10400", ram: "16GB", disk: "512GB SSD", os: "Windows 11", software: ["Google Chrome", "VS Code"] }
    })
    const pcA2 = await Pc.create({
        deadStockNo: `DSN-A2-${suffix}`,
        department: deptA._id,
        lab: labA._id,
        warranty: { status: "Expired" },
        config: { cpu: "AMD Ryzen 5 5600", ram: "8GB", disk: "1TB HDD", os: "Ubuntu 22.04", software: ["Firefox"] }
    })
    const pcB1 = await Pc.create({
        deadStockNo: `DSN-B1-${suffix}`,
        department: deptB._id,
        lab: labB._id,
        warranty: { status: "Active" },
        config: { cpu: "Intel Core i5-11400", ram: "16GB", disk: "512GB SSD", os: "Windows 11", software: ["Google Chrome"] }
    })
    createdPcIds.push(pcA1._id, pcA2._id, pcB1._id)
    pcs = { pcA1, pcA2, pcB1 }

    // --- users, one per role we need tokens for ---
    tokens.labIncharge = await registerLoginAndGetToken({ role: ROLES.LAB_INCHARGE, department: deptA._id })
    tokens.hod = await registerLoginAndGetToken({ role: ROLES.HOD, department: deptA._id })
    tokens.labInchargeB = await registerLoginAndGetToken({ role: ROLES.LAB_INCHARGE, department: deptB._id })
    tokens.deanInfra = await registerLoginAndGetToken({ role: ROLES.DEAN_INFRA })
    tokens.admin = await registerLoginAndGetToken({ role: ROLES.ADMIN })
})

after(async () => {
    if (createdPcIds.length) await Pc.deleteMany({ _id: { $in: createdPcIds } })
    if (createdLabIds.length) await Lab.deleteMany({ _id: { $in: createdLabIds } })
    if (createdDeptIds.length) await Dept.deleteMany({ _id: { $in: createdDeptIds } })
    if (createdUserIds.length) await User.deleteMany({ _id: { $in: createdUserIds } })
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

async function postJson(path, payload, extraHeaders = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...extraHeaders },
        body: JSON.stringify(payload)
    })
    const body = await res.json()
    return { res, body }
}

async function getJson(path, { token } = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    const body = await res.json()
    return { res, body }
}

function extractCookie(setCookieHeaders, name) {
    const match = setCookieHeaders.find((c) => c.startsWith(`${name}=`))
    return match ? match.split(";")[0].slice(name.length + 1) : undefined
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

// registers, verifies email, logs in, verifies the login otp, and returns
// the resulting access token as a plain string (ready for an Authorization
// header, same as the accessToken cookie used in auth.test.js's logout test)
async function registerLoginAndGetToken(overrides = {}) {
    const payload = randomUser(overrides)

    const emailOtpPromise = waitForOtp(payload.email, OTP_PURPOSE.EMAIL_VERIFICATION)
    const { res: registerRes, body: registerBody } = await postJson("/api/v1/auth/register", payload)
    assert.equal(registerRes.status, 201, `setup: register failed for ${payload.email}: ${JSON.stringify(registerBody)}`)
    createdUserIds.push(registerBody.data._id)
    const emailOtp = await emailOtpPromise
    await postJson("/api/v1/auth/verify-email", { email: payload.email, otp: emailOtp })

    const loginOtpPromise = waitForOtp(payload.email, OTP_PURPOSE.LOGIN)
    await postJson("/api/v1/auth/login", { email: payload.email, password: payload.password })
    const loginOtp = await loginOtpPromise

    const { res, body } = await postJson("/api/v1/auth/verify-login-otp", { email: payload.email, otp: loginOtp })
    assert.equal(res.status, 200, `setup: login failed for ${payload.email}: ${JSON.stringify(body)}`)

    return extractCookie(res.headers.getSetCookie(), "accessToken")
}

test("search - rejects a request with no Authorization header (401)", async () => {
    const { res, body } = await getJson("/api/v1/pc/search")

    assert.equal(res.status, 401)
    assert.equal(body.success, false)
})

test("search - rejects a role not permitted to search (admin, 403)", async () => {
    const { res, body } = await getJson("/api/v1/pc/search", { token: tokens.admin })

    assert.equal(res.status, 403)
    assert.equal(body.success, false)
})

test("search - labIncharge with no filters sees only PCs in their own department", async () => {
    const { res, body } = await getJson("/api/v1/pc/search", { token: tokens.labIncharge })

    assert.equal(res.status, 200)
    assert.equal(body.success, true)
    const ids = body.data.map((pc) => pc._id)
    assert.ok(ids.includes(String(pcs.pcA1._id)))
    assert.ok(ids.includes(String(pcs.pcA2._id)))
    assert.ok(!ids.includes(String(pcs.pcB1._id)))
})

test("search - hod with no filters sees only PCs in their own department", async () => {
    const { res, body } = await getJson("/api/v1/pc/search", { token: tokens.hod })

    assert.equal(res.status, 200)
    const ids = body.data.map((pc) => pc._id)
    assert.ok(ids.includes(String(pcs.pcA1._id)))
    assert.ok(!ids.includes(String(pcs.pcB1._id)))
})

test("search - deanInfra with no filters sees PCs across all departments", async () => {
    const { res, body } = await getJson("/api/v1/pc/search", { token: tokens.deanInfra })

    assert.equal(res.status, 200)
    const ids = body.data.map((pc) => pc._id)
    assert.ok(ids.includes(String(pcs.pcA1._id)))
    assert.ok(ids.includes(String(pcs.pcB1._id)))
})

test("search - cpu filter matches partially and case-insensitively, within department scope", async () => {
    const { res, body } = await getJson("/api/v1/pc/search?cpu=intel", { token: tokens.labIncharge })

    assert.equal(res.status, 200)
    const ids = body.data.map((pc) => pc._id)
    assert.ok(ids.includes(String(pcs.pcA1._id)))
    assert.ok(!ids.includes(String(pcs.pcA2._id))) // AMD, filtered out
})

test("search - software filter matches an element of the software array", async () => {
    const { res, body } = await getJson("/api/v1/pc/search?software=chrome", { token: tokens.deanInfra })

    assert.equal(res.status, 200)
    const ids = body.data.map((pc) => pc._id)
    assert.ok(ids.includes(String(pcs.pcA1._id)))
    assert.ok(ids.includes(String(pcs.pcB1._id)))
    assert.ok(!ids.includes(String(pcs.pcA2._id))) // only has Firefox
})

test("search - warrantyStatus filter matches exactly", async () => {
    const { res, body } = await getJson("/api/v1/pc/search?warrantyStatus=Expired", { token: tokens.labIncharge })

    assert.equal(res.status, 200)
    const ids = body.data.map((pc) => pc._id)
    assert.deepEqual(ids, [String(pcs.pcA2._id)])
})

test("search - a department-scoped role cannot see another department's PC even with a matching filter", async () => {
    const { res, body } = await getJson("/api/v1/pc/search?cpu=intel", { token: tokens.labIncharge })

    assert.equal(res.status, 200)
    const ids = body.data.map((pc) => pc._id)
    assert.ok(!ids.includes(String(pcs.pcB1._id)))
})

test("search - rejects an invalid warrantyStatus with 400", async () => {
    const { res, body } = await getJson("/api/v1/pc/search?warrantyStatus=bogus", { token: tokens.hod })

    assert.equal(res.status, 400)
    assert.equal(body.success, false)
})

test("search - rejects an invalid lab id with 400", async () => {
    const { res, body } = await getJson("/api/v1/pc/search?lab=not-an-object-id", { token: tokens.hod })

    assert.equal(res.status, 400)
    assert.equal(body.success, false)
})

test("search - regex metacharacters in a filter are treated literally, not as a pattern", async () => {
    const { res, body } = await getJson(`/api/v1/pc/search?${new URLSearchParams({ cpu: "i5(" }).toString()}`, { token: tokens.labIncharge })

    assert.equal(res.status, 200)
    assert.equal(body.data.length, 0) // no cpu literally contains "i5(" - must not throw or match everything
})
