// backend/serial.js
const { SerialPort } = require('serialport');
let port;

function connectSerial(portName, baud = 9600) {
  port = new SerialPort({ path: portName, baudRate: baud });

  port.on('open', () => console.log('Serial port open:', portName));
  port.on('data', (data) => {
    // Do whatever you need: emit over websockets, store, etc.
    console.log('Received:', data.toString());
  });
  port.on('error', (err) => console.error('Serial error:', err));
}

function writeSerial(data) {
  if (port && port.writable) port.write(data, (err) => {
    if (err) console.error('Write error:', err.message);
  });
}

module.exports = { connectSerial, writeSerial };
