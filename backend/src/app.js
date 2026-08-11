import express from "express"
import cors from "cors"
import morgan from "morgan"
import helmet from "helmet"
import cookieParser from "cookie-parser"

const app = express()

app.use(helmet())

app.use(
    cors({
        origin:  process.env.CORS_ORIGIN || "http://localhost:3000",
        credentials: true
    })
)

app.use(express.json({limit: "10mb"}))
app.use(express.urlencoded({extended: true, limit: "10mb"}))
app.use(cookieParser())
app.use(morgan("dev"))

import authRouter from "../src/routes/auth.route.js"
import pcRouter from "../src/routes/pc.route.js"
import complaintRouter from "../src/routes/complaint.route.js"
import { errorHandler } from "./middlewares/error.middleware.js"

app.use("/api/v1/auth", authRouter)
app.use("/api/v1/pc", pcRouter)
app.use("api/v1/complaint", complaintRouter)

app.use(errorHandler)

export {app}