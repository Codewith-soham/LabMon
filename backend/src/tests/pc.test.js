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

async function postJson(path, payload) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })

  const body = await res.json()
  return { res, body }
}

function randomSuffix() {
  return crypto.randomBytes(5).toString("hex")
}

test("pc sync - updates config and lastSyncedAt for a valid deadStockNo", async () => {
  const suffix = randomSuffix()
  const dept = await Dept.create({ name: `PC Sync Dept ${suffix}`, code: `PSD${suffix.slice(0, 4)}` })
  const lab = await Lab.create({ name: `PC Sync Lab ${suffix}`, department: dept._id })
  const pc = await Pc.create({
    deadStockNo: `PC-${suffix}`,
    department: dept._id,
    lab: lab._id,
    config: {
      cpu: "Old CPU",
      ram: "8GB",
      disk: "256GB",
      os: "Old OS",
      software: ["Old App"],
      lastSyncedAt: new Date("2020-01-01T00:00:00.000Z")
    }
  })

  cleanupIds.pc.push(pc._id)
  cleanupIds.lab.push(lab._id)
  cleanupIds.dept.push(dept._id)

  const payload = {
    deadStockNo: pc.deadStockNo,
    config: {
      cpu: "Intel i5",
      ram: "16GB",
      disk: "512GB SSD",
      os: "Windows 11",
      software: ["Chrome", "VS Code"]
    }
  }

  const beforeRequest = Date.now()
  const { res, body } = await postJson("/api/v1/pc/sync", payload)
  const afterRequest = Date.now()

  assert.equal(res.status, 200)
  assert.equal(body.success, true)
  assert.equal(body.statusCode, 200)
  assert.equal(body.message, "PC config updated")
  assert.equal(body.data.deadStockNo, pc.deadStockNo)
  assert.equal(body.data.config.cpu, payload.config.cpu)
  assert.deepEqual(body.data.config.software, payload.config.software)
  assert.ok(body.data.config.lastSyncedAt)

  const lastSyncedAt = new Date(body.data.config.lastSyncedAt).getTime()
  assert.ok(lastSyncedAt >= beforeRequest)
  assert.ok(lastSyncedAt <= afterRequest + 1000)

  const persisted = await Pc.findById(pc._id).lean()
  assert.equal(new Date(persisted.config.lastSyncedAt).getTime(), lastSyncedAt)
  assert.deepEqual(persisted.config.software, payload.config.software)
})

test("pc sync - returns 404 with the documented message for an unknown deadStockNo", async () => {
  const suffix = randomSuffix()
  const { res, body } = await postJson("/api/v1/pc/sync", {
    deadStockNo: `missing-${suffix}`,
    config: {
      cpu: "Intel i3",
      ram: "8GB",
      disk: "256GB SSD",
      os: "Windows 10",
      software: ["Chrome"]
    }
  })

  assert.equal(res.status, 404)
  assert.equal(body.success, false)
  assert.equal(body.statusCode, 404)
  assert.equal(body.message, "PC not found. Check dead stock number.")
})