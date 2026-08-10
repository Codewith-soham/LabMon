import jwt from "jsonwebtoken"
import { ApiError } from "../utils/ApiError.js"

const auth = (req, res, next) => {
    const authHeader = req.headers.authorization

    if(!authHeader || !authHeader.startsWith("Bearer")){
        throw new ApiError(401, "Authentication required")
    }

    const token = authHeader.split(" ")[1]

    try{
        const decoded = jwt.verify(
            token,
            process.env.JWT_ACCESS_TOKEN
        )

        req.user = decoded

        next()
    }catch(error){
        throw new ApiError(401, "Invalid or expired token")
    }
}

export { auth }