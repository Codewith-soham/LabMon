# VCET LABMON

## Product Requirements Document (PRD)

### Existing Project Modification & V1 Implementation Plan

---

# 1. PROJECT OVERVIEW

VCET Labmon is a laboratory complaint-management system for an educational institution.

The system allows students/users to raise laboratory-related complaints without creating an account. Each complaint receives a unique tracking token that can be used to monitor the complaint status.

Authorized institutional users have separate authenticated dashboards:

* Admin / Infra
* HOD
* Lab Incharge

The system must enforce role-based access control and organizational scope.

The immediate objective is to modify the EXISTING VCET Labmon project and complete a stable V1 implementation.

Do NOT rebuild the project from scratch unless the existing implementation is genuinely unusable.

---

# 2. PRIMARY V1 OBJECTIVE

The V1 system must support this complete workflow:

Student/User:

```
Open VCET Labmon
      ↓
Raise Complaint
      ↓
Enter Dead Stock Number
      ↓
Select Department
      ↓
Select Lab
      ↓
Enter Reason
      ↓
Submit Complaint
      ↓
Receive Tracking Token
      ↓
Track Complaint Using Token
```

Administrative workflow:

```
Admin / Infra
      ↓
Admin Login
      ↓
Admin Dashboard
      ↓
Create / Manage HODs
      ↓
Create / Manage Lab Incharges
```

HOD workflow:

```
HOD Login
      ↓
HOD Dashboard
      ↓
View Department Complaints
      ↓
Monitor Lab Incharges / Labs
      ↓
Manage / Escalate Complaints
```

Lab Incharge workflow:

```
Lab Incharge Login
      ↓
Lab Incharge Dashboard
      ↓
View Assigned Lab Complaints
      ↓
Manage / Assign / Update Complaints
      ↓
Escalate to HOD when required
```

---

# 3. IMPORTANT SCOPE DECISION

The Desktop System Tray Application and Python machine-data collection system are NOT part of the V1 implementation.

They are a future phase.

Do NOT spend implementation time on:

* Desktop tray application
* Python collector integration
* Automatic hardware inventory
* Machine registration
* Hardware telemetry
* Asset synchronization

The current priority is the core complaint-management and role-management system.

---

# 4. EXISTING PROJECT RULE

Before changing ANY code:

1. Inspect the entire existing repository.
2. Identify frontend technology and structure.
3. Identify backend technology and structure.
4. Identify database technology/schema.
5. Identify existing authentication.
6. Identify existing complaint functionality.
7. Identify existing routes.
8. Identify existing environment configuration.
9. Identify reusable components/services.
10. Identify currently working functionality.
11. Identify technical debt and incomplete functionality.

Do NOT immediately rewrite the project.

First create a short technical assessment describing:

* Existing architecture
* Existing functionality
* What should be preserved
* What should be modified
* What should be removed
* What is missing
* Potential breaking changes

The existing project is the source of truth for implementation details.

---

# 5. TECHNOLOGY DIRECTION

The backend should use:

* Node.js
* TypeScript
* REST API
* Proper authentication
* Role-Based Access Control
* Database persistence

The frontend should use the existing React architecture where possible.

If the frontend is currently JavaScript, migration toward TypeScript should be done carefully without blocking the main V1 functionality.

Do not perform a massive rewrite simply for the sake of rewriting.

Python may remain Python for future machine-data collection.

---

# 6. USER TYPES

V1 contains the following roles:

## ADMIN

Admin represents the institutional Infra/System administrator.

Admin has the highest system-level privileges.

Admin is responsible for:

* Creating HOD accounts
* Creating Lab Incharge accounts
* Deactivating accounts
* Managing organizational assignments
* Managing departments/labs where applicable
* Monitoring the overall system
* Viewing system-wide complaints
* Managing access

Admin credentials are NOT created through public registration.

Admin access should be provisioned securely through the system/database/environment during deployment.

---

## HOD

HOD represents a department-level authority.

Example:

```
HOD
Department: Information Technology
```

HOD can:

