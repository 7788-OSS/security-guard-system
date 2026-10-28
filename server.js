'use strict';

/* 安盾安保 · 保安管理系统 后端服务
 * node:http 提供 REST API + 静态文件服务，MySQL（security_db）持久化
 * 启动：node server.js  （默认端口 8080）
 * 数据库：localhost:3306  root / 123456  可用 Navicat 直接管理
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const CURRENT_USER = 'BA-0231'; // 演示账号：张伟

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '123456',
  database: process.env.MYSQL_DATABASE || 'security_db',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  // 云数据库（如 TiDB Cloud / Aiven）通常要求 TLS，本地 MySQL 不需要
  ...(process.env.MYSQL_SSL === '1' ? { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: false } } : {})
});

/* ==================== 基础工具 ==================== */
const pad = n => String(n).padStart(2, '0');
function keyOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(base, n) { const d = new Date(base); d.setDate(d.getDate() + n); return d; }
function nowHM(d = new Date()) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function stamp(d = new Date()) { return `${keyOf(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function hm(t) { if (!t || t === '--') return -1; const [h, m] = String(t).split(':').map(Number); return h * 60 + m; }
function shiftMonth(y, m, delta) { const d = new Date(y, m - 1 + delta, 1); return { y: d.getFullYear(), m: d.getMonth() + 1 }; }
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function genId(prefix) { return prefix + Date.now().toString().slice(-8); }

/* ==================== 种子数据 ==================== */
async function seed() {
  const [[{ c }]] = await pool.query('SELECT COUNT(*) AS c FROM users');
  if (c) return;

  const NOW = new Date();
  const TODAY = keyOf(NOW);
  const day = n => keyOf(addDays(NOW, n));
  const created = n => stamp(addDays(NOW, n));

  const projects = [
    ['p1', '滨江华府', '滨江区江汉路 88 号', 16, '2h', ['东门岗亭', '地下车库', '消防通道', '配电房']],
    ['p2', '城东工业园', '城东区兴业路 12 号', 12, '4h', ['园区大门', '1号厂房', '仓库区']],
    ['p3', '星河湾广场', '高新区星河大道 6 号', 10, 'half', ['南广场', '北门', '监控室']],
    ['p4', '中央公园', '市中心人民路 1 号', 8, '4h', ['东入口', '西入口', '湖区', '儿童乐园']],
    ['p5', '地铁上盖中心', '轨道交通 2 号线广场站', 9, '1h', ['换乘大厅', 'B1 车库', '设备层']]
  ];
  for (const p of projects) {
    await pool.query('INSERT INTO projects (id,name,address,guards,freq,checkpoints) VALUES (?,?,?,?,?,?)',
      [p[0], p[1], p[2], p[3], p[4], JSON.stringify(p[5])]);
  }

  const staff = [
    ['张伟', 'BA-0231', 'p1', '白班', '在岗', '07:52', 92],
    ['李强', 'BA-0187', 'p1', '夜班', '在岗', '19:48', 88],
    ['王磊', 'BA-0209', 'p1', '白班', '在岗', '07:58', 95],
    ['陈晨', 'BA-0216', 'p1', '夜班', '休息', null, 0],
    ['孙浩', 'BA-0244', 'p1', '白班', '请假', null, 0],
    ['赵刚', 'BA-0154', 'p2', '白班', '在岗', '08:03', 81],
    ['周洋', 'BA-0198', 'p2', '夜班', '在岗', '19:55', 90],
    ['吴迪', 'BA-0261', 'p2', '白班', '在岗', '07:49', 86],
    ['郑凯', 'BA-0173', 'p2', '白班', '休息', null, 0],
    ['刘洋', 'BA-0220', 'p3', '白班', '在岗', '07:57', 93],
    ['徐磊', 'BA-0250', 'p3', '夜班', '在岗', '19:50', 89],
    ['马超', 'BA-0166', 'p3', '白班', '在岗', null, 84],
    ['高翔', 'BA-0237', 'p4', '白班', '在岗', '07:46', 96],
    ['林峰', 'BA-0283', 'p4', '夜班', '在岗', '19:52', 91],
    ['黄勇', 'BA-0191', 'p5', '白班', '在岗', '07:55', 97],
    ['谢军', 'BA-0272', 'p5', '夜班', '在岗', '19:58', 94]
  ];
  for (const s of staff) {
    await pool.query('INSERT INTO users (code,name,project_id,shift,status,phone,patrol) VALUES (?,?,?,?,?,?,?)',
      [s[1], s[0], s[2], s[3], s[4], s[1] === CURRENT_USER ? '138****6621' : '', s[6]]);
    if (s[5] && s[1] !== CURRENT_USER) {
      await pool.query('INSERT INTO punches (user_code,day,in_time,in_status) VALUES (?,?,?,?)',
        [s[1], TODAY, s[5], hm(s[5]) > hm('08:00') ? '迟到' : '正常']);
    }
  }

  const insReq = (id, kind, applicant, code, payload, status, createdAt, reviewedAt, review) =>
    pool.query('INSERT INTO requests (id,kind,applicant,user_code,payload,status,created_at,reviewed_at,review) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, kind, applicant, code, JSON.stringify(payload), status, createdAt, reviewedAt, review]);

  await insReq('L' + hashStr('leave-1'), 'leave', '张伟', CURRENT_USER,
    { type: '年假', start: day(6), end: day(7), days: 2, handover: '王磊', reason: '陪同家人体检，需连续休息两天' },
    'pending', created(-2), null, null);
  await insReq('L' + hashStr('leave-2'), 'leave', '李强', 'BA-0187',
    { type: '事假', start: day(3), end: day(3), days: 1, handover: '张伟', reason: '孩子学校家长会，需请假半天处理' },
    'pending', created(-1), null, null);
  await insReq('L' + hashStr('leave-3'), 'leave', '张伟', CURRENT_USER,
    { type: '病假', start: day(-12), end: day(-11), days: 2, handover: '李强', reason: '感冒发烧，医院建议居家休息两天' },
    'approved', created(-13), created(-12), null);
  await insReq('L' + hashStr('leave-4'), 'leave', '张伟', CURRENT_USER,
    { type: '事假', start: day(-2), end: day(-2), days: 1, handover: '王磊', reason: '家中有事需要回老家处理' },
    'rejected', created(-4), created(-3), '项目临时缺人，建议改期');
  await insReq('S' + hashStr('swap-1'), 'swap', '王磊', 'BA-0209',
    { date: day(2), fromShift: '夜班 20:00-08:00', toShift: '白班 08:00-20:00', colleague: '张伟', reason: '家中有事，需要调整当日班次' },
    'pending', created(-1), null, null);
  await insReq('S' + hashStr('swap-2'), 'swap', '张伟', CURRENT_USER,
    { date: day(4), fromShift: '白班 08:00-20:00', toShift: '夜班 20:00-08:00', colleague: '李强', reason: '需要陪同家人就医，申请与夜班同事互换' },
    'pending', stamp(new Date(NOW.getTime() - 3600000)), null, null);
  await insReq('S' + hashStr('swap-3'), 'swap', '张伟', CURRENT_USER,
    { date: day(-15), fromShift: '白班 08:00-20:00', toShift: '夜班 20:00-08:00', colleague: '周洋', reason: '个人事务调整' },
    'approved', created(-17), created(-16), null);
  await insReq('R' + hashStr('resign-1'), 'resignation', '赵刚', 'BA-0154',
    { lastDay: day(24), reason: '个人原因', note: '已与项目沟通，待招到替班人员后办理交接', handover: '周洋' },
    'pending', created(-2), null, null);

  // 张伟今日首轮巡逻（仅当时间已过 08:40）
  if (NOW.getHours() * 60 + NOW.getMinutes() > 520) {
    await pool.query('INSERT INTO patrol_records (user_code,day,due,time,checkpoints,note) VALUES (?,?,?,?,?,?)',
      [CURRENT_USER, TODAY, '08:00', '08:03', JSON.stringify(projects[0][5]), '第一轮巡逻完成，无异常']);
  }

  // 上月工资单
  const pm = shiftMonth(NOW.getFullYear(), NOW.getMonth() + 1, -1);
  const monthKey = `${pm.y}-${pad(pm.m)}`;
  await pool.query('INSERT INTO salaries (user_code,month_key,status) VALUES (?,?,?)', [CURRENT_USER, monthKey, 'pending']);
  const items = [
    ['基本工资', '白班 26 天 × 173 元', 4500, 'income'],
    ['岗位津贴', '项目岗位补贴', 300, 'income'],
    ['夜班补贴', '夜班 6 次 × 40 元', 240, 'income'],
    ['巡逻补贴', '完成巡逻 148 轮', 180, 'income'],
    ['全勤奖', '当月无迟到、无缺卡', 200, 'income'],
    ['加班费', '节假日值班 2 天', 420, 'income'],
    ['社保公积金', '个人缴纳部分', -680, 'deduct'],
    ['宿舍水电', '宿舍水电分摊', -30, 'deduct']
  ];
  for (const i of items) {
    await pool.query('INSERT INTO salary_items (user_code,month_key,name,note,amount,type) VALUES (?,?,?,?,?,?)',
      [CURRENT_USER, monthKey, i[0], i[1], i[2], i[3]]);
  }
}

/* ==================== 数据装配 ==================== */
async function currentMonthSalary(userCode) {
  const NOW = new Date();
  const pm = shiftMonth(NOW.getFullYear(), NOW.getMonth() + 1, -1);
  const monthKey = `${pm.y}-${pad(pm.m)}`;
  const [rows] = await pool.query('SELECT * FROM salaries WHERE user_code=? AND month_key=?', [userCode, monthKey]);
  let sal = rows[0];
  if (!sal) {
    await pool.query('INSERT INTO salaries (user_code,month_key,status) VALUES (?,?,?)', [userCode, monthKey, 'pending']);
    sal = { status: 'pending', confirmed_at: '' };
  }
  const [items] = await pool.query('SELECT name,note,amount,type FROM salary_items WHERE user_code=? AND month_key=?', [userCode, monthKey]);
  return { monthKey, status: sal.status, confirmedAt: sal.confirmed_at || '', items: items.map(i => ({ ...i, amount: Number(i.amount) })) };
}

async function bootstrap(userCode) {
  const [[user]] = await pool.query('SELECT * FROM users WHERE code=?', [userCode]);
  const [projectRows] = await pool.query('SELECT * FROM projects');
  const projects = projectRows.map(p => ({ id: p.id, name: p.name, address: p.address, guards: p.guards, freq: p.freq, checkpoints: JSON.parse(p.checkpoints) }));

  const punches = {};
  const [punchRows] = await pool.query('SELECT * FROM punches WHERE user_code=?', [userCode]);
  punchRows.forEach(r => {
    punches[r.day] = { in: r.in_time, out: r.out_time, inStatus: r.in_status, outStatus: r.out_status };
  });

  const patrolDone = {};
  const [patrolRows] = await pool.query('SELECT * FROM patrol_records WHERE user_code=?', [userCode]);
  patrolRows.forEach(r => {
    patrolDone[r.day] = patrolDone[r.day] || {};
    patrolDone[r.day][r.due] = { time: r.time, checkpoints: JSON.parse(r.checkpoints), note: r.note };
  });

  const [reqs] = await pool.query('SELECT * FROM requests ORDER BY created_at DESC');
  const unpack = kind => reqs.filter(r => r.kind === kind).map(r => {
    const p = JSON.parse(r.payload);
    const base = { id: r.id, applicant: r.applicant, status: r.status, createdAt: r.created_at };
    if (r.reviewed_at) base.reviewedAt = r.reviewed_at;
    if (r.review) base.review = r.review;
    return Object.assign(base, p);
  });

  const [staffRows] = await pool.query(
    `SELECT u.name, u.code, u.project_id AS projectId, u.shift, u.status, u.patrol,
            (SELECT in_time FROM punches WHERE user_code=u.code AND day=?) AS todayIn
     FROM users u`, [keyOf(new Date())]);
  const staff = staffRows.map(s => ({ name: s.name, code: s.code, projectId: s.projectId, shift: s.shift, status: s.status, punch: s.todayIn || '--', patrol: s.patrol }));

  return {
    user: { name: user.name, code: user.code, projectId: user.project_id, shift: user.shift === '白班' ? '白班 08:00 - 20:00' : '夜班 20:00 - 08:00', phone: user.phone },
    projects,
    punches,
    patrolDone,
    leaves: unpack('leave'),
    swaps: unpack('swap'),
    resignations: unpack('resignation'),
    disputes: unpack('dispute'),
    salary: await currentMonthSalary(userCode),
    staff
  };
}

/* ==================== API 处理 ==================== */
function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

const KIND_PREFIX = { leave: 'L', swap: 'S', resignation: 'R', dispute: 'D' };

async function handleApi(method, url, body) {
  const u = url.pathname;

  if (method === 'GET' && u === '/api/bootstrap') return bootstrap(CURRENT_USER);

  if (method === 'POST' && u === '/api/punch/in') {
    const today = keyOf(new Date());
    const [rows] = await pool.query('SELECT in_time FROM punches WHERE user_code=? AND day=?', [CURRENT_USER, today]);
    if (rows[0] && rows[0].in_time) throw new HttpError(409, '今日已完成上班打卡');
    const t = nowHM();
    const late = hm(t) > hm('08:00');
    await pool.query(
      `INSERT INTO punches (user_code,day,in_time,in_status) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE in_time=VALUES(in_time), in_status=VALUES(in_status)`,
      [CURRENT_USER, today, t, late ? '迟到' : '正常']);
    return { ok: true, time: t };
  }

  if (method === 'POST' && u === '/api/punch/out') {
    const today = keyOf(new Date());
    const [rows] = await pool.query('SELECT * FROM punches WHERE user_code=? AND day=?', [CURRENT_USER, today]);
    const rec = rows[0];
    if (!rec || !rec.in_time) throw new HttpError(400, '请先完成上班打卡');
    if (rec.out_time) throw new HttpError(409, '今日已完成下班打卡');
    const t = nowHM();
    await pool.query('UPDATE punches SET out_time=?, out_status=? WHERE user_code=? AND day=?',
      [t, hm(t) < hm('20:00') ? '早退' : '正常', CURRENT_USER, today]);
    return { ok: true, time: t };
  }

  if (method === 'POST' && u === '/api/patrol') {
    const { due, checkpoints, note } = body;
    if (!due || !Array.isArray(checkpoints) || !checkpoints.length) throw new HttpError(400, '巡逻数据不完整');
    const today = keyOf(new Date());
    await pool.query(
      `INSERT INTO patrol_records (user_code,day,due,time,checkpoints,note) VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE time=VALUES(time), checkpoints=VALUES(checkpoints), note=VALUES(note)`,
      [CURRENT_USER, today, String(due), nowHM(), JSON.stringify(checkpoints.map(String)), String(note || '无异常')]);
    return { ok: true };
  }

  if (method === 'POST' && u === '/api/request') {
    const { kind, ...fields } = body;
    if (!KIND_PREFIX[kind]) throw new HttpError(400, '未知申请类型');
    const [[me]] = await pool.query('SELECT name FROM users WHERE code=?', [CURRENT_USER]);
    if (kind === 'resignation') {
      const [[{ c }]] = await pool.query(`SELECT COUNT(*) c FROM requests WHERE kind='resignation' AND user_code=? AND status='pending'`, [CURRENT_USER]);
      if (c) throw new HttpError(409, '已有待审批的离职申请，请勿重复提交');
    }
    if (kind === 'dispute') {
      const sal = await currentMonthSalary(CURRENT_USER);
      await pool.query(`UPDATE salaries SET status='disputed' WHERE user_code=? AND month_key=?`, [CURRENT_USER, sal.monthKey]);
      fields.month = sal.monthKey;
      fields.amount = sal.items.reduce((s, i) => s + i.amount, 0);
    }
    const id = genId(KIND_PREFIX[kind]);
    await pool.query('INSERT INTO requests (id,kind,applicant,user_code,payload,status,created_at) VALUES (?,?,?,?,?,?,?)',
      [id, kind, me.name, CURRENT_USER, JSON.stringify(fields), 'pending', stamp()]);
    return { ok: true, id };
  }

  if (method === 'POST' && u === '/api/withdraw') {
    const { kind, id } = body;
    if (!KIND_PREFIX[kind]) throw new HttpError(400, '未知申请类型');
    const [r] = await pool.query(`UPDATE requests SET status='withdrawn' WHERE id=? AND kind=? AND status='pending'`, [String(id), kind]);
    if (!r.affectedRows) throw new HttpError(404, '申请不存在或已处理');
    return { ok: true };
  }

  if (method === 'POST' && u === '/api/review') {
    const { kind, id, action, reason } = body;
    if (!KIND_PREFIX[kind]) throw new HttpError(400, '未知申请类型');
    if (!['approve', 'reject'].includes(action)) throw new HttpError(400, '未知审批动作');
    if (action === 'reject' && String(reason || '').trim().length < 2) throw new HttpError(400, '请填写驳回原因');
    const status = action === 'approve' ? 'approved' : 'rejected';
    const [r] = await pool.query(`UPDATE requests SET status=?, reviewed_at=?, review=? WHERE id=? AND kind=? AND status='pending'`,
      [status, stamp(), action === 'reject' ? String(reason).trim() : null, String(id), kind]);
    if (!r.affectedRows) throw new HttpError(404, '申请不存在或已处理');
    if (kind === 'dispute') {
      // 异议处理完毕，恢复工资确认入口
      const now = new Date();
      const pm = shiftMonth(now.getFullYear(), now.getMonth() + 1, -1);
      await pool.query(`UPDATE salaries SET status='pending' WHERE user_code=? AND month_key=? AND status='disputed'`,
        [CURRENT_USER, `${pm.y}-${pad(pm.m)}`]);
    }
    return { ok: true };
  }

  if (method === 'POST' && u === '/api/salary/confirm') {
    const sal = await currentMonthSalary(CURRENT_USER);
    if (sal.status !== 'pending') throw new HttpError(409, '当前工资单状态不可确认');
    await pool.query(`UPDATE salaries SET status='confirmed', confirmed_at=? WHERE user_code=? AND month_key=?`,
      [stamp(), CURRENT_USER, sal.monthKey]);
    return { ok: true };
  }

  if (method === 'POST' && u === '/api/project/freq') {
    const { id, freq } = body;
    if (!['half', '4h', '2h', '1h'].includes(freq)) throw new HttpError(400, '非法巡逻频次');
    const [r] = await pool.query('UPDATE projects SET freq=? WHERE id=?', [freq, String(id)]);
    if (!r.affectedRows) throw new HttpError(404, '项目不存在');
    return { ok: true };
  }

  throw new HttpError(404, '接口不存在');
}

class HttpError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/* ==================== 静态文件 ==================== */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function serveStatic(res, pathname) {
  let fp = pathname === '/' ? '/index.html' : pathname;
  const full = path.normalize(path.join(ROOT, decodeURIComponent(fp)));
  if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not Found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

/* ==================== 服务入口 ==================== */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const body = req.method === 'POST' ? await readBody(req) : {};
      const data = await handleApi(req.method, url, body);
      return json(res, 200, data);
    }
    if (req.method === 'GET') return serveStatic(res, url.pathname);
    json(res, 405, { error: 'Method Not Allowed' });
  } catch (e) {
    if (e instanceof HttpError) return json(res, e.code, { error: e.message });
    console.error(e);
    json(res, 500, { error: '服务器内部错误' });
  }
});

seed()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`安盾安保管理系统已启动: http://localhost:${PORT}`);
      console.log('数据库: MySQL security_db (127.0.0.1:3306, root)');
    });
  })
  .catch(e => {
    console.error('数据库初始化失败，请确认 MySQL 服务已启动：', e.message);
    process.exit(1);
  });
