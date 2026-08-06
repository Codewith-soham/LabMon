import mongoose from "mongoose"

const deptSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    code: {
        type: String,
        required: true,
        trim: true,
        uppercase: true
    },
}, {
    timestamps: true
}
)

export const Dept =  mongoose.model('Dept', deptSchema)