* View complaints belonging to their department
* Monitor all labs within their department
* Monitor Lab Incharges
* Monitor complaint progress
* View complaint history
* Add remarks
* Manage appropriate complaint actions
* Escalate complaints
* Reopen incorrectly resolved complaints
* Monitor department statistics

HOD cannot:

* Create system-level users
* Delete/modify Admin
* Access another department's operational data
* Change their own role
* Bypass authorization

---

## LAB INCHARGE

Lab Incharge represents the operational authority for a specific lab.

Example:

```
Lab Incharge
Department: Information Technology
Lab: Lab 12
```

Lab Incharge can:

* View complaints for their assigned lab
* Monitor complaints
* Assign complaints to staff where staff functionality exists
* Update complaint progress
* Add remarks
* Verify resolution
* Reopen complaints
* Escalate complaints to HOD
* View complaint history
* Monitor lab workload

Lab Incharge cannot:

* Access other labs unless explicitly assigned
* Access other departments
* Create HOD/Admin accounts
* Change roles
* Bypass backend authorization

---

## STUDENT / PUBLIC USER

Students do NOT require authentication in V1.

Students can:

* Raise complaints
* Receive a tracking token
* Track complaints using the token

Students cannot:

* Access Admin dashboard
* Access HOD dashboard
* Access Lab Incharge dashboard
* Modify complaint ownership
* Modify complaint status directly
* Manage users

---

# 7. ROUTING ARCHITECTURE

The public application should expose the complaint interface.

Recommended routes:

```
/
/track
```

Protected staff entry points:

```
/admin-login
/hod-login
/labincharge-login
```

Dashboards:

```
/admin-dashboard
/hod-dashboard
/labincharge-dashboard
```

The staff login pages should not be prominently exposed on the public complaint UI.

However, hiding a route is NOT a security mechanism.

Users may manually enter:

```
/admin-dashboard
```

or:

```
/hod-dashboard
```

Therefore every protected route must verify authentication and role.

Backend authorization is mandatory.

---

# 8. PUBLIC COMPLAINT FORM

The public landing page should provide the complaint form.

Fields:

## Dead Stock Number

Required.

Example:

```
DS-1024
```

## Department

For V1:

```
Information Technology
```

The architecture should allow additional departments later.

## Lab Number

For Information Technology V1:

```
Lab 9
Lab 10
Lab 11
Lab 12
Lab 13
Lab 14
```

## Reason

Required text field.

Example:

```
Computer is not powering on.
```

## Submit

Button:

```
Raise Complaint
```

---

# 9. COMPLAINT CREATION

When a complaint is submitted:

1. Validate all required fields.
2. Verify the selected department/lab.
3. Create the complaint in the database.
4. Generate a unique tracking token.
5. Store the token.
6. Return the token to the user.

Example:

```
LM-IT-8F42K7
```

The token must be unique.

Do not expose internal database IDs as the public tracking token.

---

# 10. COMPLAINT TRACKING

Public route:

```
/track
```

User enters:

```
Tracking Token
```

Example:

```
LM-IT-8F42K7
```

The system returns the complaint information.

Display:

* Token
* Department
* Lab
* Dead Stock Number
* Reason
* Current Status
* Assigned information where appropriate
* Last Updated
* Status timeline

Do not expose unnecessary internal/private staff information.

---

# 11. COMPLAINT STATUS

V1 statuses:

```
SUBMITTED
ASSIGNED
IN_PROGRESS
RESOLVED
CLOSED
```

The status flow should generally be:

```
SUBMITTED
     ↓
ASSIGNED
     ↓
IN_PROGRESS
     ↓
RESOLVED
     ↓
CLOSED
```

A resolved complaint may be reopened if the responsible authority determines that the issue has not actually been fixed.

---

# 12. COMPLAINT HISTORY

Do not store only the current status.

Every important status transition should be recorded.

Example:

```
Complaint created
↓
Assigned
↓
Work started
↓
Marked resolved
↓
Verified
↓
Closed
```

Each history record should contain:

* Complaint ID
* Previous status if applicable
* New status
* User who performed the action
* Timestamp
* Optional remarks

This allows the public tracker and internal dashboards to display an accurate timeline.

---

