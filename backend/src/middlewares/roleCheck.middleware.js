import { ApiError } from "../utils/ApiError.js"

const roleCheck = (...allowedRoles) => {
    return (req, res, next) => {
        if(!allowedRoles.includes(req.user.role)){
            throw new ApiError(403, "You do not have permission to perform this action")
        }
        next()
    }
}

export { roleCheck }