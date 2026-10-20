// Admin-only reads. Staff CRUD and the audit log land in a later phase; for now
// this backs a single system-overview endpoint and gives the authorization test
// matrix a real Admin-scoped target.

import { Complaint } from "../models/complaint.model.js";
import { User } from "../models/user.model.js";
import "../models/department.model.js";
import { COMPLAINT_STATUS, ROLES, type ComplaintStatus, type Role } from "../config/constants.js";

type StatusCounts = Record<ComplaintStatus, number>;
type RoleCounts = Record<Role, number>;

export interface AdminSummary {
  complaints: {
    total: number;
    byStatus: StatusCounts;
  };
  staff: {
    total: number;
    active: number;
    byRole: RoleCounts;
  };
}

const zeroStatusCounts = (): StatusCounts =>
  Object.values(COMPLAINT_STATUS).reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as StatusCounts);

const zeroRoleCounts = (): RoleCounts =>
  Object.values(ROLES).reduce((acc, role) => {
    acc[role] = 0;
    return acc;
  }, {} as RoleCounts);

const getSummary = async (): Promise<AdminSummary> => {
  const [statusAgg, roleAgg, totalComplaints, totalStaff, activeStaff] = await Promise.all([
    Complaint.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    User.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]),
    Complaint.countDocuments(),
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
  ]);

  const byStatus = zeroStatusCounts();
  for (const row of statusAgg) {
    if (row._id in byStatus) {
      byStatus[row._id as ComplaintStatus] = row.count;
    }
  }

  const byRole = zeroRoleCounts();
  for (const row of roleAgg) {
    if (row._id in byRole) {
      byRole[row._id as Role] = row.count;
    }
  }

  return {
    complaints: { total: totalComplaints, byStatus },
    staff: { total: totalStaff, active: activeStaff, byRole },
  };
};

export { getSummary };
