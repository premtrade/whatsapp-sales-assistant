const data = require('fs').readFileSync('/login.json', 'utf8');
const https = require('https');
const http = require('http');
const url = require('url');

function apiRequest(pathname, method, body, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: pathname,
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) options.headers.Authorization = 'Bearer ' + token;
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  try {
    const loginResp = await apiRequest('/api/auth/login', 'POST', data);
    const loginData = JSON.parse(loginResp.body);
    console.log('Status:', loginData.success);
    if (!loginData.success) { console.log('Error:', loginData.error); return; }
    const token = loginData.data.token;
    console.log('Token obtained, length:', token.length);

    console.log('\n=== GET /api/settings ===');
    const s = await apiRequest('/api/settings', 'GET', null, token);
    const settings = JSON.parse(s.body);
    console.log('Settings count:', settings.length);
    settings.forEach(st => console.log('  -', st.setting_key, '=', st.setting_value));

    console.log('\n=== GET /api/staff/users ===');
    const su = await apiRequest('/api/staff/users', 'GET', null, token);
    const staff = JSON.parse(su.body);
    console.log('Staff count:', staff.data.length);
    staff.data.forEach(u => console.log('  -', u.display_name, '<' + u.email + '>', 'role=' + u.role, 'status=' + u.status));

    console.log('\n=== GET /api/stats/dashboard ===');
    const d = await apiRequest('/api/stats/dashboard', 'GET', null, token);
    const dash = JSON.parse(d.body);
    console.log('Dashboard conversations.total:', dash.data.conversations.total);

    console.log('\n=== PUT /api/settings ===');
    const u = await apiRequest('/api/settings', 'PUT', JSON.stringify({ setting_key: 'auto_reply_enabled', setting_value: 'false' }), token);
    const updated = JSON.parse(u.body);
    console.log('Updated:', updated.setting_key, '=', updated.setting_value);
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
