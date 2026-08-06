import mongoose from "mongoose"
import validator from "validator"

const User = new mongoose.Schema({
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

    password: {
        type: String,
        required: [true, "Password is required"]
    },

    role: {
        type: String,
        enum: ["labIncharge" , "hod", "deanInfra", "admin"],
        required: true
    }
},
{timestamps: true}
)