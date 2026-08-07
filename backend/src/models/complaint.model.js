import mongoose from "mongoose"
import {ROLES, COMPLAINT_STATUS} from "../config/constants.js"

const complaintSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true,
        unique: true
    },

    pc: {
        type: mongoose.Schema.Types.ObjectId,
        ref:"Pc",
        required: true,
    },

    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Dept",
        required: true
    },

    lab: {
        type: mongoose.Schema.Types.ObjectId,
        ref:"Lab",
        required: true
    },

    description: {
        type: String ,
        required: true
    },

    raisedBy: {
        name: {
            type: String,
            required: true
        },

        contact: {
            type:String,
            required: true
        }
    },

    status: {
        type: String,
        enum: Obejct.values(COMPLAINT_STATUS),
        default: "Open",
    },

    currentLevel: {
        type:String,
        enum: Object.values(ROLES).filter(r => r!== ROLES.ADMIN),  //ADMIN CANNOT SE THE CURRENT LEVEL
        default: ROLES.LAB_INCHARGE
    },

    history:[{
        level: {
            type:String
        },
        action: {
            type:String
        },
        by:{
            type:mongoose.Schema.Types.ObjectId,
            ref:"User"
        },
        at:{
            type:Date,
            default: Date.now
        }
    }],
},{ timestamps: true}
)

export const Complaint = mongoose.model("Complaint", complaintSchema)