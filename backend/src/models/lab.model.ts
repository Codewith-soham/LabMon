import mongoose, { type HydratedDocument, type Model, type Types } from "mongoose";

export interface ILab {
  name: string;
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

export const Lab: LabModel = mongoose.model<ILab, LabModel>("Lab", labSchema);