# 13. ORGANIZATIONAL ACCESS CONTROL

This is one of the most important architectural requirements.

Authorization must use:

```
ROLE + ORGANIZATIONAL SCOPE
```

not role alone.

Example HOD:

```
role = HOD
departmentId = IT
```

This HOD can access:

```
IT Lab 9
IT Lab 10
IT Lab 11
IT Lab 12
IT Lab 13
IT Lab 14
```

But cannot access:

```
Mechanical Department
Electrical Department
Other departments
```

Example Lab Incharge:

```
role = LAB_INCHARGE
departmentId = IT
labId = LAB_12
```

This user can access:

```
IT Lab 12
```

but cannot access:

```
IT Lab 9
IT Lab 10
IT Lab 13
Other departments
```

Admin has system-wide access.

---

# 14. DATABASE CORE ENTITIES

Do not over-engineer the database for V1.

At minimum, support:

```
users
departments
labs
complaints
complaint_status_history
```

Potential user structure:

```
id
name
email
password_hash
role
department_id
lab_id
is_active
created_at
updated_at
```

Department:

```
id
name
code
```

Lab:

```
id
department_id
lab_number
name
```

Complaint:

```
id
token
dead_stock_number
department_id
lab_id
reason
status
assigned_to
created_at
updated_at
```

Complaint history:

```
id
complaint_id
status
changed_by
remarks
created_at
```

Adapt these fields to the existing project's database technology and schema if equivalent functionality already exists.

Do not duplicate existing tables unnecessarily.

---

# 15. AUTHENTICATION

Implement secure authentication for:

```
ADMIN
HOD
LAB_INCHARGE
```

Requirements:

* Passwords must be hashed.
* Never store plaintext passwords.
* Login must authenticate against the backend.
* Protected APIs must require valid authentication.
* Role must come from authenticated server-side user information.
* Logout must invalidate/clear the client authentication state.
* Inactive accounts must not be able to authenticate.

Use the authentication mechanism already present in the project if it is secure and suitable.

Do not introduce two competing authentication systems.

---

# 16. ADMIN DASHBOARD

Route:

```
/admin-dashboard
```

Dashboard should provide:

## Overview

* Total complaints
* Pending complaints
* In-progress complaints
* Resolved complaints
* Closed complaints
* Department overview

## Staff Management

### HODs

Admin can:

* Create HOD
* View HOD
* Edit HOD
* Activate/deactivate HOD
* Assign department

### Lab Incharges

Admin can:

* Create Lab Incharge
* View Lab Incharge
* Edit Lab Incharge
* Activate/deactivate Lab Incharge
* Assign department
* Assign lab

Admin is responsible for controlling staff access.

---

# 17. HOD DASHBOARD

Route:

```
/hod-dashboard
```

The dashboard must be department scoped.

Example:

```
HOD
Information Technology
```

Dashboard:

* Total complaints
* Pending complaints
* In-progress complaints
* Resolved complaints
* Closed complaints
* Complaints by lab
* Lab Incharge overview
* Recent complaints
* Overdue/pending complaints if SLA functionality exists

Complaint table:

```
Token
Lab
Dead Stock Number
Reason
Status
Assigned To
Created At
Updated At
```

HOD must only see their department's data.

---

# 18. LAB INCHARGE DASHBOARD

Route:

```
/labincharge-dashboard
```

The dashboard must be lab scoped.

Example:

```
Lab Incharge
Information Technology
Lab 12
```

Dashboard:

* Total complaints
* Pending
* In Progress
* Resolved
* Closed
* Recent complaints
* Workload
* Complaint status

Complaint table:

```
Token
Dead Stock Number
Reason
Status
Assigned Staff
Created At
Updated At
```

Lab Incharge must only see complaints belonging to their assigned lab.

---

# 19. FRONTEND PROTECTION

Frontend should implement protected routes.

Conceptually:

```
ProtectedRoute
     ↓
Is authenticated?
     ↓
   YES
     ↓
Is correct role?
   /       \
 YES       NO
  ↓         ↓
```

Dashboard   403/Login

However:

Frontend route protection is NOT sufficient.

The backend must independently verify:

