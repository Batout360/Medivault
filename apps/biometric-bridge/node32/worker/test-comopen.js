'use strict';
const koffi = require('./node_modules/koffi');
const dllDir = 'C:\\IdemiaL1RdService\\RDService';
process.chdir(dllDir);

const spUsb  = koffi.load(dllDir + '\\Mso_SpUsb.dll');
const mso100 = koffi.load(dllDir + '\\MSO100.dll');
console.log('DLLs loaded');

const fnComOpen  = mso100.func('MSO_ComOpen',  'int', ['str', 'uint8 *']);
const fnInitCom  = mso100.func('MSO_InitCom',  'int', ['uint8 *']);
const fnCloseCom = mso100.func('MSO_CloseCom', 'int', ['uint8 *']);
const fnHwInfo   = mso100.func('MSO_GetHardwareInfo', 'int', ['uint8 *', 'uint8 *', 'int']);
console.log('Functions resolved');

const ports = ['COM3', '\\\\.\\COM3', '3', ''];
for (const port of ports) {
  try {
    const hBuf = Buffer.alloc(4);
    const r = fnComOpen(port, hBuf);
    console.log('MSO_ComOpen("' + port + '") =', r, 'handle:', hBuf.toString('hex'));
    if (r >= 0) {
      const ir = fnInitCom(hBuf);
      console.log('MSO_InitCom =', ir);
      if (ir >= 0) {
        const hw = Buffer.alloc(512);
        const hr = fnHwInfo(hBuf, hw, 512);
        console.log('MSO_GetHardwareInfo =', hr);
        if (hr >= 0) {
          const end = hw.indexOf(0); 
          console.log('Serial:', hw.toString('ascii',0,end>0?Math.min(end,64):64).trim());
        }
        fnCloseCom(hBuf);
      }
      break;
    }
  } catch(e) { console.log('Error on "' + port + '":', e.message); }
}
console.log('DONE');
