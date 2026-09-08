import type { ComplaintLevel, ComplaintStatus, UserRole } from '../constants/roles';

export type { ComplaintLevel, ComplaintStatus, UserRole };

/** A Mongo document id as serialized to JSON. */
export type EntityId = string;

/** A populated `{ _id, name }` reference (department / lab / user). */
export interface NamedRef {
  _id: EntityId;
  name: string;
}

/** Department reference; `/pc/*` responses also populate `code`. */
export interface DepartmentRef extends NamedRef {
  code?: string;
}

export type LabRef = NamedRef;

/** Full department row from `GET /dept`. */
export interface Department {
  _id: EntityId;
  name: string;
  code: string;
}

/** Authenticated user from `GET /auth/me` and the `POST /auth/login` payload. */
export interface AuthUser {
  _id: EntityId;
  name: string;
  email: string;
  role: UserRole;
  department: DepartmentRef | null;
  isEmailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RaisedBy {
  name: string;
  contact: string;
}

export interface ComplaintHistoryEntry {
  _id?: EntityId;
  level: string;
  action: string;
  by: NamedRef | null;
  at: string;
  note?: string;
}

/** Complaint row from `GET /complaint` and the escalate/resolve responses. */
export interface Complaint {
  _id: EntityId;
  token: string;
  pc: EntityId;
  department: DepartmentRef;
  lab: LabRef;
  description: string;
  raisedBy: RaisedBy;
  status: ComplaintStatus;
  currentLevel: ComplaintLevel;
  history: ComplaintHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

/** Trimmed public projection from `GET /complaint/track/:token`. */
export interface TrackedComplaint {
  _id: EntityId;
  token: string;
  status: ComplaintStatus;
  currentLevel: ComplaintLevel;
  description: string;
  createdAt: string;
}

export type WarrantyStatus = 'Active' | 'Expired';

export interface Warranty {
  status: WarrantyStatus;
  expiryDate?: string;
}

export interface PcConfig {
  cpu?: string;
  ram?: string;
  disk?: string;
  os?: string;
  software?: string[];
  lastSyncedAt?: string;
}

/** PC row from `GET /pc/search` and `POST /pc/:id/health-card`. */
export interface Pc {
  _id: EntityId;
  deadStockNo: string;
  department: DepartmentRef;
  lab: LabRef;
  warranty: Warranty;
  purchaseDate?: string;
  config: PcConfig;
  createdAt: string;
  updatedAt: string;
}

/** Trimmed projection from the public `GET /pc/lookup/:deadStockNo`. */
export interface PcLookup {
  _id: EntityId;
  deadStockNo: string;
  department: DepartmentRef;
  lab: LabRef;
}