```
Authentication
Role
Department scope
Lab scope
```

---

# 20. API DESIGN

Use REST APIs following the existing backend conventions.

Minimum API categories:

## Authentication

```
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

## Public Complaints

```
POST /api/complaints
GET  /api/complaints/track/:token
```

## Admin

```
GET    /api/admin/dashboard

GET    /api/admin/hods
POST   /api/admin/hods
PATCH  /api/admin/hods/:id
DELETE /api/admin/hods/:id

GET    /api/admin/lab-incharges
POST   /api/admin/lab-incharges
PATCH  /api/admin/lab-incharges/:id
DELETE /api/admin/lab-incharges/:id

GET /api/admin/departments
GET /api/admin/labs
```

## HOD

```
GET   /api/hod/dashboard
GET   /api/hod/complaints
GET   /api/hod/labs
GET   /api/hod/lab-incharges
PATCH /api/hod/complaints/:id
```

## Lab Incharge

```
GET  /api/lab-incharge/dashboard
GET  /api/lab-incharge/complaints
GET  /api/lab-incharge/staff
POST /api/lab-incharge/complaints/:id/assign
PATCH /api/lab-incharge/complaints/:id
```

Adjust endpoint names to match existing project conventions.

---

# 21. ERROR HANDLING

The system must provide clear errors.

Examples:

```
400 Bad Request
Invalid complaint data

401 Unauthorized
Authentication required

403 Forbidden
Insufficient permissions

404 Not Found
Complaint/user/resource not found

409 Conflict
Duplicate/conflicting resource

500 Internal Server Error
Unexpected server error
```

Do not expose stack traces or sensitive implementation details to normal users.

---

# 22. VALIDATION

Frontend validation is required for good UX.

Backend validation is mandatory for security and data integrity.

Validate:

* Dead Stock Number
* Department
* Lab
* Complaint reason
* Email
* Password
* Role
* Department assignment
* Lab assignment

Never trust frontend validation alone.

---

# 23. AUDIT LOGGING

For important administrative actions, maintain an audit trail where the existing architecture permits it.

Examples:

```
Admin created HOD
Admin deactivated Lab Incharge
HOD reassigned complaint
Lab Incharge changed complaint status
Complaint reopened
```

Audit entry should contain:

```
actor
action
target
timestamp
relevant metadata
```

Do not allow ordinary users to modify audit records.

---

# 24. PHASED IMPLEMENTATION PLAN

Claude must implement the project in phases.

Do NOT attempt the entire modification in one uncontrolled operation.

---

# PHASE 0 — EXISTING PROJECT AUDIT

Priority: P0

Tasks:

1. Inspect repository.
2. Identify frontend.
3. Identify backend.
4. Identify database.
5. Identify current routes.
6. Identify current complaint implementation.
7. Identify current authentication.
8. Identify existing models.
9. Identify existing environment variables.
10. Identify broken/incomplete functionality.
11. Document architecture.
12. Create implementation plan based on the actual repository.

Deliverable:

```
docs/PROJECT_AUDIT.md
```

Do not make major architectural changes during this phase.

---

# PHASE 1 — FOUNDATION

Priority: P0

Tasks:

1. Establish clean project structure.
2. Verify frontend/backend startup.
3. Verify database connection.
4. Verify environment configuration.
5. Create/update .env.example.
6. Ensure .env is ignored.
7. Establish TypeScript configuration where applicable.
8. Establish shared types/interfaces where appropriate.
9. Document API conventions.

Deliverables:

```
Project runs locally.
Database connects.
Frontend connects to backend.
Environment configuration works.
```

---

# PHASE 2 — DATABASE + ORGANIZATION

Priority: P0

Tasks:

1. Implement/verify users.
2. Implement/verify roles.
3. Implement departments.
4. Implement labs.
5. Implement department relationships.
6. Implement lab relationships.
7. Seed Information Technology department.
8. Seed IT Labs 9–14.
9. Create initial Admin/Infra account securely.

Expected structure:

```
Information Technology
    ├── Lab 9
    ├── Lab 10
    ├── Lab 11
    ├── Lab 12
    ├── Lab 13
    └── Lab 14
