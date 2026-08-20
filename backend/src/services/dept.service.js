import { Dept } from "../models/department.model.js"

const listDepartments = async () => {
    return Dept.find().select("name code").sort("name")
}

export { listDepartments }
