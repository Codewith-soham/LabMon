import mongoose, { type HydratedDocument, type Model, type Types } from "mongoose";
import {
  ROLES,
  COMPLAINT_STATUS,
  type ComplaintLevel,
  type ComplaintStatus,
} from "../config/constants.js";

export type { ComplaintLevel };

export interface IComplaintRaisedBy {
  name: string;
  contact: string;
}

export interface IComplaintHistoryEntry {
  level?: string;
  action?: string;
  // A string id is accepted here too: callers pass the raw `req.user.id` claim
  // and Mongoose casts it to an ObjectId on save.
  by?: Types.ObjectId | string | null;
  at: Date;
  note?: string;
}

export interface IComplaint {
  token: string;
  pc: Types.ObjectId;
  department: Types.ObjectId;
  lab: Types.ObjectId;
  description: string;
  raisedBy: IComplaintRaisedBy;
  status: ComplaintStatus;
  currentLevel: ComplaintLevel;
  history: mongoose.Types.DocumentArray<IComplaintHistoryEntry>;
  createdAt: Date;
  updatedAt: Date;
}

export type ComplaintDocument = HydratedDocument<IComplaint>;
export type ComplaintModel = Model<IComplaint>;

const complaintSchema = new mongoose.Schema<IComplaint, ComplaintModel>(
  {
    token: {
      type: String,
      required: true,
      unique: true,
    },

    pc: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pc",
      required: true,
    },

    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dept",
      required: true,
    },

    lab: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lab",
      required: true,
    },

    description: {
      type: String,
      required: true,
    },

    raisedBy: {
      name: {
        type: String,
        required: true,
      },

      contact: {
        type: String,
        required: true,
      },
    },

    status: {
      type: String,
      enum: Object.values(COMPLAINT_STATUS),
      default: COMPLAINT_STATUS.OPEN,
    },

    currentLevel: {
      type: String,
      enum: Object.values(ROLES).filter((r) => r !== ROLES.ADMIN), // ADMIN CANNOT SEE THE CURRENT LEVEL
      default: ROLES.LAB_INCHARGE,
    },

    history: [
      {
        level: {
          type: String,
        },
        action: {
          type: String,
        },
        by: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        at: {
          type: Date,
          default: Date.now,
        },
        note: {
          type: String,
        },
      },
    ],
  },
  { timestamps: true },
);

export const Complaint: ComplaintModel = mongoose.model<IComplaint, ComplaintModel>(
  "Complaint",
  complaintSchema,
);
