import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    bluetooth: [],
    wifi: [],
    historical: [],
    devices: [],
};

const dataSlice = createSlice({
    name: 'data',
    initialState,
    reducers: {
        setBluetooth(state, action) {
            state.bluetooth = action.payload;
        },
        setWifi(state, action) {
            state.wifi = action.payload;
        },
        setHistorical(state, action) {
            state.historical = action.payload;
        },
        setDevices(state, action) {
            state.devices = action.payload;
        },
    },
});

export const { setBluetooth, setWifi, setHistorical, setDevices } = dataSlice.actions;
export default dataSlice.reducer;
