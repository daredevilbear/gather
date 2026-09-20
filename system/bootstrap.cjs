const path=require('node:path');
if(process.env.GATHER_SYSTEM_DIR){
  try {
    const record=require('./vault.cjs').read('app');
    for(const [key,value] of Object.entries(record.env)){
      if(!/^(HOMEPAGE_|NEXTAUTH_|GATHER_)[A-Z0-9_]+$/.test(key) || typeof value!=='string') throw Error('Invalid configuration');
      process.env[key]=value;
    }
    process.env.GATHER_SYSTEM_REVISION=record.revision;
  } catch { console.error('Gather could not unlock system configuration. Restore the vault and key mounts before starting.'); process.exit(1); }
}
require(path.join(process.cwd(),'server.js'));