```

Deliverable:

Database correctly represents organizational hierarchy.

---

# PHASE 3 — AUTHENTICATION + RBAC

Priority: P0

Tasks:

1. Implement login.
2. Implement password hashing.
3. Implement authentication middleware.
4. Implement role middleware.
5. Implement department scope.
6. Implement lab scope.
7. Implement logout.
8. Implement current-user endpoint.
9. Protect Admin APIs.
10. Protect HOD APIs.
11. Protect Lab Incharge APIs.

Mandatory tests:

```
Admin → Admin API = allowed
HOD → Admin API = forbidden
Lab Incharge → Admin API = forbidden

IT HOD → IT complaints = allowed
IT HOD → other department = forbidden

Lab 12 Incharge → Lab 12 = allowed
Lab 12 Incharge → Lab 13 = forbidden
```

---

# PHASE 4 — PUBLIC COMPLAINT SYSTEM

Priority: P0

Tasks:

1. Build/modify public complaint form.
2. Add Dead Stock Number.
3. Add Department dropdown.
4. Add Lab dropdown.
5. Add Reason.
6. Implement backend validation.
7. Create complaint.
8. Generate token.
9. Return token.
10. Create success screen.

Test:

```
User submits complaint
      ↓
Database record created
      ↓
Unique token returned
```

---

# PHASE 5 — PUBLIC TRACKER

Priority: P1

Tasks:

1. Create /track page.
2. Token input.
3. API integration.
4. Complaint details.
5. Current status.
6. Status timeline.
7. Error state for invalid token.
8. Loading state.
9. Empty state.

Test:

```
Valid token → complaint shown
Invalid token → correct error
No token → validation message
```

---

# PHASE 6 — ADMIN SYSTEM

Priority: P1

Tasks:

1. Admin login.
2. Admin protected route.
3. Admin dashboard.
4. HOD list.
5. Create HOD.
6. Edit HOD.
7. Activate/deactivate HOD.
8. Lab Incharge list.
9. Create Lab Incharge.
10. Edit Lab Incharge.
11. Activate/deactivate Lab Incharge.
12. Assign department.
13. Assign lab.
14. Admin complaint overview.

Test complete staff-management workflow.

---

# PHASE 7 — HOD SYSTEM

Priority: P1

Tasks:

1. HOD login.
2. HOD protected route.
3. HOD dashboard.
4. Department statistics.
5. Department complaint list.
6. Complaint detail.
7. Lab overview.
8. Lab Incharge overview.
9. Complaint management actions.
10. Escalation functionality where supported.

Mandatory:

HOD must never receive another department's data from the API.

---

# PHASE 8 — LAB INCHARGE SYSTEM

Priority: P1

Tasks:

1. Lab Incharge login.
2. Protected route.
3. Lab Incharge dashboard.
4. Lab-specific complaint list.
5. Complaint detail.
6. Complaint assignment functionality where applicable.
7. Status update.
8. Remarks.
9. Resolution verification.
10. Reopen complaint.
11. Escalate to HOD.

Mandatory:

Lab Incharge must never receive another lab's complaint data.

---

# PHASE 9 — END-TO-END INTEGRATION

Priority: P0

Test the entire system.

Scenario:

```
Public user
    ↓
Raises complaint
    ↓
Gets token
    ↓
Tracks token
    ↓
Admin logs in
    ↓
Creates HOD
    ↓
Creates Lab Incharge
    ↓
HOD logs in
    ↓
Sees department complaint
    ↓
Lab Incharge logs in
    ↓
Sees lab complaint
    ↓
Complaint gets updated
    ↓
Public tracker reflects updated status
```

All data must persist after server restart.

---

# PHASE 10 — SECURITY + QA

Priority: P0

Test:

### Authentication

* Invalid credentials
* Missing credentials
* Inactive user
* Logout
* Expired/invalid authentication

### Authorization

* HOD accessing Admin API
* Lab Incharge accessing Admin API
* HOD accessing another department
* Lab Incharge accessing another lab
* Unauthenticated dashboard access

### Complaint

* Missing fields
* Invalid department
* Invalid lab
* Duplicate/invalid token handling
* Invalid tracking token
* Unauthorized status changes

### General

* API errors
* Database errors
* Loading states
* Empty states
* Responsive UI
* Browser refresh
* Direct URL access

---

# 25. DEFINITION OF DONE

A phase is NOT complete simply because the UI exists.

A feature is considered complete only when:

```
Frontend
   ↓
