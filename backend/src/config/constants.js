//Centralizing roles and complaint_status so that we can change role if we want without updating in different files

export const ROLES = {
    ADMIN: "admin",
    LAB_INCHARGE: "labIncharge",
    HOD: "hod",
    DEAN_INFRA: "deanInfra"
}

export const COMPLAINT_STATUS = {
    OPEN: "Open",
    ESCALATED_HOD: "Escalated_HOD",
    ESCALATED_DEAN: "Escalated_Dean",
    RESOLVED: "Resolved"
}
