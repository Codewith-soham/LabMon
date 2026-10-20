import mongoose, { type HydratedDocument, type Model, type Types } from "mongoose";

export interface ILab {
  name: string;
  // Numeric label (e.g. 9 for "Lab 9"). `name` stays the canonical display
  // value; `labNumber` is a convenience for ordering / seeding.
  labNumber?: number;
  department: Types.ObjectId;
  incharge?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type LabDocument = HydratedDocument<ILab>;
export type LabModel = Model<ILab>;

const labSchema = new mongoose.Schema<ILab, LabModel>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    labNumber: {
      type: Number,
    },

    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dept",
      required: true,
    },

    incharge: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

// A lab name is unique within its department (matches the ad-hoc upsert key
// pc.service.ts already uses when auto-creating labs during a PC sync).
labSchema.index({ department: 1, name: 1 }, { unique: true });

export const Lab: LabModel = mongoose.model<ILab, LabModel>("Lab", labSchema);
