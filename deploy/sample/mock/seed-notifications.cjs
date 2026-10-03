const fs = require('node:fs');
async function main() {
  const password = fs.readFileSync('/run/secrets/ntfy-publisher-password','utf8');
  const samples = [
    ['Backup completed', 'The fictional nightly backup copied 32 GiB successfully.', '3', 'white_check_mark', '/#operations'],
    ['Storage needs attention', 'The fictional storage pool is 78 percent full. Review available capacity.', '5', 'warning', '/#operations'],
    ['Photos imported', '42 fictional photos were added to the sample library.', '2', 'camera', '/#media'],
    ['Media library refreshed', 'The fictional media library has 246 movies and 38 series.', '1', 'movie_camera', '/#media'],
    ['Gather lab is connected', 'Real broker delivery, fictional service events. Test All, Unread, and High priority filters.', '4', 'bell', '/notifications'],
  ];
  for (const [title, message, priority, tags, path] of samples) {
    const response = await fetch('http://ntfy:8080/gather', { method: 'POST', headers: {
      Authorization: 'Basic ' + Buffer.from('gather-publisher:' + password).toString('base64'),
      Title: title, Priority: priority, Tags: tags, Click: 'https://localhost:8443' + path,
    }, body: message, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Error('Broker publish failed: ' + response.status);
    console.log('Published: ' + title);
  }
}
main().catch(e => { console.error(e.message); process.exitCode=1; });
