import mongoose from "mongoose"
import validator from "validator"
import bcrypt from "bcrypt"
import Roles from 'Role'

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
userSchema.method.comparePassword = async function(password){
    return bcrypt.compare(password, this.password)
}

export const User = mongoose.model("User", userSchema)