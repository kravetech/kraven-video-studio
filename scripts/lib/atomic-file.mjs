import {renameSync} from 'node:fs';

// Windows readers or scanners can briefly deny atomic replacement. Keep the
// previous file intact and fail closed if the sharing restriction persists.
export function replaceFileSync(temporary, target) {
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; ; attempt++) {
    try {renameSync(temporary, target); return;}
    catch (error) {
      if (process.platform !== 'win32' || !['EPERM','EACCES','EBUSY'].includes(error.code) || attempt >= 40) throw error;
      Atomics.wait(pause, 0, 0, 25);
    }
  }
}
