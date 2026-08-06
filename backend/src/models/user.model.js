import mongoose from "mongoose"
import validator from "validator"

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
        type: mongoose.Schema.Types.ObjectID,
        ref:"Dept",
        default: null
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

export const User = mongoose.model("User", userSchema)