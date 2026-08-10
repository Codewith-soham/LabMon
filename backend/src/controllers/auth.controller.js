import {registerUser, verifyEmailOtp, loginUser, verifyLoginOtp} from "../services/auth.service.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {ApiError} from "../utils/ApiError.js"

const cookieOptions = {
    httpOnly: true, //js cannot read my cookiee in browser
    secure: process.env.NODE_ENV === "production", //only send it over https in production
    sameSite: "strict" //cannot send in cross-site production
}

const register = asyncHandler(async(req,res) => {
    const user = await registerUser(req.body)

    return res.status(201).json(new ApiResponse(201, user, "User registered. Check your email for the verification OTP"))
})

const verifyEmail = asyncHandler(async(req,res) => {
    const {email, otp} = req.body
    const user = await verifyEmailOtp({email, otp})

    return res.status(200).json(new ApiResponse(200, user, "Email verified successfully"))
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
            maxAge: 15 * 60 * 1000 // 15m, matches JWT_ACCESS_EXPIRY
        })
        .cookie("refreshToken", refreshToken, {
            ...cookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7d, matches JWT_REFRESH_EXPIRY
        })
        .json(new ApiResponse(200, {user}, "Login successful"))
})

export { register, verifyEmail, login, verifyLogin }