# LABMON

LABMON is a MERN-based lab PC health monitoring and complaint management system for college environments. A lightweight Python agent collects each lab PC's hardware and software configuration, syncs it to the backend, and keeps a digital health card updated with department, lab, dead stock number, and warranty status.

The system also supports public complaint submission without login. Each complaint is tracked with a unique token and moves through a strict escalation flow: Lab Incharge -> HOD -> Dean Infra. Role access is scoped by department, and HOD/Dean users can search PCs by hardware or installed software to locate machines quickly across labs.

## Goals

- Track lab PC health and configuration centrally.
- Allow public complaint submission with token-based tracking.
- Enforce department and role-based access control.
- Support PC discovery by hardware and installed software.
- Keep the platform lightweight enough to be deployed within 1-2 months.

## Tech Stack

- Backend: Node.js + Express
- Database: MongoDB + Mongoose
- Frontend: React.js
- Agent: Python system configuration collector
- Authentication: JWT

## Repository Status

This repository currently contains the backend scaffold and database models.

- Completed: Department, Lab, User, PC, and Complaint models.
- In progress: constants, JWT auth, and role/department scoping middleware.
- Next planned work: complaint workflows, PC sync endpoint, health card APIs, and role-based search.

## Data Model

### Department

```text
name  String, required, unique
code  String, required, unique, uppercase
```

### Lab

```text
name        String, required
department  ObjectId -> Department, required
incharge    ObjectId -> User
```

### User

```text
name        String, required
email       String, required, unique, lowercase
password    String, required (bcrypt hashed)
role        Enum: labIncharge | hod | deanInfra | admin
department  ObjectId -> Department (null for admin/deanInfra)
```

### PC

```text
deadStockNo   String, required, unique
department    ObjectId -> Department, required
lab           ObjectId -> Lab, required
warranty      { status: Enum(active/expired), expiryDate: Date }
purchaseDate  Date
config        {
	cpu, ram, disk, os,
	software: [String],
	lastSyncedAt: Date
}
```

### Complaint

```text
token         String, required, unique
pc            ObjectId -> PC, required
department    ObjectId -> Department, required
lab           ObjectId -> Lab, required
description   String, required
raisedBy      { name, contact }
status        Enum: Open | Escalated_HOD | Escalated_Dean | Resolved
currentLevel  Enum: labIncharge | hod | deanInfra
history       [{ level, action, by: ObjectId -> User, at: Date }]
```

## Relationships

```text
Department 1 --- * Lab
Department 1 --- * User (except deanInfra/admin)
Department 1 --- * PC
Lab        1 --- * PC
PC         1 --- * Complaint
```

## Planned Architecture

```text
Python Agent -> Express API (/api/pc/sync)
React Frontend -> Express API (/api/auth/*, /api/complaints/*, /api/search/*)
Express API -> MongoDB via Mongoose
```

## Planned API Surface

### Auth

- `POST /api/auth/register` - Admin only
- `POST /api/auth/login` - Public

### Department / Lab / User / PC

- `POST /api/departments` - Admin
- `GET /api/departments` - Admin
- `PUT /api/departments/:id` - Admin
- `DELETE /api/departments/:id` - Admin
- `POST /api/labs` - Admin
- `GET /api/labs` - Admin
- `PUT /api/labs/:id` - Admin
- `DELETE /api/labs/:id` - Admin
- `POST /api/users` - Admin
- `GET /api/users` - Admin
- `PUT /api/users/:id` - Admin
- `DELETE /api/users/:id` - Admin
- `POST /api/pcs` - Admin
- `GET /api/pcs` - Admin
- `PUT /api/pcs/:id` - Admin
- `DELETE /api/pcs/:id` - Admin

### PC Health

- `POST /api/pc/sync` - Agent device key
- `GET /api/pc/:id/health-card` - Role-scoped
- `GET /api/pc/search?cpu=&ram=&software=` - HOD, Dean

### Complaints

- `POST /api/complaints` - Public
- `GET /api/complaints/track/:token` - Public
- `GET /api/complaints` - Role-scoped list
- `PATCH /api/complaints/:id/escalate` - Lab Incharge, HOD
- `PATCH /api/complaints/:id/resolve` - Role-scoped

## Response Codes

### HTTP

- `200` OK - Successful GET/PUT
- `201` Created - Successful POST
- `400` Bad Request - Validation failure
- `401` Unauthorized - Missing or invalid JWT
- `403` Forbidden - Role or department scope violation
- `404` Not Found - Resource does not exist
- `409` Conflict - Duplicate unique field
- `500` Internal Server Error - Unhandled exception

### Complaint Status

- `Open` - Newly raised, with Lab Incharge
- `Escalated_HOD` - Escalated to HOD
- `Escalated_Dean` - Escalated to Dean Infra
- `Resolved` - Closed

## Roadmap

### Phase 1: Foundation

- MVC skeleton
- All 5 Mongoose models
- JWT auth
- Role and department scoping middleware

### Phase 2: Python Agent

- Hardware/software collector
- Sync endpoint integration

### Phase 3: Health Card + Complaint Core

- Health card view
- Public complaint flow and token system
- Escalation state machine

### Phase 4: Role Dashboards

- Lab Incharge, HOD, and Dean Infra dashboards
- Backend-enforced visibility

### Phase 5: Search

- PC search by configuration and software
- Indexed queries

### Phase 6: Security Hardening

- Rate limiting
- Validation
- Audit logs
- CORS and Helmet

### Phase 7: Deployment

- Dockerization
- CI/CD
- MongoDB Atlas
- Agent packaging
- Load testing

## Local Setup

1. Install dependencies.
2. Create a `.env` file with the required values.
3. Start MongoDB locally or point `MONGO_URL` to Atlas.
4. Run the server.

### Environment Variables

```text
PORT=5000
MONGO_URL=mongodb://127.0.0.1:27017/labmon
CORS_ORIGIN=http://localhost:3000
```

### Scripts

- `npm start` - Start the server
- `npm run dev` - Start the server with nodemon

## Current Backend Entry Points

- `server.js` loads environment variables, connects to MongoDB, and starts the Express app.
- `src/app.js` defines the Express instance and middleware setup.
- `src/config/db.config.js` handles MongoDB connectivity.

## Notes

- Complaint tokens should remain unique and easy to share for public tracking.
- Department scope must be enforced on all role-protected endpoints.
- The Python agent should only sync machine inventory data needed for the health card.
