'use strict';
const koffi = require('./node_modules/koffi');
const dllDir = 'C:\\IdemiaL1RdService\\RDService';
process.chdir(dllDir);

const spUsb  = koffi.load(dllDir + '\\Mso_SpUsb.dll');
const mso100 = koffi.load(dllDir + '\\MSO100.dll');
console.log('DLLs loaded OK');

// Test 1: SpUsb_EnumDevices
try {
  const fn = spUsb.func('SpUsb_EnumDevices', 'int', ['void **']);
  console.log('SpUsb_EnumDevices resolved');
  const ptr = [null];
  const r = fn(ptr);
  console.log('SpUsb_EnumDevices result:', r, 'ptr:', ptr[0]);
  if (r > 0) {
    const release = spUsb.func('SpUsb_ReleaseEnumDevices', 'void', ['void *']);
    release(ptr[0]);
    console.log('SpUsb_ReleaseEnumDevices OK');
  }
} catch(e) { console.log('SpUsb_EnumDevices FAIL:', e.message); }

// Test 2: MSO_Usb_EnumDevices
try {
  const fn = mso100.func('MSO_Usb_EnumDevices', 'int', ['void **']);
  console.log('MSO_Usb_EnumDevices resolved');
  const ptr = [null];
  const r = fn(ptr);
  console.log('MSO_Usb_EnumDevices result:', r, 'ptr:', ptr[0]);
  if (r > 0) {
    const release = mso100.func('MSO_Usb_ReleaseEnumDevices', 'void', ['void *']);
    release(ptr[0]);
    console.log('MSO_Usb_ReleaseEnumDevices OK');
  }
} catch(e) { console.log('MSO_Usb_EnumDevices FAIL:', e.message); }

console.log('DONE');
