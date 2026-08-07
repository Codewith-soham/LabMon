import express from "express"
import cors from "cors"
import morgan from "morgan"
import cors from "cors"
import helmet from "helmet"

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
app.use(express.static)
app.use(morgan("dev"))

export {app}