// Integration tests for /api/v1/complaint: public raise + track, and the
// role/department-scoped escalate, resolve and list endpoints. Runs the real
// Express app in-process against MONGO_URL from .env. Access tokens are
// minted directly with generateAccessToken (same payload shape auth.service.js
// issues on login) so these tests don't need to go through the OTP login flow.

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
const { Complaint } = await import("../models/complaint.model.js")
const { ROLES, COMPLAINT_STATUS } = await import("../config/constants.js")
const { generateAccessToken } = await import("../utils/tokenGeneration.js")

let server
let baseUrl
const cleanupIds = {
    complaint: [],
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
    if (cleanupIds.complaint.length) {
        await Complaint.deleteMany({ _id: { $in: cleanupIds.complaint } })
    }
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

async function postJson(path, payload, token) {
    const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
    })
    const body = await res.json()
    return { res, body }
}

async function patchJson(path, payload, token) {
    const res = await fetch(`${baseUrl}${path}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
    })
    const body = await res.json()
    return { res, body }
}

async function getJson(path, token) {
    const res = await fetch(`${baseUrl}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    const body = await res.json()
    return { res, body }
}

async function makePc(overrides = {}) {
    const suffix = randomSuffix()
    const dept = await Dept.create({ name: `Complaint Dept ${suffix}`, code: `CD${suffix.slice(0, 4)}` })
    const lab = await Lab.create({ name: `Complaint Lab ${suffix}`, department: dept._id })
    const pc = await Pc.create({
        deadStockNo: `CMP-${suffix}`,
        department: dept._id,
        lab: lab._id,
        config: { cpu: "Intel i5", ram: "8GB", disk: "256GB", os: "Windows 11", software: [] },
        ...overrides
    })

    cleanupIds.pc.push(pc._id)
    cleanupIds.lab.push(lab._id)
    cleanupIds.dept.push(dept._id)

    return { pc, dept, lab }
}

async function raiseComplaint(pc, overrides = {}) {
    const { res, body } = await postJson("/api/v1/complaint", {
        deadStockNo: pc.deadStockNo,
        description: "Monitor not turning on",
        raisedBy: { name: "Test Student", contact: "9999999999" },
        ...overrides
    })

    if (res.status === 201) {
        cleanupIds.complaint.push(body.data._id)
    }

    return { res, body }
}

test("raise complaint - creates an Open complaint at labIncharge level for a valid deadStockNo", async () => {
    const { pc, dept, lab } = await makePc()

    const { res, body } = await raiseComplaint(pc)

    assert.equal(res.status, 201)
    assert.equal(body.success, true)
    assert.equal(body.data.status, COMPLAINT_STATUS.OPEN)
    assert.equal(body.data.currentLevel, ROLES.LAB_INCHARGE)
    assert.equal(body.data.department, String(dept._id))
    assert.equal(body.data.lab, String(lab._id))
    assert.ok(body.data.token)
    assert.equal(body.data.history.length, 1)
    assert.equal(body.data.history[0].action, "created")
})

test("raise complaint - returns 404 for an unknown deadStockNo", async () => {
    const { res, body } = await postJson("/api/v1/complaint", {
        deadStockNo: `missing-${randomSuffix()}`,
        description: "Broken",
        raisedBy: { name: "Test Student", contact: "9999999999" }
    })

    assert.equal(res.status, 404)
    assert.equal(body.success, false)
    assert.equal(body.message, "PC not found")
})

test("track complaint - returns status by token", async () => {
    const { pc } = await makePc()
    const { body: created } = await raiseComplaint(pc)

    const { res, body } = await getJson(`/api/v1/complaint/track/${created.data.token}`)

    assert.equal(res.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.token, created.data.token)
    assert.equal(body.data.status, COMPLAINT_STATUS.OPEN)
})

test("track complaint - returns 404 for an unknown token", async () => {
    const { res, body } = await getJson(`/api/v1/complaint/track/does-not-exist`)

    assert.equal(res.status, 404)
    assert.equal(body.success, false)
    assert.equal(body.message, "Invalid tracking token")
})

test("escalate complaint - labIncharge in the same department moves it to hod/Escalated_HOD", async () => {
    const { pc, dept } = await makePc()
    const { body: created } = await raiseComplaint(pc)
    const token = tokenFor({ role: ROLES.LAB_INCHARGE, department: dept._id })

    const { res, body } = await patchJson(`/api/v1/complaint/${created.data._id}/escalate`, {}, token)

    assert.equal(res.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.currentLevel, ROLES.HOD)
    assert.equal(body.data.status, COMPLAINT_STATUS.ESCALATED_HOD)
    assert.equal(body.data.history.at(-1).action, "escalated")
})

test("escalate complaint - rejects a labIncharge from a different department (403)", async () => {
    const { pc } = await makePc()
    const { body: created } = await raiseComplaint(pc)
    const otherSuffix = randomSuffix()
    const otherDept = await Dept.create({ name: `Other Complaint Dept ${otherSuffix}`, code: `OCD${otherSuffix.slice(0, 4)}` })
    cleanupIds.dept.push(otherDept._id)

    const token = tokenFor({ role: ROLES.LAB_INCHARGE, department: otherDept._id })
    const { res, body } = await patchJson(`/api/v1/complaint/${created.data._id}/escalate`, {}, token)

    assert.equal(res.status, 403)
    assert.equal(body.success, false)
})

test("escalate complaint - rejects a hod trying to escalate a complaint still at labIncharge level (403)", async () => {
    const { pc, dept } = await makePc()
    const { body: created } = await raiseComplaint(pc)
    const token = tokenFor({ role: ROLES.HOD, department: dept._id })

    const { res, body } = await patchJson(`/api/v1/complaint/${created.data._id}/escalate`, {}, token)

    assert.equal(res.status, 403)
    assert.equal(body.success, false)
    assert.equal(body.message, "Only the current level's incharge can escalate this complaint")
})

test("escalate complaint - deanInfra is not permitted to escalate further (403, top of chain)", async () => {
    const { pc, dept } = await makePc()
    const { body: created } = await raiseComplaint(pc)
    const inchargeToken = tokenFor({ role: ROLES.LAB_INCHARGE, department: dept._id })
    const hodToken = tokenFor({ role: ROLES.HOD, department: dept._id })
    const deanToken = tokenFor({ role: ROLES.DEAN_INFRA, department: dept._id })

    await patchJson(`/api/v1/complaint/${created.data._id}/escalate`, {}, inchargeToken)
    await patchJson(`/api/v1/complaint/${created.data._id}/escalate`, {}, hodToken)
    const { res, body } = await patchJson(`/api/v1/complaint/${created.data._id}/escalate`, {}, deanToken)

    assert.equal(res.status, 403)
    assert.equal(body.success, false)
    assert.equal(body.message, "You do not have permission to perform this action")
})

test("resolve complaint - labIncharge resolves an Open complaint at their level", async () => {
    const { pc, dept } = await makePc()
    const { body: created } = await raiseComplaint(pc)
    const token = tokenFor({ role: ROLES.LAB_INCHARGE, department: dept._id })

    const { res, body } = await patchJson(`/api/v1/complaint/${created.data._id}/resolve`, { remarks: "Replaced cable" }, token)

    assert.equal(res.status, 200)
    assert.equal(body.success, true)
    assert.equal(body.data.status, COMPLAINT_STATUS.RESOLVED)
    assert.equal(body.data.history.at(-1).action, "resolved")
    assert.equal(body.data.history.at(-1).note, "Replaced cable")
})

test("resolve complaint - rejects resolving an already-resolved complaint (400)", async () => {
    const { pc, dept } = await makePc()
    const { body: created } = await raiseComplaint(pc)
    const token = tokenFor({ role: ROLES.LAB_INCHARGE, department: dept._id })

    await patchJson(`/api/v1/complaint/${created.data._id}/resolve`, {}, token)
    const { res, body } = await patchJson(`/api/v1/complaint/${created.data._id}/resolve`, {}, token)

    assert.equal(res.status, 400)
    assert.equal(body.success, false)
    assert.equal(body.message, "Complaint is already resolved")
})

test("list complaints - a labIncharge only sees complaints from their own department", async () => {
    const { pc: ownPc, dept: ownDept } = await makePc()
    const { pc: otherPc } = await makePc()
    const { body: ownComplaint } = await raiseComplaint(ownPc)
    await raiseComplaint(otherPc)

    const token = tokenFor({ role: ROLES.LAB_INCHARGE, department: ownDept._id })
    const { res, body } = await getJson("/api/v1/complaint", token)

    assert.equal(res.status, 200)
    assert.equal(body.success, true)
    assert.ok(body.data.every((c) => c.department === String(ownDept._id)))
    assert.ok(body.data.some((c) => c._id === ownComplaint.data._id))
})

test("list complaints - deanInfra sees complaints across all departments", async () => {
    const { pc } = await makePc()
    const { body: created } = await raiseComplaint(pc)

    const token = tokenFor({ role: ROLES.DEAN_INFRA, department: null })
    const { res, body } = await getJson("/api/v1/complaint", token)

    assert.equal(res.status, 200)
    assert.equal(body.success, true)
    assert.ok(body.data.some((c) => c._id === created.data._id))
})

test("list complaints - rejects a request with no Authorization header (401)", async () => {
    const { res, body } = await getJson("/api/v1/complaint")

    assert.equal(res.status, 401)
    assert.equal(body.success, false)
    assert.equal(body.message, "Authentication required")
})
