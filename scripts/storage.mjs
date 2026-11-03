import {existsSync, statfsSync} from 'node:fs';
import path from 'node:path';
import {storageSettings, cleanupPolicy, checkedRoot, installationRoot, inspectJobs, pruneExpiredJobs, assertSpace, measureCacheJobs} from './lib/render-workspace.mjs';

try {
  const args=process.argv.slice(2);
  if(args.some(a=>!['--check','--clean','--apply'].includes(a)) || (args.includes('--apply')&&!args.includes('--clean'))) throw Error('Usage: pnpm storage:status | pnpm storage:clean [--apply]');
  const settings=storageSettings(),policy=cleanupPolicy(settings);
  if(args.includes('--check')) {checkedRoot(settings.root);installationRoot(settings.root,settings.installationId);assertSpace(settings.root);}
  let removed=[];
  // Explicit manual cleanup remains available when automatic startup cleanup is disabled.
  if(args.includes('--apply')&&existsSync(settings.root)) removed=pruneExpiredJobs(settings.root,settings.installationId,Date.now(),undefined,policy);
  const jobs=existsSync(settings.root)?inspectJobs(settings.root,settings.installationId,Date.now(),policy):[];
  const measured=measureCacheJobs(jobs,policy);
  const disk=statfsSync(existsSync(settings.root)?settings.root:path.parse(settings.root).root);
  console.log(JSON.stringify({renderCacheRoot:settings.root,configured:settings.configured,installationId:settings.installationId,
    policy:{...policy,automaticTrigger:'Before supported render and Studio launches; no background schedule',successfulJobCleanup:true,minimumFreeGiB:10},
    freeGiB:Number((Number(disk.bavail)*Number(disk.bsize)/1024**3).toFixed(2)),removed,...measured,
    note:`Cleanup is limited to this installation. Apply first recovers proven abandoned jobs with a fresh ${policy.retentionHours}-hour retention period. Active, unknown, linked and unverifiable legacy jobs are preserved. Expired jobs require a process-use check. The size threshold warns only; it never bypasses retention.`},null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
