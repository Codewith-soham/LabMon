export interface DepartmentOption {
  name: string;
  code: string;
}

/**
 * Master department list for the frontend.
 * When you need to add more departments in the future, just add them here
 * and in backend/src/config/departments.ts without needing to change any other code.
 *
 * Example:
 *   { name: 'Mechanical Engineering', code: 'ME' }
 */
export const DEFAULT_DEPARTMENTS: ReadonlyArray<DepartmentOption> = [
  { name: 'Information Technology', code: 'IT' },
  { name: 'Computer Science', code: 'CS' },
];
