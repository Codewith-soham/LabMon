import { ApiError } from "../utils/ApiError"

const roleCheck = (...allowedRoles) => {
    return(res,req,next) => {
        if(!allowedRoles.includes(req.user.role)){
            throw new ApiError(401, "You do not have permission to perform this action")
        }
        next()
    }
}

export { roleCheck }