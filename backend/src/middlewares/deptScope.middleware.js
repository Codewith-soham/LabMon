//scope for each role

import { buildDepartmentScope } from "../utils/scope.js";

const deptScope = (req, res, next) => {
  req.scope = buildDepartmentScope(req.user);
  next();
};

export { deptScope };
