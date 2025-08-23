import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
    role: 'user' | 'admin' | null;
    token: string | null;
    phone: string | null;
    tempToken: string | null; // token returned after password step
}

const initialState: AuthState = {
    role: null,
    token: null,
    phone: null,
    tempToken: null,
};

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        setTempToken(state, action: PayloadAction<{ phone: string; tempToken: string }>) {
            state.phone = action.payload.phone;
            state.tempToken = action.payload.tempToken;
            // do not set role or token yet
        },
        login(state, action: PayloadAction<{ role: 'user' | 'admin'; token: string }>) {
            state.role = action.payload.role;
            state.token = action.payload.token;
            state.tempToken = null;
        },
        logout(state) {
            state.role = null;
            state.token = null;
            state.phone = null;
            state.tempToken = null;
        },
    },
});

export const { login, logout, setTempToken } = authSlice.actions;
export default authSlice.reducer;
