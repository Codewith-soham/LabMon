import mongoose, { type HydratedDocument, type Model, type Types } from "mongoose";

export type WarrantyStatus = "Active" | "Expired";

export interface IPcWarranty {
  status: WarrantyStatus;
  expiryDate?: Date;
}

export interface IPcConfig {
  cpu?: string;
  ram?: string;
  disk?: string;
  os?: string;
  software?: string[];
  lastSyncedAt?: Date;
}

export interface IPc {
  deadStockNo: string;
  department: Types.ObjectId;
  lab: Types.ObjectId;
  warranty: IPcWarranty;
  purchaseDate?: Date;
  config: IPcConfig;
  createdAt: Date;
  updatedAt: Date;
}

export type PcDocument = HydratedDocument<IPc>;
export type PcModel = Model<IPc>;

const pcSchema = new mongoose.Schema<IPc, PcModel>(
  {
    deadStockNo: {
      type: String,
      required: true,
      unique: true,
    },

    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dept",
      required: [true, "Department is required"],
    },

    lab: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lab",
      required: true,
    },

    // embedded document
    warranty: {
      status: {
        type: String,
        enum: ["Active", "Expired"],
        default: "Active",
      },

      expiryDate: {
        type: Date,
      },
    },

    purchaseDate: {
      type: Date,
    },

    config: {
      cpu: {
        type: String,
      },
      ram: {
        type: String,
      },
      disk: {
        type: String,
      },

      os: {
        type: String,
      },

      software: {
        type: [String],
      },

      lastSyncedAt: {
        type: Date,
      },
    },
  },
  { timestamps: true },
);

pcSchema.index({ department: 1, lab: 1 });
pcSchema.index({ "warranty.status": 1 });

export const Pc: PcModel = mongoose.model<IPc, PcModel>("Pc", pcSchema);
