import mongoose from "mongoose"
import validator from "validator"
import bcrypt from "bcrypt"
import { ROLES, OTP_PURPOSE } from "../config/constants.js"

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },

    email: {
        type: String,
        required: [true, "email is required"],
        unique: true,
        lowercase: true,
        trim: true,
        validate: {
            validator: function(value){
                return validator.isEmail(value);
            },
            message: "Please provide a valid email address"
        },
    },

    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref:"Dept",
        default: null
    },

    password: {
        type: String,
        required: [true, "Password is required"]
    },

    role: {
        type: String,
        enum: Object.values(ROLES),
        required: true
    },

    refreshToken: {
        type: String
    },

    isEmailVerified: {
        type: Boolean,
        default: false
    },

    otp: {
        type: String,
        select: false
    },

    otpExpiry: {
        type: Date,
        select: false
    },

    otpPurpose: {
        type: String,
        enum: Object.values(OTP_PURPOSE),
        select: false
    }
},
{timestamps: true}
)

//pre-save hooks
userSchema.pre("save", async function(){
    //if password is modified
    if(!this.isModified("password")){
        return
    }
    //hash the password
    const saltRounds = 10
    this.password = await bcrypt.hash(this.password, saltRounds)
})

//to compare the incoming password
userSchema.methods.comparePassword = async function(password){
    return bcrypt.compare(password, this.password)
}

export const User = mongoose.model("User", userSchema)