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

//parses "15m" / "7d" / "30s" / "1h" style durations (matches jsonwebtoken's expiresIn format) into milliseconds
const parseExpiryToMs = (expiry) => {
    const match = /^(\d+)(s|m|h|d)$/.exec(expiry)

    if(!match){
        throw new Error(`Unrecognized expiry format: ${expiry}`)
    }

    const value = Number(match[1])
    const unitMs = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 }

    return value * unitMs[match[2]]
}

export {
    generateAccessToken,
    generateRefreshToken,
    parseExpiryToMs
}