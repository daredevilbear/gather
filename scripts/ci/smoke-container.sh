#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
umask 077
image=$(docker image inspect "${1:?Supply a container image}" --format '{{.Id}}')
root=$(mktemp -d "${TMPDIR:-/tmp}/gather-encrypted.XXXXXX")
id=$(basename "$root")
log="$root/validation.txt"
name="gather-ci-$id"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
init() {
 docker run --rm --network none --user 0:0 --entrypoint node \
  -e GATHER_DOMAIN=demo.local -e GATHER_OIDC_ISSUER=https://identity.demo.local \
  -e GATHER_OIDC_CLIENT_ID=gather-demo -e GATHER_OIDC_CLIENT_SECRET=fixture-client-secret \
  -e GATHER_ADMIN_IDS=demo-admin -v "$root:/setup" "$image" /app/system/initialize-quickstart.cjs
}
{
 printf 'Tested image: %s\nPrivate test data retained at: %s\n' "$image" "$root"
 init
 before=$(shasum -a 256 "$root/keys/"*.key "$root/system-data/"*/settings.sqlite)
 init
 after=$(shasum -a 256 "$root/keys/"*.key "$root/system-data/"*/settings.sqlite)
 test "$before" = "$after"
 echo 'Idempotence: keys and all encrypted databases unchanged'
 docker run --rm --network none --user 1001:1001 --entrypoint node \
  -e GATHER_SYSTEM_DIR=/system-data -v "$root/system-data:/system-data:ro" \
  -v "$root/keys/app.key:/run/secrets/gather-app-key:ro" \
  -v "$root/keys/notification.key:/run/secrets/gather-notification-key:ro" "$image" -e '
  const fs=require("fs"), assert=require("assert/strict"), {DatabaseSync}=require("node:sqlite");
  const vault=require("/app/system/vault.cjs");
  const app=vault.read("app"), notification=vault.read("notification");
  assert.equal(app.env.GATHER_AUTH_ENABLED,"true"); assert.equal(app.env.GATHER_OIDC_CLIENT_ID,"gather-demo");
  assert(Object.keys(app.env).every(k=>/^(GATHER_|NEXTAUTH_)[A-Z0-9_]+$/.test(k)));
  assert.equal(notification.env.NTFY_URL,"http://ntfy:8080");
  for(const p of ["/run/secrets/gather-app-key","/run/secrets/gather-notification-key"]){assert.equal(fs.readFileSync(p).length,32);assert.equal(fs.statSync(p).mode&511,384)}
  for(const scope of ["app","notification","control"]){const db=new DatabaseSync("/system-data/"+scope+"/settings.sqlite",{readOnly:true}); assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");assert.equal(db.prepare("PRAGMA user_version").get().user_version,1);db.close()}
  console.log("UID 1001: both encrypted records decrypt; strict Gather field names; integrity/schema/key checks pass");'
 docker create --name "$name" --network none --user 1001:1001 --cap-drop ALL --security-opt no-new-privileges:true \
  -e GATHER_SYSTEM_DIR=/system-data -e GATHER_OIDC_PROVIDER_ID=gather-oidc \
  -v "$root/system-data:/system-data" -v "$root/config:/app/config" \
  -v "$root/keys/app.key:/run/secrets/gather-app-key:ro" \
  -v "$root/keys/notification.key:/run/secrets/gather-notification-key:ro" "$image" >/dev/null
 docker start "$name" >/dev/null
 i=0
 while [ "$(docker inspect --format '{{.State.Health.Status}}' "$name")" != healthy ]; do
  i=$((i+1)); test "$i" -lt 90; test "$(docker inspect --format '{{.State.Running}}' "$name")" = true; sleep 1
 done
 docker exec "$name" node -e '
  (async () => {
    const response=await fetch("http://127.0.0.1:3000/api/gather/system",{redirect:"manual"});
    const location=response.headers.get("location")||"";
    const denied=[401,403].includes(response.status)||
      ([302,303,307,308].includes(response.status)&&new URL(location,"http://127.0.0.1:3000").pathname==="/auth/signin");
    if(!denied) throw Error("Unauthenticated System settings was not denied; HTTP "+response.status);
    console.log("Unauthenticated System settings: HTTP "+response.status);
  })().catch(error=>{console.error(error.message);process.exit(1)});'
 echo 'Encrypted first boot: healthy; unauthenticated System settings denied'
 docker logs "$name"
 docker rm -f "$name" >/dev/null
 # Preserve the real keys; use a separate freshly generated wrong key only.
 docker run --rm --network none --user 0:0 --entrypoint node -v "$root:/setup" "$image" -e 'const fs=require("fs"),c=require("crypto");fs.writeFileSync("/setup/negative.key",c.randomBytes(32),{mode:384,flag:"wx"});fs.chownSync("/setup/negative.key",1001,1001)'
 set +e
 docker run --rm --network none --user 1001:1001 \
  -e GATHER_SYSTEM_DIR=/system-data -v "$root/system-data:/system-data:ro" -v "$root/config:/app/config" \
  -v "$root/negative.key:/run/secrets/gather-app-key:ro" "$image"
 result=$?
 set -e
 test "$result" -eq 1
 echo 'Wrong-key boot: rejected with exit 1; encryption fails closed'
 # A partial setup must fail without changing the existing key.
 docker run --rm --network none --user 0:0 --entrypoint node -v "$root:/setup" "$image" -e '
  const fs=require("fs"), crypto=require("crypto"), assert=require("assert/strict");
  const p="/setup/partial/keys/app.key"; fs.mkdirSync("/setup/partial/keys",{recursive:true,mode:448});
  const key=crypto.randomBytes(32); fs.writeFileSync(p,key,{flag:"wx",mode:384});
  assert.throws(()=>require("/app/system/initialize-quickstart.cjs").initialize("/setup/partial",{
    GATHER_DOMAIN:"demo.local",GATHER_OIDC_ISSUER:"https://identity.demo.local",
    GATHER_OIDC_CLIENT_ID:"fixture",GATHER_OIDC_CLIENT_SECRET:"fixture-secret",GATHER_ADMIN_IDS:"demo-admin"
  },require("/app/system/vault.cjs").seal),/Partial initialization/);
  assert.deepEqual(fs.readFileSync(p),key);
  console.log("Partial initialization: rejected; existing key unchanged");'
} > "$log" 2>&1 || { cat "$log"; exit 1; }
cat "$log"
