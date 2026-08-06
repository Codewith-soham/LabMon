import mongoose from "mongoose"

const pcSchema = new mongoose.Schema({
    deadStockNo: {
        type: String,
        required: true,
        unique: true
    },

    department: {
        type: mongoose.Types.ObjectId,
        ref: "Dept",
        required: [true, "Department is required"],
    },

    lab: {
        type: mongoose.Types.ObjectId,
        ref: "Lab",
        required: true
    },

    //embedded document
    warranty:{
        status: {
            type: String,
            enum: ["Active", "Expired"],
            default: "Active"
        },

        expiryDate: {
            type: Date
        }
    },

    purchaseDate: {
        type: Date
    },

    config: {
        cpu: {
            type: String
        },
        ram: {
            type: String
        },
        disk: {
            type: String
        },
        
        os:{
            type: String
        },

        software: {
            type: [String]
        },

        lastSyncedAt: {
            type: Date
        }
    }
}, {timestamps:true}
)

export const Pc = mongoose.model("Pc", pcSchema)