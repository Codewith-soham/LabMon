import jwt from "jsonwebtoken"

const generateAccessToken = (user) => {
    return jwt.sign(
        {
            id: user._id,
            role: user.role,
            department: user.department
        },
        process.env.JWT_ACCESS_TOKEN,
        {
            expiresIn: process.env.JWT_ACCESS_EXPIRY
        }
    )
}

const generateRefreshToken = (user) => {
    return jwt.sign(
        {
            userId: user._id,
        },
        process.env.JWT_REFRESH_TOKEN,
        {
            expiresIn: process.env.JWT_REFRESH_EXPIRY 
        }    
    )
}

export {
    generateAccessToken,
    generateRefreshToken
}