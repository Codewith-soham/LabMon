//scope for each role

import { ROLES } from "../config/constants.js"

const deptScope = (req, res, next) => {
    if (req.user.role === ROLES.ADMIN || req.user.role === ROLES.DEAN_INFRA) {
        req.scope = {}
    } else {
        req.scope = { department: req.user.department }
    }
    next()
}

export { deptScope }