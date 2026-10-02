'use strict';
const koffi = require('./node_modules/koffi');
const dllDir = 'C:\\IdemiaL1RdService\\RDService';
process.chdir(dllDir);

const spUsb  = koffi.load(dllDir + '\\Mso_SpUsb.dll');
const mso100 = koffi.load(dllDir + '\\MSO100.dll');
console.log('DLLs loaded OK');

// x86 Windows DLLs exported without decoration from MSVC typically use
// __stdcall with @N suffix stripped, or __cdecl without decoration.
// koffi on x86 defaults to __cdecl but honours __stdcall prefix.

const fnsToTry = [
  // SpUsb_EnumDevices variants
  ['spUsb',  'SpUsb_EnumDevices',        'int',  ['void **']],
  ['spUsb',  '__stdcall SpUsb_EnumDevices', 'int', ['void **']],
  ['spUsb',  '_SpUsb_EnumDevices@4',     'int',  ['void **']],
  ['spUsb',  'SpUsb_EnumDevices@4',      'int',  ['void **']],
  // MSO100 variants
  ['mso100', 'MSO_Usb_EnumDevices',      'int',  ['void **']],
  ['mso100', '__stdcall MSO_Usb_EnumDevices', 'int', ['void **']],
  ['mso100', 'MSO_Usb_EnumDevices@4',    'int',  ['void **']],
  ['mso100', '_MSO_Usb_EnumDevices@4',   'int',  ['void **']],
  // MSO_ComOpen variants
  ['mso100', 'MSO_ComOpen',              'int',  ['str', 'void **']],
  ['mso100', '__stdcall MSO_ComOpen',    'int',  ['str', 'void **']],
  ['mso100', 'MSO_ComOpen@8',            'int',  ['str', 'void **']],
  // MSO_InitCom variants
  ['mso100', 'MSO_InitCom',              'int',  ['void *']],
  ['mso100', '__stdcall MSO_InitCom',    'int',  ['void *']],
];

const libs = { spUsb, mso100 };

for (const [libName, name, ret, args] of fnsToTry) {
  try {
    const fn = libs[libName].func(name, ret, args);
    console.log('RESOLVED:', name);
  } catch(e) {
    console.log('FAIL:', name, '-', e.message.split('\n')[0]);
  }
}

console.log('DONE');
