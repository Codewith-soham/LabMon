// Integration tests for /api/v1/auth/register and /api/v1/auth/login.
// Runs the real Express app in-process against MONGO_URL from .env, using
// randomly generated users each run so tests don't collide with each other
// or with real data. Created users are deleted again in `after`.

import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import dotenv from "dotenv"
import mongoose from "mongoose"

dotenv.config()

const { app } = await import("../app.js")
const { User } = await import("../models/user.model.js")
const { ROLES } = await import("../config/constants.js")

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

async function registerRandomUser(overrides = {}) {
    const payload = randomUser(overrides)
    const { res, body } = await postJson("/api/v1/auth/register", payload)
    if (res.status === 201) {
        createdUserIds.push(body.data._id)
    }
    return { payload, res, body }
}

test("register - creates a new user and never returns the password", async () => {
    const { res, body, payload } = await registerRandomUser()

    assert.equal(res.status, 201)
    assert.equal(body.success, true)
    assert.equal(body.data.email, payload.email)
    assert.equal(body.data.password, undefined)
})

test("register - rejects a duplicate email with 409", async () => {
    const { payload } = await registerRandomUser()

    const { res, body } = await postJson("/api/v1/auth/register", payload)

    assert.equal(res.status, 409)
    assert.equal(body.success, false)
})

test("login - succeeds with correct email, password and role, and sets auth cookies", async () => {
    const { payload } = await registerRandomUser()

    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: payload.email,
            password: payload.password,
            role: payload.role
        })
    })
    const body = await res.json()

    assert.equal(res.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.user.email, payload.email)

    const cookies = res.headers.getSetCookie()
    assert.ok(cookies.some((c) => c.startsWith("accessToken=")))
    assert.ok(cookies.some((c) => c.startsWith("refreshToken=")))
    assert.ok(cookies.every((c) => /HttpOnly/i.test(c)))
})

test("login - rejects an incorrect password with 401", async () => {
    const { payload } = await registerRandomUser()

    const { res, body } = await postJson("/api/v1/auth/login", {
        email: payload.email,
        password: "definitely-the-wrong-password",
        role: payload.role
    })

    assert.equal(res.status, 401)
    assert.equal(body.success, false)
})

test("login - rejects an unknown email with 401", async () => {
    const { res, body } = await postJson("/api/v1/auth/login", {
        email: `nobody.${crypto.randomBytes(6).toString("hex")}@labmon.test`,
        password: "whatever-password",
        role: ROLES.LAB_INCHARGE
    })

    assert.equal(res.status, 401)
    assert.equal(body.success, false)
})
