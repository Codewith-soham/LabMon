import { nanoid } from "nanoid" //used to generate random ID's
import { Complaint } from "../models/complaint.model.js"
import { Pc } from "../models/pc.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ROLES, COMPLAINT_STATUS, NEXT_LEVEL, STATUS_FOR_LEVEL } from "../config/constants.js"

// Mirrors deptScope middleware's rule: admin/deanInfra see everything, everyone else is department-locked.
const assertDeptAccess = (user, department, action) => {
    const isUnscoped = user.role === ROLES.ADMIN || user.role === ROLES.DEAN_INFRA
    if (!isUnscoped && String(department) !== String(user.department)) {
        throw new ApiError(403, `You are not authorized to ${action} complaints outside your department`)
    }
}

const createComplaint = async({deadStockNo, description, raisedBy }) => {
    const pc = await Pc.findOne({deadStockNo})

    if(!pc){
        throw new ApiError(404, "PC not found")
    }

    const complaintToken = nanoid(8)

    const complaint = await Complaint.create({
        token: complaintToken,
        pc: pc._id, //pc that
        department: pc.department,
        lab: pc.lab,
        description,
        raisedBy,
        status: COMPLAINT_STATUS.OPEN,
        currentLevel: ROLES.LAB_INCHARGE,
        history:[
            {
                level: ROLES.LAB_INCHARGE,
                action: "created",
                by: null,
                at: new Date()
            }
        ]

    })

    return  complaint
}

const escalateComplaint = async(complaintId, user) => {
    const complaint = await Complaint.findById(complaintId)

    if(!complaint){
        throw new ApiError(404, "Complaint not found")
    }

    if(complaint.status === COMPLAINT_STATUS.RESOLVED){
        throw new ApiError(400, "Cannot escalate a resolved complaint")
    }

    assertDeptAccess(user, complaint.department, "escalate")

    if(user.role !== complaint.currentLevel){
        throw new ApiError(403, "Only the current level's incharge can escalate this complaint")
    }

    const nextLevel = NEXT_LEVEL[complaint.currentLevel]

    if(!nextLevel){
        throw new ApiError(400, "Complaint is already at the highest escalation level")
    }

    complaint.currentLevel = nextLevel
    complaint.status = STATUS_FOR_LEVEL[nextLevel]
    // if currentLevel is "labIncharge", nextRole becomes "hod"
    // if currentLevel is "hod", nextRole becomes "deanInfra"
    // if currentLevel is "deanInfra", nextRole is undefined (no next level — end of chain)

    complaint.history.push({
        level: nextLevel,
        action: "escalated",
        by: user.id,
        at: new Date()
    })

    await complaint.save()
    await complaint.populate([
        { path: "lab", select: "name" },
        { path: "history.by", select: "name" }
    ])

    return complaint
}

const resolveComplaint = async(complaintId, user, remarks) => {
    const complaint = await Complaint.findById(complaintId)

    if(!complaint){
        throw new ApiError(404, "Complaint not found")
    }

    if(complaint.status === COMPLAINT_STATUS.RESOLVED){
        throw new ApiError(400, "Complaint is already resolved")
    }

    assertDeptAccess(user, complaint.department, "resolve")

    if(user.role !== complaint.currentLevel){
        throw new ApiError(403, "Only the current level's incharge can resolve this complaint")
    }

    complaint.status = COMPLAINT_STATUS.RESOLVED

    complaint.history.push({
        level: complaint.currentLevel,
        action: "resolved",
        by: user.id,
        at: new Date(),
        note: remarks
    })

    await complaint.save()
    await complaint.populate([
        { path: "lab", select: "name" },
        { path: "history.by", select: "name" }
    ])

    return complaint
}

//complaint raiser can track the complaint by token
const trackComplaint = async(token) => {
    const complaint = await Complaint.findOne({token})
        .select("token status currentLevel description createdAt") //fields which you want back

    if(!complaint){
        throw new ApiError(404, "Invalid tracking token")
    }

    return complaint
}

//will get complaints according to their scope of department (if IT -> will recieve IT complaints)
const getComplaints = async({...scope}) => {
    const complaints = await Complaint.find({...scope })
        .sort({createdAt: -1}) //will get complaints in descending order
        .populate("lab", "name")
        .populate("history.by", "name")

    return complaints
}



export { createComplaint, escalateComplaint, resolveComplaint, trackComplaint, getComplaints }