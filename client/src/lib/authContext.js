import { createContext, useContext } from 'react';

// { user, signOut(), sync: 'saved' | 'saving' | 'error' | 'off', cloud: boolean }
export const AuthContext = createContext({ user: null, signOut: () => {}, sync: 'off', cloud: false });
export const useAuth = () => useContext(AuthContext);
