export interface DepartmentConfig {
  name: string;
  code: string;
}

/**
 * Master department registry.
 * To add a new department, simply add an entry to this array.
 * Example:
 *   { name: "Mechanical Engineering", code: "ME" }
 *
 * The system automatically ensures all departments in this list exist in
 * the database without requiring any changes to other files.
 */
export const DEPARTMENTS: ReadonlyArray<DepartmentConfig> = [
  { name: "Information Technology", code: "IT" },
  { name: "Computer Science", code: "CS" },
];
