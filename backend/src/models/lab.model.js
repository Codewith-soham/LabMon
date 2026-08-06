import mongoose from "mongoose"

const labSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },

    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Dept",
        required: true
    },

    incharge: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
},
{ timestamps: true }
)

export const Lab = mongoose.model("lab", labSchema)