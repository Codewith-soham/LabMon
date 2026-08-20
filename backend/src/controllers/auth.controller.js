import {registerUser, verifyEmailOtp, resendOtp, loginUser, verifyLoginOtp, refreshAccessToken, logoutUser} from "../services/auth.service.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {ApiError} from "../utils/ApiError.js"
import {parseExpiryToMs} from "../utils/tokenGeneration.js"

const cookieOptions = {
    httpOnly: true, //js cannot read my cookiee in browser
    secure: process.env.NODE_ENV === "production", //only send it over https in production
    sameSite: "strict" //cannot send in cross-site production
}

const ACCESS_TOKEN_MAX_AGE = parseExpiryToMs(process.env.JWT_ACCESS_EXPIRY)
const REFRESH_TOKEN_MAX_AGE = parseExpiryToMs(process.env.JWT_REFRESH_EXPIRY)

const register = asyncHandler(async(req,res) => {
    const user = await registerUser(req.body)

    return res.status(201).json(new ApiResponse(201, user, "User registered. Check your email for the verification OTP"))
})

const verifyEmail = asyncHandler(async(req,res) => {
    const {email, otp} = req.body
    const user = await verifyEmailOtp({email, otp})

    return res.status(200).json(new ApiResponse(200, user, "Email verified successfully"))
})

const resend = asyncHandler(async(req,res) => {
    const {email, purpose} = req.body
    const result = await resendOtp({email, purpose})

    return res.status(200).json(new ApiResponse(200, result, "OTP resent successfully"))
})

const login = asyncHandler(async(req,res) => {
    const result = await loginUser(req.body)

    return res.status(200).json(new ApiResponse(200, result, "OTP sent to your email, please verify to complete login"))
})

const verifyLogin = asyncHandler(async(req,res) => {
    const {email, otp} = req.body
    const {user, accessToken, refreshToken} = await verifyLoginOtp({email, otp})

    return res
        .status(200)
        .cookie("accessToken", accessToken, {
            ...cookieOptions,
            maxAge: ACCESS_TOKEN_MAX_AGE
        })
        .cookie("refreshToken", refreshToken, {
            ...cookieOptions,
            maxAge: REFRESH_TOKEN_MAX_AGE
        })
        .json(new ApiResponse(200, {user}, "Login successful"))
})

const refresh = asyncHandler(async(req,res) => {
    const {accessToken, refreshToken} = await refreshAccessToken(req.cookies?.refreshToken)

    return res
        .status(200)
        .cookie("accessToken", accessToken, {
            ...cookieOptions,
            maxAge: ACCESS_TOKEN_MAX_AGE
        })
        .cookie("refreshToken", refreshToken, {
            ...cookieOptions,
            maxAge: REFRESH_TOKEN_MAX_AGE
        })
        .json(new ApiResponse(200, {}, "Access token refreshed"))
})

const logout = asyncHandler(async(req,res) => {
    await logoutUser(req.user?.id)

    return res
        .status(200)
        .clearCookie("accessToken", cookieOptions)
        .clearCookie("refreshToken", cookieOptions)
        .json(new ApiResponse(200, {}, "Logged out successfully"))
})

export { register, verifyEmail, resend, login, verifyLogin, refresh, logout }