Backend API
   ↓
Validation
   ↓
Authorization
   ↓
Database
   ↓
Correct response
   ↓
Error handling
   ↓
Tested
```

all work correctly.

---

# 26. DEVELOPMENT RULES FOR CLAUDE

Follow these rules throughout implementation.

## Rule 1

Inspect before modifying.

## Rule 2

Do not rewrite working functionality unnecessarily.

## Rule 3

Do not introduce duplicate authentication systems.

## Rule 4

Do not bypass backend authorization.

## Rule 5

Do not trust frontend role restrictions.

## Rule 6

Do not expose passwords or secrets.

## Rule 7

Do not commit .env files.

## Rule 8

Do not implement future desktop/Python functionality during V1.

## Rule 9

Do not move to the next phase until the current phase passes its tests.

## Rule 10

After each phase:

1. Run the application.
2. Run type checking.
3. Run tests where available.
4. Fix errors.
5. Document changes.
6. Summarize modified files.
7. State remaining issues.
8. Only then continue.

---

# 27. DOCUMENTATION REQUIREMENTS

Maintain:

```
docs/
    PROJECT_AUDIT.md
    ARCHITECTURE.md
    ROLES_AND_PERMISSIONS.md
    API_CONTRACT.md
    DATABASE.md
    TASK_BOARD.md
    DEVELOPMENT_LOG.md
```

Update these documents whenever architecture or behavior changes.

---

# 28. TASK BOARD

Use:

```
[ ] Not started
[~] In progress
[x] Completed
[!] Blocked
```

Every task should identify:

* Phase
* Owner
* Status
* Files affected
* Notes
* Testing status

---

# 29. FUTURE PHASE — DESKTOP TRAY + PYTHON COLLECTOR

This is explicitly OUT OF SCOPE for V1.

Future architecture:

```
Desktop Tray Application
         ↓
Dead Stock Number
Department
Lab
         ↓
Python System Collector
         ↓
Hardware/System Data
         ↓
Backend API
         ↓
Asset Database
```

This should be implemented only after the core Labmon system is stable.

---

# 30. FINAL V1 ARCHITECTURE

```
┌──────────────────────────────────────────┐
│                VCET LABMON               │
└──────────────────────────────────────────┘

                PUBLIC
                   │
      ┌────────────┴────────────┐
      │                         │
 Raise Complaint             Track
      │                         │
      └────────────┬────────────┘
                   │
                   ▼
               Backend API
                   │
         ┌─────────┴─────────┐
         │                   │
      Database           Auth/RBAC
         │                   │
         └─────────┬─────────┘
                   │
      ┌────────────┼────────────┐
      │            │            │
    ADMIN         HOD       LAB INCHARGE
      │            │            │
      ▼            ▼            ▼
   System       Department      Lab
   Scope          Scope        Scope
```

Public:
/
/track

Admin:
/admin-login
/admin-dashboard

HOD:
/hod-login
/hod-dashboard

Lab Incharge:
/labincharge-login
/labincharge-dashboard

---

# 31. IMMEDIATE EXECUTION INSTRUCTION

Start with PHASE 0 only.

Do NOT immediately implement all phases.

First:

1. Inspect the existing repository completely.
2. Produce PROJECT_AUDIT.md.
3. Identify what already works.
4. Identify what needs modification.
5. Compare the current implementation against this PRD.
6. Produce a concrete modification plan.
7. Ask for confirmation ONLY if there is a genuine architectural conflict or destructive change required.

Otherwise proceed phase-by-phase.

After Phase 0, implement Phase 1, then Phase 2, and continue in priority order.

At every phase, preserve working functionality and avoid unnecessary rewrites.

The objective is a reliable, maintainable V1—not merely a collection of UI screens.
