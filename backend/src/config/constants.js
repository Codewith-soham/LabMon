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

//lookup table
export const NEXT_LEVEL = {
    [ROLES.LAB_INCHARGE]: ROLES.HOD,
    [ROLES.HOD]: ROLES.DEAN_INFRA
}

export const STATUS_FOR_LEVEL = {
    [ROLES.HOD]: COMPLAINT_STATUS.ESCALATED_HOD,
    [ROLES.DEAN_INFRA]: COMPLAINT_STATUS.ESCALATED_DEAN
}

export const OTP_PURPOSE = {
    EMAIL_VERIFICATION: "emailVerification",
    LOGIN: "login"
}

export const OTP_EXPIRY_MINUTES = 10
