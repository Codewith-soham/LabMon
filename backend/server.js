import dotenv from "dotenv"
dotenv.config({
   path: ".env" 
})
import {app} from "./src/app.js"
import connectDB from "./src/config/db.config.js"

const PORT = process.env.PORT

connectDB()
    .then(() => {
        const server = app.listen(PORT, () => {
            console.log(`Server connected to ${PORT}`)
        })
    })
    .catch((err) => {
        console.error("Failed to connect database")
    })
