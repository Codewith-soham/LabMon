import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from '../app/providers/AuthProvider';

export const useAuth = (): AuthContextValue => useContext(AuthContext);
