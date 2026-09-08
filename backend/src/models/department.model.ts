import mongoose, { type HydratedDocument, type Model } from "mongoose";

export interface IDept {
  name: string;
  code: string;
  createdAt: Date;
  updatedAt: Date;
}

export type DeptDocument = HydratedDocument<IDept>;
export type DeptModel = Model<IDept>;

const deptSchema = new mongoose.Schema<IDept, DeptModel>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
  },
  {
    timestamps: true,
  },
);

export const Dept: DeptModel = mongoose.model<IDept, DeptModel>("Dept", deptSchema);
