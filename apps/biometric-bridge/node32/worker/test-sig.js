'use strict';
const koffi = require('./node_modules/koffi');
const dllDir = 'C:\\IdemiaL1RdService\\RDService';
process.chdir(dllDir);

const spUsb  = koffi.load(dllDir + '\\Mso_SpUsb.dll');
const mso100 = koffi.load(dllDir + '\\MSO100.dll');
console.log('DLLs loaded OK');

// The DLLs are 32-bit MSVC — koffi uses __cdecl by default for x86.
// MSO_Usb_EnumDevices likely returns the count and writes the list to an out-param.
// Try: int MSO_Usb_EnumDevices(void**)  with koffi out pointer syntax

// Approach 1: use koffi.out with a pointer type
try {
  const VoidPtr = koffi.pointer('VoidPtr', koffi.opaque());
  const fn = mso100.func('__cdecl MSO_Usb_EnumDevices', 'int', [koffi.out(koffi.pointer(VoidPtr))]);
  console.log('MSO_Usb_EnumDevices (approach 1) resolved');
  const pList = [null];
  const r = fn(pList);
  console.log('result:', r, 'pList:', pList[0]);
} catch(e) { console.log('approach 1 fail:', e.message); }

// Approach 2: no out param — maybe it returns the list pointer directly
try {
  const fn2 = mso100.func('__cdecl MSO_Usb_EnumDevices', 'int', []);
  console.log('MSO_Usb_EnumDevices (approach 2 - no args) resolved');
  const r = fn2();
  console.log('result:', r);
} catch(e) { console.log('approach 2 fail:', e.message); }

// Approach 3: SpUsb_EnumDevices with no args
try {
  const fn3 = spUsb.func('__cdecl SpUsb_EnumDevices', 'int', []);
  console.log('SpUsb_EnumDevices (no args) resolved');
  const r = fn3();
  console.log('result:', r);
} catch(e) { console.log('approach 3 fail:', e.message); }

// Approach 4: SpUsb_EnumDevices returns a pointer, no args  
try {
  const fn4 = spUsb.func('__cdecl SpUsb_EnumDevices', 'void *', []);
  console.log('SpUsb_EnumDevices (returns ptr) resolved');
  const r = fn4();
  console.log('result:', r);
} catch(e) { console.log('approach 4 fail:', e.message); }

console.log('DONE');
