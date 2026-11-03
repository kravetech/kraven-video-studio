import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// Direct test invocations have the same isolation as package commands.
if(!process.env.KVS_TEST_RUN_DIR) {
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./run.mjs',import.meta.url)),'--entry',process.argv[1],...process.argv.slice(2)],{stdio:'inherit',windowsHide:true});
  if(result.error)throw result.error;
  process.exit(result.status??1);
}
