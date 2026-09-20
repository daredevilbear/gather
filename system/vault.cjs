const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const PURPOSE = 'gather-system-v1';
function seal(value, key, domain) {
  if (key.length !== 32) throw new Error('Invalid vault key');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`${PURPOSE}:${domain}`));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { version:1, iv:iv.toString('base64'), tag:cipher.getAuthTag().toString('base64'), body:body.toString('base64') };
}
function unseal(envelope, key, domain) {
  if (envelope.version !== 1 || key.length !== 32) throw new Error('Invalid vault');
  const decipher = crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));
  decipher.setAAD(Buffer.from(`${PURPOSE}:${domain}`));
  decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.body,'base64')),decipher.final()]).toString('utf8'));
}
function locations() {
  return { directory:process.env.GATHER_SYSTEM_DIR || '/system-data', appKey:process.env.GATHER_APP_KEY_FILE || '/run/secrets/gather-app-key', notificationKey:process.env.GATHER_NOTIFICATION_KEY_FILE || '/run/secrets/gather-notification-key' };
}
function read(domain) {
  const p=locations();
  return unseal(JSON.parse(fs.readFileSync(path.join(p.directory,domain,'active.enc'),'utf8')),fs.readFileSync(domain==='app'?p.appKey:p.notificationKey),domain);
}
function atomicWrite(file, data, mode=0o600) {
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const temp=file+'.'+crypto.randomUUID()+'.tmp';
  const fd=fs.openSync(temp,'wx',mode);
  try { fs.writeFileSync(fd,typeof data==='string'?data:JSON.stringify(data)); fs.fsyncSync(fd); } finally {fs.closeSync(fd);}
  fs.renameSync(temp,file);
}
module.exports={seal,unseal,locations,read,atomicWrite};
