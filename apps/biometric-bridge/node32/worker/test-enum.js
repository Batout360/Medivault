'use strict';
const koffi = require('./node_modules/koffi');
const dllDir = 'C:\\IdemiaL1RdService\\RDService';
process.chdir(dllDir);

const spUsb  = koffi.load(dllDir + '\\Mso_SpUsb.dll');
const mso100 = koffi.load(dllDir + '\\MSO100.dll');
console.log('DLLs loaded');

// SpUsb_EnumDevices - pass a 4-byte buffer for the out-pointer
// Signature from strings: int SpUsb_EnumDevices(void** ppList)  
// BUT koffi crashes with void** - use uint8* and let the DLL write 4 bytes
const fnSpEnum   = spUsb.func('SpUsb_EnumDevices',        'int',  ['uint8 *']);
const fnSpRelease= spUsb.func('SpUsb_ReleaseEnumDevices', 'void', ['uint8 *']);
const fnSpInfos  = spUsb.func('SpUsb_ServerInfos',        'int',  ['uint8 *', 'int', 'uint8 *', 'int']);
const fnSpInfosR = spUsb.func('SpUsb_ServerInfosRelease', 'void', ['uint8 *']);
const fnSpOpen   = spUsb.func('SpUsb_OpenEx',             'int',  ['str', 'uint8 *']);
const fnSpClose  = spUsb.func('SpUsb_Close',              'void', ['uint8 *']);

console.log('SpUsb functions resolved');

// Enumerate
const listBuf = Buffer.alloc(4);
const enumRet = fnSpEnum(listBuf);
console.log('SpUsb_EnumDevices:', enumRet, 'listBuf:', listBuf.toString('hex'));

if (enumRet > 0) {
  for (let i = 0; i < enumRet; i++) {
    const infoBuf = Buffer.alloc(512);
    const r = fnSpInfos(listBuf, i, infoBuf, 512);
    console.log('SpUsb_ServerInfos[' + i + '] ret:', r);
    if (r >= 0) {
      const end = infoBuf.indexOf(0);
      console.log('  Info:', infoBuf.toString('ascii', 0, end > 0 ? Math.min(end, 128) : 128).replace(/[^\x20-\x7E]/g,'').trim());
    }
  }
  fnSpRelease(listBuf);
}

// Also try MSO_Usb_EnumDevices the same way
const fnMsoEnum = mso100.func('MSO_Usb_EnumDevices', 'int', ['uint8 *']);
const fnMsoRel  = mso100.func('MSO_Usb_ReleaseEnumDevices', 'void', ['uint8 *']);
const fnMsoInfo = mso100.func('MSO_Usb_ServerInfos', 'int', ['uint8 *', 'int', 'uint8 *', 'int']);

const msoListBuf = Buffer.alloc(4);
const msoEnumRet = fnMsoEnum(msoListBuf);
console.log('MSO_Usb_EnumDevices:', msoEnumRet, 'buf:', msoListBuf.toString('hex'));

if (msoEnumRet > 0) {
  for (let i = 0; i < msoEnumRet; i++) {
    const infoBuf = Buffer.alloc(512);
    const r = fnMsoInfo(msoListBuf, i, infoBuf, 512);
    console.log('MSO_Usb_ServerInfos[' + i + '] ret:', r);
    if (r >= 0) {
      const end = infoBuf.indexOf(0);
      console.log('  Info:', infoBuf.toString('ascii', 0, end > 0 ? Math.min(end, 128) : 128).replace(/[^\x20-\x7E]/g,'').trim());
    }
  }
  fnMsoRel(msoListBuf);
}

console.log('DONE');
