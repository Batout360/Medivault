'use strict';
const koffi = require('./node_modules/koffi');
const dllDir = 'C:\\IdemiaL1RdService\\RDService';
process.chdir(dllDir);

const spUsb  = koffi.load(dllDir + '\\Mso_SpUsb.dll');
const mso100 = koffi.load(dllDir + '\\MSO100.dll');
console.log('DLLs loaded');

// For void** out-params on x86 koffi, we use koffi.out(koffi.pointer(...))
// or a pre-allocated Buffer to hold the pointer.
// koffi on x86: pass a Buffer of size 4 (pointer size) for out void*
const HWINFO_BUF = 512;

// Step 1: Enumerate devices via MSO_Usb_EnumDevices
// Signature: int MSO_Usb_EnumDevices(void** ppList)
// We pass a 4-byte buffer to receive the pointer
const fnEnum    = mso100.func('MSO_Usb_EnumDevices',        'int',  ['uint8 *']);
const fnRelease = mso100.func('MSO_Usb_ReleaseEnumDevices', 'void', ['uint8 *']);
const fnInfos   = mso100.func('MSO_Usb_ServerInfos',        'int',  ['uint8 *', 'int', 'uint8 *', 'int']);
const fnInfosRel= mso100.func('MSO_Usb_ServerInfosRelease', 'void', ['uint8 *']);

// 4-byte buffer to hold the pointer value (32-bit)
const listPtrBuf = Buffer.alloc(4);
const enumRet = fnEnum(listPtrBuf);
console.log('MSO_Usb_EnumDevices:', enumRet, '| listPtrBuf:', listPtrBuf.toString('hex'));

if (enumRet > 0) {
  const infoBuf = Buffer.alloc(HWINFO_BUF);
  for (let i = 0; i < enumRet; i++) {
    const infoRet = fnInfos(listPtrBuf, i, infoBuf, HWINFO_BUF);
    console.log(`  Device[${i}] ret=${infoRet}`);
    if (infoRet >= 0) {
      const end = infoBuf.indexOf(0);
      const serial = infoBuf.toString('ascii', 0, end > 0 ? end : 64).trim();
      console.log(`  Serial: "${serial}"`);
    }
  }
  fnRelease(listPtrBuf);
  console.log('Released enum list');
}

console.log('DONE');
