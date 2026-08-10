import bcrypt from "bcrypt"
import {User} from "../models/user.model.js"
import {ApiError} from "../utils/ApiError.js"
import {generateAccessToken, generateRefreshToken} from "../utils/tokenGeneration.js"
import {generateOtp, hashOtp, compareOtp} from "../utils/otp.js"
import {sendOtpEmail} from "../utils/mailer.js"
import {OTP_PURPOSE, OTP_EXPIRY_MINUTES} from "../config/constants.js"

const OTP_EXPIRY_MS = OTP_EXPIRY_MINUTES * 60 * 1000

//generates an otp, stores its hash on the user, and emails the plaintext otp
const issueOtp = async (user, purpose) => {
    const otp = generateOtp()

    user.otp = await hashOtp(otp)
    user.otpExpiry = new Date(Date.now() + OTP_EXPIRY_MS)
    user.otpPurpose = purpose
    await user.save({validateBeforeSave: false})

    await sendOtpEmail({to: user.email, otp, purpose})
}

const registerUser = async({name, email, password, role, department}) => {

    //check if user exists
    const existingUser = await User.findOne({email})

    if(existingUser){
        throw new ApiError(409, "User with this email already exists")
    }

    //create user
    const user = await User.create({
        name,
        email,
        password,
        role,
        department
    })

    //send an otp so the user can verify their email
    await issueOtp(user, OTP_PURPOSE.EMAIL_VERIFICATION)

    //no returning of password
    user.password = undefined

    return user
}

const verifyEmailOtp = async({email, otp}) => {

    const user = await User.findOne({email}).select("+otp +otpExpiry +otpPurpose")

    if(!user){
        throw new ApiError(404, "User not found")
    }

    if(user.isEmailVerified){
        throw new ApiError(400, "Email is already verified")
    }

    if(user.otpPurpose !== OTP_PURPOSE.EMAIL_VERIFICATION || !user.otp || !user.otpExpiry){
        throw new ApiError(400, "No pending email verification for this account")
    }

    if(user.otpExpiry < new Date()){
        throw new ApiError(400, "OTP has expired, please register again to get a new one")
    }

    const isOtpValid = await compareOtp(otp, user.otp)

    if(!isOtpValid){
        throw new ApiError(400, "Invalid OTP")
    }

    user.isEmailVerified = true
    user.otp = undefined
    user.otpExpiry = undefined
    user.otpPurpose = undefined
    await user.save({validateBeforeSave: false})

    //no returning of password
    user.password = undefined

    return user
}

const loginUser = async({email, password}) => {

    //find user by email
    const user = await User.findOne({email})

    if(!user){
        throw new ApiError(401, "Invalid email or password")
    }

    //verify password
    const isPasswordValid = await user.comparePassword(password)

    if(!isPasswordValid){
        throw new ApiError(401, "Invalid email or password")
    }

    if(!user.isEmailVerified){
        throw new ApiError(403, "Please verify your email before logging in")
    }

    //credentials are correct, but login only completes once the otp is verified
    await issueOtp(user, OTP_PURPOSE.LOGIN)

    return {email: user.email}
}

const verifyLoginOtp = async({email, otp}) => {

    const user = await User.findOne({email}).select("+otp +otpExpiry +otpPurpose")

    if(!user){
        throw new ApiError(401, "Invalid email or OTP")
    }

    if(user.otpPurpose !== OTP_PURPOSE.LOGIN || !user.otp || !user.otpExpiry){
        throw new ApiError(400, "No pending login otp for this account")
    }

    if(user.otpExpiry < new Date()){
        throw new ApiError(400, "OTP has expired, please login again")
    }

    const isOtpValid = await compareOtp(otp, user.otp)

    if(!isOtpValid){
        throw new ApiError(400, "Invalid OTP")
    }

    user.otp = undefined
    user.otpExpiry = undefined
    user.otpPurpose = undefined

    //issue tokens
    const accessToken = generateAccessToken(user)
    const refreshToken = generateRefreshToken(user)

    //persist a hash of the refresh token so it can be revoked/rotated later
    user.refreshToken = await bcrypt.hash(refreshToken, 10)
    await user.save({validateBeforeSave: false})

    //no returning of password
    user.password = undefined

    return {user, accessToken, refreshToken}
}

export {
    registerUser,
    verifyEmailOtp,
    loginUser,
    verifyLoginOtp
}