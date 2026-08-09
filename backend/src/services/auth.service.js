import bcrypt from "bcrypt"
import {User} from "../models/user.model.js"
import {ApiError} from "../utils/ApiError.js"
import {generateAccessToken, generateRefreshToken} from "../utils/tokenGeneration.js"

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
    loginUser
}