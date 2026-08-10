// Integration tests for POST /api/v1/pc/:id/health-card, which sits behind
// the `auth` and `deptScope` middlewares. Access tokens are minted directly
// with generateAccessToken (same payload shape auth.service.js issues on
// login) so these tests don't need to go through the full OTP login flow
// just to exercise the health-card route and its department scoping.

import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import dotenv from "dotenv"
import mongoose from "mongoose"

dotenv.config()

const { app } = await import("../app.js")
const { Dept } = await import("../models/department.model.js")
const { Lab } = await import("../models/lab.model.js")
const { Pc } = await import("../models/pc.model.js")
const { ROLES } = await import("../config/constants.js")
const { generateAccessToken } = await import("../utils/tokenGeneration.js")

let server
let baseUrl
const cleanupIds = {
    pc: [],
    lab: [],
    dept: []
}

before(async () => {
    await mongoose.connect(process.env.MONGO_URL)
    server = app.listen(0)
    const { port } = server.address()
    baseUrl = `http://127.0.0.1:${port}`
})

after(async () => {
    if (cleanupIds.pc.length) {
        await Pc.deleteMany({ _id: { $in: cleanupIds.pc } })
    }
    if (cleanupIds.lab.length) {
        await Lab.deleteMany({ _id: { $in: cleanupIds.lab } })
    }
    if (cleanupIds.dept.length) {
        await Dept.deleteMany({ _id: { $in: cleanupIds.dept } })
    }

    await mongoose.disconnect()
    await new Promise((resolve) => server.close(resolve))
})

function randomSuffix() {
    return crypto.randomBytes(5).toString("hex")
}

function tokenFor({ role, department }) {
    return generateAccessToken({ _id: new mongoose.Types.ObjectId(), role, department })
}

async function fetchHealthCard(pcId, token) {
    const res = await fetch(`${baseUrl}/api/v1/pc/${pcId}/health-card`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    const body = await res.json()
    return { res, body }
}

async function makePc(overrides = {}) {
    const suffix = randomSuffix()
    const dept = await Dept.create({ name: `Health Card Dept ${suffix}`, code: `HCD${suffix.slice(0, 4)}` })
    const lab = await Lab.create({ name: `Health Card Lab ${suffix}`, department: dept._id })
    const pc = await Pc.create({
        deadStockNo: `HC-${suffix}`,
        department: dept._id,
        lab: lab._id,
        warranty: { status: "Active", expiryDate: new Date("2030-01-01T00:00:00.000Z") },
        config: {
            cpu: "Intel i7",
            ram: "16GB",
            disk: "512GB SSD",
            os: "Windows 11",
            software: ["Chrome", "VS Code"],
            lastSyncedAt: new Date()
        },
        ...overrides
    })

    cleanupIds.pc.push(pc._id)
    cleanupIds.lab.push(lab._id)
    cleanupIds.dept.push(dept._id)

    return { pc, dept, lab }
}

test("health card - rejects a request with no Authorization header (401)", async () => {
    const { pc } = await makePc()

    const { res, body } = await fetchHealthCard(pc._id)

    assert.equal(res.status, 401)
    assert.equal(body.success, false)
    assert.equal(body.message, "Authentication required")
})

test("health card - rejects an invalid/garbage token (401)", async () => {
    const { pc } = await makePc()

    const { res, body } = await fetchHealthCard(pc._id, "not-a-real-token")

    assert.equal(res.status, 401)
    assert.equal(body.success, false)
    assert.equal(body.message, "Invalid or expired token")
})

test("health card - returns the pc for a lab incharge scoped to the same department", async () => {
    const { pc, dept } = await makePc()
    const token = tokenFor({ role: ROLES.LAB_INCHARGE, department: dept._id })

    const { res, body } = await fetchHealthCard(pc._id, token)

    assert.equal(res.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.message, "PC health card fetched")
    assert.equal(body.data.deadStockNo, pc.deadStockNo)
    assert.equal(body.data.warranty.status, "Active")
    assert.equal(body.data.config.cpu, "Intel i7")
})

test("health card - returns 404 for a lab incharge in a different department", async () => {
    const { pc } = await makePc()
    const otherSuffix = randomSuffix()
    const otherDept = await Dept.create({ name: `Other Dept ${otherSuffix}`, code: `OD${otherSuffix.slice(0, 4)}` })
    cleanupIds.dept.push(otherDept._id)

    const token = tokenFor({ role: ROLES.LAB_INCHARGE, department: otherDept._id })

    const { res, body } = await fetchHealthCard(pc._id, token)

    assert.equal(res.status, 404)
    assert.equal(body.success, false)
    assert.equal(body.message, "Pc not found")
})

test("health card - admin can fetch a pc from any department", async () => {
    const { pc } = await makePc()
    const token = tokenFor({ role: ROLES.ADMIN, department: null })

    const { res, body } = await fetchHealthCard(pc._id, token)

    assert.equal(res.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.deadStockNo, pc.deadStockNo)
})

test("health card - deanInfra can fetch a pc from any department", async () => {
    const { pc } = await makePc()
    const token = tokenFor({ role: ROLES.DEAN_INFRA, department: null })

    const { res, body } = await fetchHealthCard(pc._id, token)

    assert.equal(res.status, 200)
    assert.equal(body.success, true)
})

test("health card - returns 404 for an unknown pc id", async () => {
    await makePc()
    const token = tokenFor({ role: ROLES.ADMIN, department: null })
    const unknownId = new mongoose.Types.ObjectId()

    const { res, body } = await fetchHealthCard(unknownId, token)

    assert.equal(res.status, 404)
    assert.equal(body.success, false)
    assert.equal(body.message, "Pc not found")
})
