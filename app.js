'use strict';

/* ==================== 基础工具 ==================== */
const ROLE_KEY = 'ad_role';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const pad = n => String(n).padStart(2, '0');
const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const WEEK_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

const NOW = new Date();
const TODAY_KEY = keyOf(NOW);

const FREQ = {
  'half': { label: '每半天', text: '每半天 1 次', hours: 6 },
  '4h': { label: '每4小时', text: '每 4 小时 1 次', hours: 4 },
  '2h': { label: '每2小时', text: '每 2 小时 1 次', hours: 2 },
  '1h': { label: '每1小时', text: '每 1 小时 1 次', hours: 1 }
};

const STATUS_META = {
  pending: { label: '待审批', cls: 'orange' },
  approved: { label: '已通过', cls: 'green' },
  rejected: { label: '已驳回', cls: 'red' },
  withdrawn: { label: '已撤回', cls: 'gray' }
};

const PAGES = {
  dashboard: ['工作台', '集中打卡 · 巡逻 · 考勤 · 薪资一站式处理'],
  punch: ['打卡中心', '上班前集中打卡，记录每一次到岗'],
  patrol: ['巡逻打卡', '按项目巡逻频次完成巡逻点签到'],
  leave: ['请假申请', '提交后可撤回，审批进度实时查看'],
  swap: ['调班申请', '与同事互换班次，需项目负责人审批'],
  attendance: ['我的考勤', '查询每日出勤、巡逻与异常记录'],
  salary: ['工资确认', '核对工资明细并确认发放'],
  resignation: ['离职申请', '提交离职申请，可随时撤回'],
  'admin-dashboard': ['管理看板', '项目在岗、打卡与巡逻达标概览'],
  approvals: ['审批中心', '请假、调班、离职与工资异议统一审批'],
  projects: ['项目与巡逻', '按项目配置巡逻频次与巡逻点'],
  staff: ['人员管理', '项目保安在岗状态与今日打卡']
};

const KIND_ARRAY = { leave: 'leaves', swap: 'swaps', resignation: 'resignations', dispute: 'disputes' };

let state = null;
let role = localStorage.getItem(ROLE_KEY) || 'guard';
let currentPage = role === 'admin' ? 'admin-dashboard' : 'dashboard';
let approvalTab = 'leave';
let pendingConfirm = null;
let pendingReject = null;

/* ==================== API ==================== */
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
  return data;
}

function post(url, body) {
  return api(url, { method: 'POST', body: body || {} });
}

async function refresh() {
  state = await api('/api/bootstrap');
}

/* ==================== 初始化 ==================== */
init();

async function init() {
  try {
    await refresh();
  } catch (e) {
    document.body.innerHTML = `<div style="max-width:520px;margin:120px auto;padding:32px;font-family:'Segoe UI',sans-serif;border:1px solid #e5e7eb;border-radius:12px;text-align:center">
      <h2 style="margin:0 0 12px">无法连接后端服务</h2>
      <p style="color:#6b7280">请先运行 <strong>start.bat</strong> 启动服务器（默认 http://localhost:8080），然后刷新本页。</p>
    </div>`;
    return;
  }
  applyShell();
  bindEvents();
  initDates();
  route(currentPage);
  tick();
  setInterval(tick, 1000);
}

function applyShell() {
  $('#topName').textContent = state.user.name;
  $('#topMeta').textContent = `保安员 · ${state.user.code}`;
  $('#topAvatar').textContent = state.user.name.slice(0, 1);
  $('#sideProjectName').textContent = currentProject().name;
  $('#sideShift').textContent = state.user.shift;
  $$('.role-switch button').forEach(b => b.classList.toggle('active', b.dataset.role === role));
  $$('.nav-group').forEach(g => g.classList.toggle('is-hidden', g.dataset.roleGroup !== role));
}

function initDates() {
  const t = TODAY_KEY;
  $('#leaveStart').min = t;
  $('#leaveStart').value = t;
  $('#leaveEnd').min = t;
  $('#leaveEnd').value = t;
  $('#swapDate').min = t;
  $('#swapDate').value = t;
  const last = addDays(NOW, 30);
  $('#resignLastDay').min = t;
  $('#resignLastDay').value = keyOf(last);
  $('#attMonth').max = t.slice(0, 7);
  $('#attMonth').value = t.slice(0, 7);
  updateLeaveDays();
}

/* ==================== 日期与格式化 ==================== */
function keyOf(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseKey(k) {
  const [y, m, d] = String(k).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtCN(d) {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function nowHM(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function stamp(d = new Date()) {
  return `${keyOf(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function hm(t) {
  if (!t || t === '--') return -1;
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function money(n) {
  return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function money0(n) {
  return Number(n).toLocaleString('zh-CN');
}

function shiftMonth(y, m, delta) {
  const d = new Date(y, m - 1 + delta, 1);
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

/* ==================== 数据（由后端提供） ==================== */
function currentProject() {
  return state.projects.find(p => p.id === state.user.projectId) || state.projects[0];
}

function projectById(id) {
  return state.projects.find(p => p.id === id);
}

/* ==================== 路由 ==================== */
function route(page) {
  if (!PAGES[page]) page = role === 'admin' ? 'admin-dashboard' : 'dashboard';
  currentPage = page;
  const meta = PAGES[page];
  $('#pageTitle').textContent = meta[0];
  $('#pageSub').textContent = meta[1];
  document.title = `${meta[0]} · 安盾保安管理系统`;
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  $$('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  renderPage(page);
  updateBadges();
  window.scrollTo({ top: 0 });
  closeSidebar();
}

function renderPage(page) {
  switch (page) {
    case 'dashboard': renderDashboard(); break;
    case 'punch': renderPunch(); break;
    case 'patrol': renderPatrol(); break;
    case 'leave': renderLeave(); break;
    case 'swap': renderSwap(); break;
    case 'attendance': renderAttendance(); break;
    case 'salary': renderSalary(); break;
    case 'resignation': renderResignation(); break;
    case 'admin-dashboard': renderAdminDashboard(); break;
    case 'approvals': renderApprovals(); break;
    case 'projects': renderProjects(); break;
    case 'staff': renderStaff(); break;
  }
}

function switchRole(r) {
  if (r === role) return;
  role = r;
  localStorage.setItem(ROLE_KEY, r);
  $$('.role-switch button').forEach(b => b.classList.toggle('active', b.dataset.role === r));
  $$('.nav-group').forEach(g => g.classList.toggle('is-hidden', g.dataset.roleGroup !== r));
  route(r === 'admin' ? 'admin-dashboard' : 'dashboard');
}

/* ==================== 业务计算 ==================== */
function getRounds() {
  const p = currentProject();
  const list = [];
  for (let h = 8; h < 20; h += FREQ[p.freq].hours) list.push(`${pad(h)}:00`);
  return list;
}

function roundStatus(due) {
  const done = (state.patrolDone[TODAY_KEY] || {})[due];
  if (done) return 'done';
  const n = nowMinutes();
  const d = hm(due);
  if (n > d + 30) return 'overdue';
  if (n >= d - 10) return 'due';
  return 'upcoming';
}

function todayPatrolStats() {
  const rounds = getRounds();
  const done = state.patrolDone[TODAY_KEY] || {};
  const doneCount = rounds.filter(d => done[d]).length;
  return { total: rounds.length, done: doneCount, percent: rounds.length ? Math.round(doneCount / rounds.length * 100) : 100 };
}

function nextPatrolLabel() {
  const rounds = getRounds();
  const done = state.patrolDone[TODAY_KEY] || {};
  const pending = rounds.filter(d => !done[d]);
  if (!pending.length) return '今日巡逻已全部完成';
  const n = nowMinutes();
  const overdue = pending.find(d => hm(d) + 30 < n);
  if (overdue) return `${overdue} · 已逾期`;
  const next = pending.find(d => hm(d) + 30 >= n) || pending[0];
  const diff = hm(next) - n;
  if (diff > 0) return `${next} · ${diff} 分钟后`;
  return `${next} · 请尽快打卡`;
}

function approvedLeaveOn(k) {
  return state.leaves.find(l => l.applicant === state.user.name && l.status === 'approved' && k >= l.start && k <= l.end);
}

function dayInfo(date) {
  const k = keyOf(date);
  const rec = state.punches[k];
  if (k === TODAY_KEY) {
    if (rec && rec.in) {
      const late = rec.inStatus === '迟到';
      return {
        code: late ? 'late' : 'normal', in: rec.in, out: rec.out || '--',
        statusLabel: late ? '迟到' : '出勤', note: rec.out && rec.outStatus === '早退' ? '下班打卡早于 20:00' : ''
      };
    }
    return { code: 'pending', in: '--', out: '--', statusLabel: '待打卡', note: '今日尚未完成上班打卡' };
  }
  const leave = approvedLeaveOn(k);
  if (leave) {
    return { code: 'leave', in: '--', out: '--', statusLabel: '请假', note: `${leave.type} · ${leave.reason}` };
  }
  if (date.getDay() === 0) {
    return { code: 'rest', in: '--', out: '--', statusLabel: '轮休', note: '每周轮休' };
  }
  const seed = (date.getDate() * 7 + date.getMonth() * 3 + date.getFullYear() * 5) % 17;
  if (seed === 0) {
    return { code: 'missing', in: '--', out: '20:02', statusLabel: '缺卡', note: '上班未打卡，请联系负责人补卡' };
  }
  if (seed === 5 || seed === 12) {
    return { code: 'late', in: '08:16', out: '20:05', statusLabel: '迟到', note: '上班打卡晚于 08:00' };
  }
  return { code: 'normal', in: '07:51', out: '20:04', statusLabel: '出勤', note: '' };
}

function patrolRate(date) {
  if (keyOf(date) === TODAY_KEY) {
    const t = todayPatrolStats();
    return t.total ? t.percent : 100;
  }
  return 84 + hashStr(keyOf(date)) % 17;
}

function monthStats(y, m) {
  const total = new Date(y, m, 0).getDate();
  let work = 0, attended = 0, late = 0, early = 0, leaveDays = 0, missing = 0, pSum = 0, pN = 0;
  for (let day = 1; day <= total; day++) {
    const date = new Date(y, m - 1, day);
    if (keyOf(date) > TODAY_KEY) break;
    const info = dayInfo(date);
    if (info.code === 'rest') continue;
    work++;
    if (info.code === 'normal' || info.code === 'late') {
      attended++;
      if (info.code === 'late') late++;
      if (info.out && info.out !== '--' && hm(info.out) < hm('20:00')) early++;
      pSum += patrolRate(date);
      pN++;
    } else if (info.code === 'leave') {
      leaveDays++;
    } else if (info.code === 'missing') {
      missing++;
      pSum += patrolRate(date);
      pN++;
    }
  }
  return { workDays: work, attended, late, early, leaveDays, missing, patrolRate: pN ? Math.round(pSum / pN) : 0 };
}

function calcSalaryTotal() {
  return state.salary.items.reduce((s, i) => s + i.amount, 0);
}

function salaryStatusMeta() {
  const st = state.salary.status;
  if (st === 'confirmed') return { label: '已确认', cls: 'green' };
  if (st === 'disputed') return { label: '异议处理中', cls: 'orange' };
  return { label: '待确认', cls: 'orange' };
}

function ownList(kind) {
  return state[KIND_ARRAY[kind]].filter(r => r.applicant === state.user.name);
}

function pendingApprovals() {
  const out = [];
  state.leaves.filter(r => r.status === 'pending').forEach(r => {
    out.push({ kind: 'leave', applicant: r.applicant, title: `${r.type} · ${r.days} 天`, detail: `${r.start} 至 ${r.end}`, createdAt: r.createdAt });
  });
  state.swaps.filter(r => r.status === 'pending').forEach(r => {
    out.push({ kind: 'swap', applicant: r.applicant, title: `调班 · ${r.date}`, detail: `${r.fromShift} → ${r.toShift}`, createdAt: r.createdAt });
  });
  state.resignations.filter(r => r.status === 'pending').forEach(r => {
    out.push({ kind: 'resignation', applicant: r.applicant, title: '离职申请', detail: `最后工作日 ${r.lastDay}`, createdAt: r.createdAt });
  });
  state.disputes.filter(r => r.status === 'pending').forEach(r => {
    out.push({ kind: 'dispute', applicant: r.applicant, title: '工资异议', detail: `${r.month} · ¥${money(r.amount)}`, createdAt: r.createdAt });
  });
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function pendingCount(kind) {
  if (kind === 'leave') return state.leaves.filter(r => r.status === 'pending').length;
  if (kind === 'swap') return state.swaps.filter(r => r.status === 'pending').length;
  if (kind === 'resignation') return state.resignations.filter(r => r.status === 'pending').length;
  if (kind === 'dispute') return state.disputes.filter(r => r.status === 'pending').length;
  return pendingApprovals().length;
}

function updateBadges() {
  const total = pendingApprovals().length;
  const badge = $('#approvalBadge');
  badge.textContent = total;
  badge.style.display = total ? '' : 'none';
  $('#approvalTotalBadge').textContent = `${total} 条待处理`;
  const dot = $('#salaryNavDot');
  dot.classList.toggle('is-hidden', !['pending', 'disputed'].includes(state.salary.status));
}

/* ==================== 工作台 ==================== */
function renderDashboard() {
  const p = currentProject();
  const rec = state.punches[TODAY_KEY];
  const hour = new Date().getHours();
  const greet = hour < 6 ? '凌晨好' : hour < 9 ? '早上好' : hour < 12 ? '上午好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
  $('#heroGreeting').textContent = `${greet}，${state.user.name}`;
  $('#heroProject').textContent = p.name;
  $('#heroShift').textContent = state.user.shift;
  $('#heroStatus').textContent = rec && rec.in ? `已打卡 ${rec.in}` : '未打卡';

  const ms = monthStats(NOW.getFullYear(), NOW.getMonth() + 1);
  const tp = todayPatrolStats();
  const salTotal = calcSalaryTotal();
  const sm = salaryStatusMeta();

  $('#dashStats').innerHTML = [
    statCard('blue', 'i-chart', ms.attended, '天', '本月出勤', `应出勤 ${ms.workDays} 天`),
    statCard('green', 'i-route', tp.percent, '%', '巡逻完成率', `今日 ${tp.done}/${tp.total} 轮`),
    statCard('orange', 'i-alert', ms.late, '次', '本月迟到', `缺卡 ${ms.missing} 次`),
    salStatCard(salTotal, sm)
  ].join('');

  const rounds = getRounds();
  const done = state.patrolDone[TODAY_KEY] || {};
  $('#dashPatrolRing').style.setProperty('--p', tp.percent);
  $('#dashPatrolValue').textContent = tp.percent + '%';
  $('#dashRounds').innerHTML = rounds.slice(0, 4).map((due, i) => {
    const st = roundStatus(due);
    const map = {
      done: ['已完成', 'green'], overdue: ['已逾期', 'red'], due: ['进行中', 'blue'], upcoming: ['待开始', 'gray']
    }[st];
    return `<div class="mini-round">
      <span class="mr-time">${due}</span>
      <div class="mr-body"><strong>第 ${i + 1} 轮巡逻</strong><small>${p.checkpoints.length} 个巡逻点</small></div>
      <span class="badge ${map[1]}">${map[0]}</span>
    </div>`;
  }).join('');

  const todos = [];
  if (state.salary.status === 'pending') {
    todos.push(todoItem('orange', 'i-wallet', '工资待确认', `${state.salary.monthKey} 实发 ¥${money(calcsalarySafe())}`, 'salary'));
  } else if (state.salary.status === 'disputed') {
    todos.push(todoItem('orange', 'i-wallet', '工资异议处理中', '人事正在复核，请耐心等待', 'salary'));
  }
  const leavePending = state.leaves.filter(l => l.applicant === state.user.name && l.status === 'pending').length;
  if (leavePending) todos.push(todoItem('purple', 'i-file', '请假申请待审批', `${leavePending} 条申请等待项目经理处理`, 'leave'));
  const swapPending = state.swaps.filter(l => l.applicant === state.user.name && l.status === 'pending').length;
  if (swapPending) todos.push(todoItem('teal', 'i-swap', '调班申请待审批', `${swapPending} 条调班申请等待审批`, 'swap'));
  if (tp.done < tp.total) todos.push(todoItem('blue', 'i-route', '今日巡逻未完成', `还有 ${tp.total - tp.done} 轮巡逻待打卡`, 'patrol'));
  $('#dashTodos').innerHTML = todos.length ? todos.slice(0, 4).join('') : '<div class="todo-empty">今日事项已全部处理完成</div>';
}

function calcsalarySafe() {
  return calcSalaryTotal();
}

function statCard(color, icon, value, unit, label, sub) {
  return `<div class="stat-card">
    <div class="stat-top"><span class="stat-icon ${color}"><svg class="ico"><use href="#${icon}"></use></svg></span></div>
    <div class="stat-value">${value}<small>${unit}</small></div>
    <div class="stat-label">${label}</div>
    <div class="stat-sub">${sub}</div>
  </div>`;
}

function salStatCard(total, sm) {
  const [yy, mm] = state.salary.monthKey.split('-');
  return `<div class="stat-card">
    <div class="stat-top">
      <span class="stat-icon purple"><svg class="ico"><use href="#i-wallet"></use></svg></span>
      <span class="stat-trend" style="background:${sm.cls === 'green' ? '#ecfdf5' : '#fff7ed'};color:${sm.cls === 'green' ? '#059669' : '#d97706'}">${sm.label}</span>
    </div>
    <div class="stat-value">¥${money0(total)}</div>
    <div class="stat-label">工资确认</div>
    <div class="stat-sub">${yy} 年 ${mm} 月工资</div>
  </div>`;
}

function todoItem(color, icon, title, sub, page) {
  return `<button class="todo-item" data-action="go" data-page="${page}">
    <span class="ti-icon stat-icon ${color}"><svg class="ico"><use href="#${icon}"></use></svg></span>
    <span class="ti-body"><span class="ti-title">${title}</span><span class="ti-sub">${sub}</span></span>
    <svg class="ico ti-arrow"><use href="#i-chevron"></use></svg>
  </button>`;
}

/* ==================== 打卡 ==================== */
function renderPunch() {
  const p = currentProject();
  const rec = state.punches[TODAY_KEY];
  const chip = $('#punchStatusChip');
  const inDone = !!(rec && rec.in);
  const outDone = !!(rec && rec.out);
  if (inDone && outDone) {
    chip.className = 'badge green';
    chip.textContent = '今日已完成';
  } else if (inDone) {
    chip.className = 'badge blue';
    chip.textContent = '在岗中';
  } else {
    chip.className = 'badge orange';
    chip.textContent = '待打卡';
  }
  $('#punchProject').textContent = `${p.name} · 东门岗亭`;
  $('#locCheck').disabled = inDone;
  $('#punchInBtn').disabled = inDone;
  $('#punchInBtn').textContent = inDone ? `已打卡 ${rec.in}` : '上班打卡';
  $('#punchOutBtn').disabled = !inDone || outDone;
  $('#punchOutBtn').textContent = outDone ? `已打卡 ${rec.out}` : '下班打卡';

  $('#punchSuccess').innerHTML = inDone
    ? `<div class="punch-success">
        <span class="ps-icon"><svg class="ico"><use href="#i-check"></use></svg></span>
        <div><strong>上班打卡成功</strong><span>${p.name} · 东门岗亭 · ${rec.inStatus}</span></div>
        <span class="ps-time">${rec.in}</span>
      </div>`
    : '';

  const dayBadge = $('#punchDayBadge');
  dayBadge.className = 'badge ' + (outDone ? 'green' : inDone ? 'blue' : 'orange');
  dayBadge.textContent = outDone ? '已完成' : inDone ? '在岗中' : '待打卡';

  $('#punchTodayRecords').innerHTML = `
    <div class="record-row"><span class="rr-label"><svg class="ico"><use href="#i-clock"></use></svg>上班打卡</span><span class="rr-value ${inDone ? '' : 'empty'}">${inDone ? rec.in : '--:--'}</span></div>
    <div class="record-row"><span class="rr-label"><svg class="ico"><use href="#i-clock"></use></svg>下班打卡</span><span class="rr-value ${outDone ? '' : 'empty'}">${outDone ? rec.out : '--:--'}</span></div>
    <div class="record-row"><span class="rr-label"><svg class="ico"><use href="#i-location"></use></svg>打卡位置</span><span class="rr-value">东门岗亭</span></div>
    <div class="record-row"><span class="rr-label"><svg class="ico"><use href="#i-info"></use></svg>打卡状态</span><span class="badge ${inDone ? (rec.inStatus === '迟到' ? 'orange' : 'green') : 'gray'}">${inDone ? rec.inStatus : '未打卡'}</span></div>`;

  const rows = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(NOW, -i);
    const k = keyOf(d);
    const info = k === TODAY_KEY
      ? (rec && rec.in ? { code: rec.inStatus === '迟到' ? 'late' : 'normal', in: rec.in, out: rec.out || '--', statusLabel: rec.inStatus } : { code: 'pending', in: '--', out: '--', statusLabel: '待打卡' })
      : dayInfo(d);
    const badgeCls = { normal: 'green', late: 'orange', missing: 'red', leave: 'purple', rest: 'gray', pending: 'blue' }[info.code] || 'gray';
    rows.push(`<div class="wk-row">
      <span class="wk-date">${pad(d.getMonth() + 1)}-${pad(d.getDate())}</span>
      <span class="wk-day">周${WEEK_SHORT[d.getDay()]}</span>
      <span class="wk-time">${info.in !== '--' ? info.in + ' / ' + info.out : '--'}</span>
      <span class="badge ${badgeCls}">${info.statusLabel}</span>
    </div>`);
  }
  $('#punchWeek').innerHTML = rows.join('');
}

async function punchIn() {
  if (state.punches[TODAY_KEY] && state.punches[TODAY_KEY].in) {
    toast('今日已完成上班打卡', 'warn');
    return;
  }
  if (!$('#locCheck').checked) {
    toast('请先确认已到达项目岗亭', 'warn');
    return;
  }
  try {
    const r = await post('/api/punch/in');
    await refresh();
    renderPunch();
    $('#heroStatus').textContent = `已打卡 ${r.time}`;
    toast(`打卡成功 · ${r.time} 已记录到岗`, 'success');
  } catch (e) {
    toast(e.message, 'warn');
  }
}

async function punchOut() {
  const rec = state.punches[TODAY_KEY];
  if (!rec || !rec.in) {
    toast('请先完成上班打卡', 'warn');
    return;
  }
  if (rec.out) {
    toast('今日已完成下班打卡', 'warn');
    return;
  }
  try {
    const r = await post('/api/punch/out');
    await refresh();
    renderPunch();
    toast(`下班打卡成功 · ${r.time}，辛苦了`, 'success');
  } catch (e) {
    toast(e.message, 'warn');
  }
}

/* ==================== 巡逻 ==================== */
function renderPatrol() {
  const p = currentProject();
  const freq = FREQ[p.freq];
  const rounds = getRounds();
  const done = state.patrolDone[TODAY_KEY] || {};
  const stats = todayPatrolStats();

  $('#patrolProjectName').textContent = p.name;
  $('#patrolAddr').textContent = p.address;
  $('#patrolFreqBadge').textContent = freq.label;
  $('#patrolFreqText').textContent = freq.text;
  $('#patrolRoundText').textContent = `${stats.done} / ${stats.total} 轮`;
  $('#patrolRing').style.setProperty('--p', stats.percent);
  $('#patrolRingValue').textContent = stats.percent + '%';
  $('#checkpointCount').textContent = `${p.checkpoints.length} 个`;

  const latest = rounds.map(due => done[due]).filter(Boolean).pop();
  $('#patrolCheckpoints').innerHTML = p.checkpoints.map((cp, i) => {
    const ok = latest && latest.checkpoints.includes(cp);
    return `<div class="cp-row ${ok ? 'done' : ''}">
      <span class="cp-index">${i + 1}</span>
      <div class="cp-body"><strong>${esc(cp)}</strong><small>${ok ? `最近签到 ${latest.time}` : '需现场拍照签到'}</small></div>
      <span class="cp-state ${ok ? 'done' : 'todo'}">${ok ? '已完成' : '待打卡'}</span>
    </div>`;
  }).join('');

  const overdue = rounds.filter(d => roundStatus(d) === 'overdue').length;
  const statusBadge = $('#patrolStatusBadge');
  if (!rounds.filter(d => !done[d]).length) {
    statusBadge.className = 'badge green';
    statusBadge.textContent = '今日已完成';
  } else if (overdue) {
    statusBadge.className = 'badge red';
    statusBadge.textContent = `${overdue} 轮逾期`;
  } else {
    statusBadge.className = 'badge blue';
    statusBadge.textContent = '进行中';
  }

  const statusMap = {
    done: ['已完成', 'green', ''],
    overdue: ['已逾期', 'red', '已超过计划时间，请尽快完成本轮巡逻'],
    due: ['待巡逻', 'blue', '请前往巡逻点逐点签到'],
    upcoming: ['待开始', 'gray', '尚未到巡逻时间，可提前打卡']
  };
  $('#patrolRounds').innerHTML = rounds.map((due, i) => {
    const st = roundStatus(due);
    const rec = done[due];
    const m = statusMap[st];
    const meta = rec ? `完成时间 ${rec.time} · ${rec.checkpoints.length} 个点已签到` : m[2];
    const btn = st === 'done'
      ? `<button class="btn small ghost" data-action="start-patrol" data-due="${due}">查看记录</button>`
      : st === 'upcoming'
        ? `<button class="btn small ghost" data-action="start-patrol" data-due="${due}">提前打卡</button>`
        : `<button class="btn small primary" data-action="start-patrol" data-due="${due}">开始巡逻</button>`;
    return `<div class="round-item ${st}">
      <span class="round-time">${due}</span>
      <span class="round-line"><span class="round-dot"></span></span>
      <div class="round-body">
        <div class="round-title">第 ${i + 1} 轮巡逻 <span class="badge ${m[1]}">${m[0]}</span></div>
        <div class="round-meta">${meta}</div>
      </div>
      ${btn}
    </div>`;
  }).join('');
}

function openPatrolModal(due) {
  const p = currentProject();
  const rec = (state.patrolDone[TODAY_KEY] || {})[due];
  const readonly = !!rec;
  const body = `<form id="patrolForm">
    <input type="hidden" name="due" value="${esc(due)}">
    <div class="patrol-modal-note">${readonly
      ? `本轮完成于 ${esc(rec.time)}，${rec.checkpoints.length} 个巡逻点均已签到。`
      : '请到达每个巡逻点后逐项签到，全部完成并提交后，本轮巡逻才会被记录。'}</div>
    ${p.checkpoints.map((cp, i) => {
      const checked = rec ? rec.checkpoints.includes(cp) : false;
      return `<label class="check-item">
        <input type="checkbox" name="cp" value="${esc(cp)}" ${checked ? 'checked' : ''} ${readonly ? 'disabled' : ''}>
        <div class="ci-body"><strong>${esc(cp)}</strong><small>巡逻点 ${i + 1} · 需现场拍照签到</small></div>
        <span class="ci-state">${checked ? '已签到' : ''}</span>
      </label>`;
    }).join('')}
    ${readonly
      ? `<div class="patrol-modal-note" style="margin-top:12px;margin-bottom:0">巡逻备注：${esc(rec.note || '无异常')}</div>`
      : `<div class="field" style="margin-top:12px"><label>巡逻备注（选填）</label><textarea name="note" rows="2" placeholder="如发现异常，请在此说明..."></textarea></div>`}
  </form>`;
  openModal({
    title: readonly ? '巡逻记录' : '巡逻打卡',
    subtitle: `${p.name} · ${due} 轮次`,
    body,
    footer: readonly
      ? '<button class="btn ghost" data-action="modal-close">关闭</button>'
      : '<button class="btn ghost" data-action="modal-close">取消</button><button class="btn primary" data-action="patrol-submit">确认打卡</button>'
  });
}

async function submitPatrol() {
  const form = $('#patrolForm');
  if (!form) return;
  const checks = $$('input[name="cp"]', form);
  if (checks.filter(c => c.checked).length !== checks.length) {
    toast('请完成全部巡逻点签到后再提交', 'warn');
    return;
  }
  const due = form.querySelector('[name="due"]').value;
  const note = (form.querySelector('[name="note"]') || {}).value || '';
  try {
    await post('/api/patrol', { due, checkpoints: checks.map(c => c.value), note: note.trim() || '无异常' });
    await refresh();
    closeModal();
    renderPatrol();
    toast(`巡逻打卡成功 · ${checks.length} 个巡逻点已签到`, 'success');
  } catch (e) {
    toast(e.message, 'warn');
  }
}

/* ==================== 请假 ==================== */
function updateLeaveDays() {
  const s = $('#leaveStart').value;
  const e = $('#leaveEnd').value;
  if (!s || !e || e < s) {
    $('#leaveDays').value = '—';
    return;
  }
  const days = Math.round((parseKey(e) - parseKey(s)) / 86400000) + 1;
  $('#leaveDays').value = `${days} 天`;
}

async function submitLeave(form) {
  const fd = new FormData(form);
  const type = fd.get('type');
  const handover = fd.get('handover');
  const start = fd.get('start');
  const end = fd.get('end');
  const reason = String(fd.get('reason') || '').trim();
  if (!start || !end) return toast('请选择请假日期', 'warn');
  if (end < start) return toast('结束日期不能早于开始日期', 'warn');
  if (reason.length < 4) return toast('请填写完整的请假事由', 'warn');
  const days = Math.round((parseKey(end) - parseKey(start)) / 86400000) + 1;
  try {
    await post('/api/request', { kind: 'leave', type, start, end, days, handover, reason });
    await refresh();
    form.reset();
    $('#leaveStart').value = TODAY_KEY;
    $('#leaveEnd').value = TODAY_KEY;
    updateLeaveDays();
    renderLeave();
    updateBadges();
    toast('请假申请已提交，等待项目经理审批', 'success');
  } catch (e) {
    toast(e.message, 'warn');
  }
}

function renderLeave() {
  const list = ownList('leave').slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!list.length) {
    $('#leaveRecords').innerHTML = '<div class="table-empty">暂无请假记录</div>';
    return;
  }
  $('#leaveRecords').innerHTML = `<table>
    <thead><tr><th>申请编号</th><th>类型</th><th>起止日期</th><th>天数</th><th>交接人</th><th>状态</th><th>操作</th></tr></thead>
    <tbody>${list.map(r => `<tr>
      <td class="num">${esc(r.id)}</td>
      <td><strong>${esc(r.type)}</strong></td>
      <td class="num">${esc(r.start)} 至 ${esc(r.end)}</td>
      <td class="num">${r.days} 天</td>
      <td>${esc(r.handover)}</td>
      <td>${statusBadge(r.status)}</td>
      <td>${r.status === 'pending' ? `<button class="mini-link danger" data-action="withdraw" data-kind="leave" data-id="${esc(r.id)}">撤回</button>` : '<span class="muted">—</span>'}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

/* ==================== 调班 ==================== */
async function submitSwap(form) {
  const fd = new FormData(form);
  const date = fd.get('date');
  const colleague = fd.get('colleague');
  const fromShift = fd.get('fromShift');
  const toShift = fd.get('toShift');
  const reason = String(fd.get('reason') || '').trim();
  if (!date) return toast('请选择调班日期', 'warn');
  if (!reason || reason.length < 4) return toast('请填写调班原因', 'warn');
  try {
    await post('/api/request', { kind: 'swap', date, fromShift, toShift, colleague, reason });
    await refresh();
    form.reset();
    $('#swapDate').value = TODAY_KEY;
    renderSwap();
    updateBadges();
    toast('调班申请已提交，等待项目经理审批', 'success');
  } catch (e) {
    toast(e.message, 'warn');
  }
}

function renderSwap() {
  const list = ownList('swap').slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  $('#swapRecords').innerHTML = list.length ? `<table>
    <thead><tr><th>申请编号</th><th>调班日期</th><th>班次调整</th><th>接班同事</th><th>状态</th><th>操作</th></tr></thead>
    <tbody>${list.map(r => `<tr>
      <td class="num">${esc(r.id)}</td>
      <td class="num">${esc(r.date)}</td>
      <td><strong>${esc(r.fromShift)}</strong><span class="cell-sub">→ ${esc(r.toShift)}</span></td>
      <td>${esc(r.colleague)}</td>
      <td>${statusBadge(r.status)}</td>
      <td>${r.status === 'pending' ? `<button class="mini-link danger" data-action="withdraw" data-kind="swap" data-id="${esc(r.id)}">撤回</button>` : '<span class="muted">—</span>'}</td>
    </tr>`).join('')}</tbody>
  </table>` : '<div class="table-empty">暂无调班记录</div>';

  const rows = [];
  const base = new Date(NOW);
  const mondayOffset = (base.getDay() + 6) % 7;
  const monday = addDays(base, -mondayOffset);
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const isToday = keyOf(d) === TODAY_KEY;
    const isRest = d.getDay() === 0;
    rows.push(`<div class="shift-row ${isToday ? 'today' : ''}">
      <span class="sd"></span>
      <span class="sday">${pad(d.getMonth() + 1)}-${pad(d.getDate())} 周${WEEK_SHORT[d.getDay()]}</span>
      <span class="sshift">${isRest ? '轮休' : isToday ? '白班 08:00-20:00（今日）' : '白班 08:00-20:00'}</span>
      <span class="stime">${isRest ? '休息' : '12h'}</span>
    </div>`);
  }
  $('#shiftWeek').innerHTML = rows.join('');
}

/* ==================== 考勤 ==================== */
function renderAttendance() {
  const val = $('#attMonth').value || TODAY_KEY.slice(0, 7);
  const [y, m] = val.split('-').map(Number);
  $('#attMonthLabel').textContent = `${y} 年 ${m} 月`;
  const ms = monthStats(y, m);

  $('#attStats').innerHTML = [
    ['应出勤', ms.workDays, '天'],
    ['实出勤', ms.attended, '天'],
    ['迟到/早退', `${ms.late}/${ms.early}`, '次'],
    ['请假', ms.leaveDays, '天'],
    ['缺卡', ms.missing, '次']
  ].map(([label, val2, unit]) => `<div class="mini-stat"><span>${label}</span><strong>${val2}<small>${unit}</small></strong></div>`).join('');

  const first = new Date(y, m - 1, 1);
  const total = new Date(y, m, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  let html = ['一', '二', '三', '四', '五', '六', '日'].map(d => `<div class="cal-dow">${d}</div>`).join('');
  for (let i = 0; i < offset; i++) html += '<div class="cal-cell empty"></div>';
  for (let day = 1; day <= total; day++) {
    const date = new Date(y, m - 1, day);
    const k = keyOf(date);
    const isFuture = k > TODAY_KEY;
    let code = 'future';
    let label = '';
    if (!isFuture) {
      const info = dayInfo(date);
      code = info.code;
      label = info.statusLabel;
    }
    html += `<div class="cal-cell ${isFuture ? 'future' : ''} ${k === TODAY_KEY ? 'today' : ''}">
      <span class="cal-day">${day}</span>
      ${label ? `<span class="cal-status st-${code}">${label}</span>` : ''}
    </div>`;
  }
  $('#attCalendar').innerHTML = html;

  const rows = [];
  const lastDay = (y === NOW.getFullYear() && m === NOW.getMonth() + 1) ? NOW.getDate() : total;
  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(y, m - 1, day);
    const info = dayInfo(date);
    const badgeCls = { normal: 'green', late: 'orange', missing: 'red', leave: 'purple', rest: 'gray', pending: 'blue' }[info.code] || 'gray';
    const rate = info.code === 'rest' || info.code === 'leave' ? '—' : patrolRate(date) + '%';
    rows.push(`<tr>
      <td class="num"><strong>${pad(m)}-${pad(day)}</strong><span class="cell-sub">周${WEEK_SHORT[date.getDay()]}</span></td>
      <td>${info.code === 'rest' ? '轮休' : '白班 08:00-20:00'}</td>
      <td class="num">${info.in}</td>
      <td class="num">${info.out}</td>
      <td class="num">${rate}</td>
      <td><span class="badge ${badgeCls}">${info.statusLabel}</span></td>
      <td>${esc(info.note || '—')}</td>
    </tr>`);
  }
  $('#attTable').innerHTML = `<table>
    <thead><tr><th>日期</th><th>班次</th><th>上班</th><th>下班</th><th>巡逻完成</th><th>状态</th><th>备注</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;
}

/* ==================== 工资 ==================== */
function renderSalary() {
  const total = calcSalaryTotal();
  const sm = salaryStatusMeta();
  const monthLabel = state.salary.monthKey.replace('-', ' 年 ') + ' 月';
  $('#salarySummary').innerHTML = `
    <div class="sc-top">
      <div>
        <div class="sc-label">${monthLabel} 工资</div>
        <div class="sc-amount"><small>¥</small>${money(total)}</div>
        <div class="sc-meta">发放日期：次月 15 日 · 招商银行 尾号 6621</div>
      </div>
      <span class="badge">${sm.label}</span>
    </div>
    <div class="sc-foot">
      <div><span>员工</span><strong>${state.user.name} · ${state.user.code}</strong></div>
      <div><span>项目</span><strong>${currentProject().name}</strong></div>
      <div><span>班次</span><strong>白班</strong></div>
    </div>`;

  $('#salaryMonthBadge').textContent = state.salary.monthKey;
  const incomes = state.salary.items.filter(i => i.type === 'income');
  const deducts = state.salary.items.filter(i => i.type === 'deduct');
  const row = i => `<tr>
      <td><strong>${esc(i.name)}</strong></td>
      <td>${esc(i.note)}</td>
      <td class="num ${i.amount < 0 ? 'amount-neg' : 'amount-pos'}">${i.amount < 0 ? '-' : '+'}¥${money(Math.abs(i.amount))}</td>
    </tr>`;
  $('#salaryBreakdown').innerHTML = `<table>
    <thead><tr><th>项目</th><th>计算说明</th><th style="text-align:right">金额</th></tr></thead>
    <tbody>
      <tr class="break-section"><td colspan="3">收入项</td></tr>
      ${incomes.map(row).join('')}
      <tr class="break-section"><td colspan="3">扣款项</td></tr>
      ${deducts.map(row).join('')}
      <tr><td><strong>实发合计</strong></td><td>应发 ¥${money(total - deducts.reduce((s, i) => s + i.amount, 0))} · 扣款 ¥${money(Math.abs(deducts.reduce((s, i) => s + i.amount, 0)))}</td><td class="num amount-pos" style="font-size:15px">¥${money(total)}</td></tr>
    </tbody>
  </table>`;

  if (state.salary.status === 'pending') {
    $('#salaryActions').innerHTML = `<button class="btn ghost" data-action="dispute-salary">对工资有异议</button>
      <button class="btn primary" data-action="confirm-salary"><svg class="ico"><use href="#i-check"></use></svg>确认工资 ¥${money(total)}</button>`;
  } else if (state.salary.status === 'confirmed') {
    $('#salaryActions').innerHTML = `<span class="muted" style="margin-right:auto">已于 ${esc(state.salary.confirmedAt || '')} 确认，工资将于发放日到账</span>
      <button class="btn green" disabled><svg class="ico"><use href="#i-check"></use></svg>已确认</button>`;
  } else {
    $('#salaryActions').innerHTML = `<span class="muted" style="margin-right:auto">异议已提交，人事复核后将恢复确认入口</span>
      <button class="btn ghost" disabled>异议处理中</button>`;
  }

  const smParts = state.salary.monthKey.split('-').map(Number);
  const history = [];
  for (let i = 1; i <= 3; i++) {
    const mm = shiftMonth(smParts[0], smParts[1], -i);
    const amount = total - (i * 110 + 20);
    history.push(`<div class="history-item">
      <span>${mm.y} 年 ${pad(mm.m)} 月</span>
      <strong>¥${money(amount)}</strong>
      <span class="badge green">已确认</span>
    </div>`);
  }
  $('#salaryHistory').innerHTML = `<div class="history-grid">${history.join('')}</div>`;
}

function confirmSalary() {
  const total = calcSalaryTotal();
  askConfirm('确认工资', `确认 ${state.salary.monthKey.replace('-', ' 年 ')} 月实发工资 ¥${money(total)}？确认后视为对本月工资无异议，不可撤回。`, '确认工资', async () => {
    try {
      await post('/api/salary/confirm');
      await refresh();
      renderSalary();
      updateBadges();
      toast('工资已确认，感谢您的核对', 'success');
    } catch (e) {
      toast(e.message, 'warn');
    }
  });
}

function openDisputeModal() {
  if (state.salary.status !== 'pending') return;
  openModal({
    title: '提交工资异议',
    subtitle: '人事将在 2 个工作日内复核',
    body: `<form id="disputeForm"><div class="field">
      <label>异议说明 <em>*</em></label>
      <textarea id="disputeReason" rows="4" placeholder="请说明有误的工资项及正确金额，便于人事快速核对..."></textarea>
    </div></form>`,
    footer: '<button class="btn ghost" data-action="modal-close">取消</button><button class="btn primary" data-action="dispute-submit">提交异议</button>'
  });
}

async function submitDispute() {
  const reason = ($('#disputeReason').value || '').trim();
  if (reason.length < 4) return toast('请填写异议说明', 'warn');
  try {
    await post('/api/request', { kind: 'dispute', reason });
    await refresh();
    closeModal();
    renderSalary();
    updateBadges();
    toast('工资异议已提交，等待人事复核', 'success');
  } catch (e) {
    toast(e.message, 'warn');
  }
}

/* ==================== 离职 ==================== */
async function submitResignation(form) {
  const fd = new FormData(form);
  const lastDay = fd.get('lastDay');
  const reason = fd.get('reason');
  const handover = fd.get('handover');
  const note = String(fd.get('note') || '').trim();
  const ack = form.querySelector('[name="ack"]').checked;
  if (!lastDay) return toast('请选择预计最后工作日', 'warn');
  if (note.length < 4) return toast('请填写离职说明', 'warn');
  if (!ack) return toast('请先阅读并确认离职须知', 'warn');
  if (state.resignations.some(r => r.applicant === state.user.name && r.status === 'pending')) {
    return toast('已有待审批的离职申请，请勿重复提交', 'warn');
  }
  try {
    await post('/api/request', { kind: 'resignation', lastDay, reason, note, handover });
    await refresh();
    form.reset();
    $('#resignLastDay').value = keyOf(addDays(NOW, 30));
    renderResignation();
    updateBadges();
    toast('离职申请已提交，等待项目经理审批', 'success');
  } catch (e) {
    toast(e.message, 'warn');
  }
}

function renderResignation() {
  const list = ownList('resignation').slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = list.find(r => r.status === 'pending') || list.find(r => r.status === 'approved');

  if (active) {
    const pending = active.status === 'pending';
    const step2 = pending ? 'active' : 'done';
    const step3 = pending ? '' : 'active';
    $('#resignationStatus').innerHTML = `<div class="resign-banner">
      <span class="rb-icon"><svg class="ico"><use href="#i-logout"></use></svg></span>
      <div class="rb-main">
        <strong>${pending ? '离职申请待审批' : '离职申请已通过，请完成工作交接'}</strong>
        <span>最后工作日 ${esc(active.lastDay)} · 交接人 ${esc(active.handover)} · 提交于 ${esc(active.createdAt)}</span>
        <div class="resign-steps">
          <span class="rs-step done">提交申请</span>
          <span class="rs-step ${step2}">项目审批</span>
          <span class="rs-step ${step3}">工作交接</span>
          <span class="rs-step">办理离职</span>
        </div>
      </div>
      ${pending ? `<button class="btn danger" data-action="withdraw" data-kind="resignation" data-id="${esc(active.id)}">撤回申请</button>` : ''}
    </div>`;
  } else {
    $('#resignationStatus').innerHTML = '';
  }

  $('#resignationRecords').innerHTML = list.length ? `<table>
    <thead><tr><th>申请编号</th><th>最后工作日</th><th>离职原因</th><th>交接人</th><th>提交时间</th><th>状态</th><th>操作</th></tr></thead>
    <tbody>${list.map(r => `<tr>
      <td class="num">${esc(r.id)}</td>
      <td class="num">${esc(r.lastDay)}</td>
      <td>${esc(r.reason)}<span class="cell-sub">${esc(r.note)}</span></td>
      <td>${esc(r.handover)}</td>
      <td class="num">${esc(r.createdAt)}</td>
      <td>${statusBadge(r.status)}</td>
      <td>${r.status === 'pending' ? `<button class="mini-link danger" data-action="withdraw" data-kind="resignation" data-id="${esc(r.id)}">撤回</button>` : '<span class="muted">—</span>'}</td>
    </tr>`).join('')}</tbody>
  </table>` : '<div class="table-empty">暂无离职记录</div>';
}

/* ==================== 管理看板 ==================== */
function projectPunchStats(p) {
  const rate = p.id === state.user.projectId
    ? (state.punches[TODAY_KEY] && state.punches[TODAY_KEY].in ? 100 : 92)
    : 88 + hashStr(p.id) % 11;
  return { rate, arrived: Math.round(p.guards * rate / 100), total: p.guards };
}

function projectPatrolRate(p) {
  if (p.id === state.user.projectId) {
    const t = todayPatrolStats();
    return t.total ? t.percent : 100;
  }
  return 78 + hashStr(p.id + '-patrol') % 23;
}

function renderAdminDashboard() {
  const staff = state.staff || [];
  const onDuty = staff.filter(s => s.status === '在岗').length;
  const punched = staff.filter(s => s.status === '在岗' && s.punch !== '--').length;
  const pending = pendingApprovals().length;
  const target = state.projects.filter(p => projectPatrolRate(p) >= 90).length;

  $('#adminStats').innerHTML = [
    statCard('blue', 'i-users', onDuty, `/ ${staff.length}`, '今日在岗', '全项目保安出勤统计'),
    statCard('green', 'i-check-square', Math.round(punched / Math.max(onDuty, 1) * 100), '%', '今日打卡率', `${punched} / ${onDuty} 人已打卡`),
    statCard('teal', 'i-route', target, `/ ${state.projects.length}`, '巡逻达标项目', '今日巡逻完成率 ≥ 90%'),
    statCard('orange', 'i-file', pending, '条', '待审批事项', '请假 / 调班 / 离职 / 异议')
  ].join('');

  $('#adminProjectTable').innerHTML = `<table>
    <thead><tr><th>项目</th><th>保安人数</th><th>今日打卡</th><th>巡逻频次</th><th>巡逻达标</th><th>状态</th></tr></thead>
    <tbody>${state.projects.map(p => {
      const ps = projectPunchStats(p);
      const pr = projectPatrolRate(p);
      return `<tr>
        <td><strong>${esc(p.name)}</strong><span class="cell-sub">${esc(p.address)}</span></td>
        <td class="num">${p.guards} 人</td>
        <td><div class="progress-cell"><div class="progress"><span style="width:${ps.rate}%"></span></div><span>${ps.arrived}/${ps.total}</span></div></td>
        <td><span class="badge blue">${FREQ[p.freq].label}</span></td>
        <td class="num">${pr}%</td>
        <td><span class="badge ${pr >= 90 ? 'green' : 'orange'}">${pr >= 90 ? '达标' : '预警'}</span></td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;

  const items = pendingApprovals().slice(0, 4);
  $('#adminPending').innerHTML = items.length ? items.map(it => {
    const tag = { leave: '请假', swap: '调班', resignation: '离职', dispute: '异议' }[it.kind];
    const cls = { leave: 'purple', swap: 'teal', resignation: 'red', dispute: 'orange' }[it.kind];
    return `<div class="pending-item">
      <span class="pi-avatar">${esc(it.applicant.slice(0, 1))}</span>
      <div class="pi-main">
        <strong>${esc(it.applicant)}</strong>
        <span><span class="badge ${cls}">${tag}</span>${esc(it.title)} · ${esc(it.detail)}</span>
      </div>
      <button class="mini-link" data-action="go" data-page="approvals">处理</button>
    </div>`;
  }).join('') : '<div class="table-empty">暂无待审批事项</div>';

  const values = [94, 96, 93, 97, 95, 92, 96];
  $('#adminChart').innerHTML = values.map((v, i) => {
    const d = addDays(NOW, i - 6);
    return `<div class="bar-item">
      <span class="bar-value">${v}%</span>
      <div class="bar-wrap"><div class="bar-fill" style="height:${v}%"></div></div>
      <span class="bar-label">周${WEEK_SHORT[d.getDay()]}</span>
    </div>`;
  }).join('');

  $('#adminPatrolRates').innerHTML = state.projects.map(p => {
    const r = projectPatrolRate(p);
    return `<div class="pr-row">
      <span class="pr-name">${esc(p.name)}</span>
      <div class="progress"><span style="width:${r}%"></span></div>
      <span class="pr-val ${r < 90 ? 'warn' : ''}">${r}%</span>
    </div>`;
  }).join('');
}

/* ==================== 审批 ==================== */
function approvalItems(kind) {
  let list = [];
  if (kind === 'leave') {
    list = state.leaves.map(r => ({
      id: r.id, kind, applicant: r.applicant, status: r.status, createdAt: r.createdAt,
      title: `${r.type} · ${r.days} 天`, detail: `${r.start} 至 ${r.end} · 交接 ${r.handover}`, note: r.reason
    }));
  } else if (kind === 'swap') {
    list = state.swaps.map(r => ({
      id: r.id, kind, applicant: r.applicant, status: r.status, createdAt: r.createdAt,
      title: `调班 · ${r.date}`, detail: `${r.fromShift} → ${r.toShift}`, note: `接班同事：${r.colleague}；${r.reason}`
    }));
  } else if (kind === 'resignation') {
    list = state.resignations.map(r => ({
      id: r.id, kind, applicant: r.applicant, status: r.status, createdAt: r.createdAt,
      title: '离职申请', detail: `最后工作日 ${r.lastDay} · 交接 ${r.handover}`, note: `${r.reason}：${r.note}`
    }));
  } else {
    list = state.disputes.map(r => ({
      id: r.id, kind, applicant: r.applicant, status: r.status, createdAt: r.createdAt,
      title: `工资异议 · ${r.month}`, detail: `实发 ¥${money(r.amount)}`, note: r.reason
    }));
  }
  return list.sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (b.status === 'pending' && a.status !== 'pending') return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function renderApprovals() {
  const tabs = [
    ['leave', '请假'], ['swap', '调班'], ['resignation', '离职'], ['dispute', '工资异议']
  ];
  $('#approvalTabs').innerHTML = tabs.map(([k, label]) => {
    const n = pendingCount(k);
    return `<button class="tab ${approvalTab === k ? 'active' : ''}" data-action="approval-tab" data-tab="${k}">
      ${label}审批${n ? `<em>${n}</em>` : ''}
    </button>`;
  }).join('');

  const list = approvalItems(approvalTab);
  $('#approvalList').innerHTML = list.length ? list.map(it => {
    const m = STATUS_META[it.status] || { label: it.status, cls: 'gray' };
    return `<div class="approval-item">
      <span class="ap-avatar">${esc(it.applicant.slice(0, 1))}</span>
      <div class="ap-main">
        <div class="ap-title">${esc(it.applicant)} <span class="badge ${m.cls}">${m.label}</span></div>
        <div class="ap-sub">${esc(it.title)}</div>
        <div class="ap-detail">${esc(it.detail)}<br>${esc(it.note)}</div>
        <div class="ap-time">提交于 ${esc(it.createdAt)}</div>
      </div>
      <div class="ap-actions">
        ${it.status === 'pending'
          ? `<button class="btn small ghost" data-action="reject" data-kind="${it.kind}" data-id="${esc(it.id)}">驳回</button>
             <button class="btn small primary" data-action="approve" data-kind="${it.kind}" data-id="${esc(it.id)}">通过</button>`
          : '<span class="muted">已处理</span>'}
      </div>
    </div>`;
  }).join('') : `<div class="approval-empty"><svg class="ico"><use href="#i-check-square"></use></svg>当前分类暂无待处理申请</div>`;
}

function findRecord(kind, id) {
  return state[KIND_ARRAY[kind]].find(r => r.id === id);
}

async function approveItem(kind, id) {
  try {
    await post('/api/review', { kind, id, action: 'approve' });
    await refresh();
    renderApprovals();
    updateBadges();
    if (currentPage === 'salary') renderSalary();
    toast('审批已通过，已通知申请人', 'success');
  } catch (e) {
    toast(e.message, 'warn');
  }
}

function openRejectModal(kind, id) {
  const rec = findRecord(kind, id);
  if (!rec) return;
  pendingReject = { kind, id };
  openModal({
    title: '驳回申请',
    subtitle: `${rec.applicant} · 请填写驳回原因`,
    body: `<form id="rejectForm"><div class="field">
      <label>驳回原因 <em>*</em></label>
      <textarea id="rejectReason" rows="3" placeholder="请说明驳回原因，将同步通知申请人..."></textarea>
    </div></form>`,
    footer: '<button class="btn ghost" data-action="modal-close">取消</button><button class="btn danger-solid" data-action="reject-submit">确认驳回</button>'
  });
}

async function submitReject() {
  if (!pendingReject) return;
  const reason = ($('#rejectReason').value || '').trim();
  if (reason.length < 2) return toast('请填写驳回原因', 'warn');
  const target = pendingReject;
  pendingReject = null;
  try {
    await post('/api/review', { kind: target.kind, id: target.id, action: 'reject', reason });
    await refresh();
    closeModal();
    renderApprovals();
    updateBadges();
    if (currentPage === 'salary') renderSalary();
    toast('申请已驳回并通知申请人', 'success');
  } catch (e) {
    toast(e.message, 'warn');
  }
}

function withdrawRecord(kind, id) {
  askConfirm('撤回申请', '撤回后该申请将失效，如需继续请重新提交。', '确认撤回', async () => {
    try {
      await post('/api/withdraw', { kind, id });
      await refresh();
      renderPage(currentPage);
      updateBadges();
      toast('申请已撤回', 'success');
    } catch (e) {
      toast(e.message, 'warn');
    }
  }, true);
}

/* ==================== 项目 ==================== */
function renderProjects() {
  $('#projectTable').innerHTML = `<table>
    <thead><tr><th>项目名称</th><th>地址</th><th>保安人数</th><th>巡逻频次</th><th>今日巡逻达标</th><th>操作</th></tr></thead>
    <tbody>${state.projects.map(p => {
      const rate = projectPatrolRate(p);
      return `<tr>
        <td><strong>${esc(p.name)}</strong><span class="cell-sub">${p.checkpoints.length} 个巡逻点</span></td>
        <td>${esc(p.address)}</td>
        <td class="num">${p.guards} 人</td>
        <td><select class="freq-select" id="freq-${p.id}">
          ${Object.keys(FREQ).map(k => `<option value="${k}" ${p.freq === k ? 'selected' : ''}>${FREQ[k].label}（${FREQ[k].hours < 6 ? FREQ[k].hours + ' 小时/次' : '半天/次'}）</option>`).join('')}
        </select></td>
        <td class="num"><span class="badge ${rate >= 90 ? 'green' : 'orange'}">${rate}%</span></td>
        <td><div class="row-actions">
          <button class="mini-link" data-action="view-checkpoints" data-id="${p.id}">巡逻点</button>
          <button class="mini-link" data-action="save-project" data-id="${p.id}">保存</button>
        </div></td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

async function saveProject(id) {
  const p = projectById(id);
  const sel = $('#freq-' + id);
  if (!p || !sel) return;
  try {
    await post('/api/project/freq', { id, freq: sel.value });
    await refresh();
    renderProjects();
    toast(`${p.name} 巡逻频次已更新为 ${FREQ[sel.value].label}`, 'success');
  } catch (e) {
    toast(e.message, 'warn');
  }
}

function viewCheckpoints(id) {
  const p = projectById(id);
  if (!p) return;
  openModal({
    title: `${p.name} · 巡逻点`,
    subtitle: `巡逻频次 ${FREQ[p.freq].text}`,
    body: p.checkpoints.map((cp, i) => `<div class="cp-modal-item">
      <span>${i + 1}</span>
      <div><strong>${esc(cp)}</strong><small>要求：到达点位后扫码或拍照签到</small></div>
    </div>`).join(''),
    footer: '<button class="btn ghost" data-action="modal-close">关闭</button>'
  });
}

/* ==================== 人员 ==================== */
function renderStaff() {
  const q = ($('#staffSearch').value || '').trim().toLowerCase();
  const rows = (state.staff || []).filter(s => {
    const p = projectById(s.projectId);
    const text = `${s.name} ${s.code} ${p ? p.name : ''}`.toLowerCase();
    return !q || text.includes(q);
  });
  $('#staffTable').innerHTML = rows.length ? `<table>
    <thead><tr><th>姓名 / 工号</th><th>项目</th><th>班次</th><th>今日打卡</th><th>巡逻完成</th><th>状态</th></tr></thead>
    <tbody>${rows.map(s => {
      const p = projectById(s.projectId);
      const st = { '在岗': 'green', '请假': 'purple', '休息': 'gray' }[s.status] || 'gray';
      return `<tr>
        <td><strong>${esc(s.name)}</strong><span class="cell-sub">${esc(s.code)}</span></td>
        <td>${esc(p ? p.name : '—')}</td>
        <td>${esc(s.shift)}</td>
        <td class="num" style="${s.punch === '--' ? 'color:#dc2626' : ''}">${esc(s.punch)}</td>
        <td class="num">${s.patrol ? s.patrol + '%' : '—'}</td>
        <td><span class="badge ${st}">${esc(s.status)}</span></td>
      </tr>`;
    }).join('')}</tbody>
  </table>` : '<div class="table-empty">未找到匹配的人员</div>';
}

/* ==================== 状态徽章 / 弹窗 / 提示 ==================== */
function statusBadge(status) {
  const m = STATUS_META[status] || { label: status, cls: 'gray' };
  return `<span class="badge ${m.cls}">${m.label}</span>`;
}

function openModal({ title, subtitle = '', body = '', footer = '', wide = false }) {
  $('#modalRoot').innerHTML = `<div class="modal-mask">
    <div class="modal ${wide ? 'wide' : ''}">
      <div class="modal-head">
        <div><h3>${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
        <button class="modal-close" data-action="modal-close" aria-label="关闭"><svg class="ico"><use href="#i-x"></use></svg></button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>
  </div>`;
  document.body.classList.add('lock');
}

function closeModal() {
  $('#modalRoot').innerHTML = '';
  document.body.classList.remove('lock');
  pendingConfirm = null;
  pendingReject = null;
}

function askConfirm(title, message, confirmText, fn, danger = false) {
  pendingConfirm = fn;
  openModal({
    title,
    body: `<p class="confirm-text">${esc(message)}</p>`,
    footer: `<button class="btn ghost" data-action="modal-close">取消</button>
      <button class="btn ${danger ? 'danger-solid' : 'primary'}" data-action="confirm-yes">${esc(confirmText)}</button>`
  });
}

function toast(message, type = 'info') {
  const icons = { success: 'i-check', warn: 'i-alert', info: 'i-info' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<svg class="ico"><use href="#${icons[type] || 'i-info'}"></use></svg><span>${esc(message)}</span>`;
  $('#toastRoot').appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 240);
  }, 2800);
}

/* ==================== 时钟 ==================== */
function tick() {
  const d = new Date();
  $('#liveClock').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  $('#liveDate').textContent = `${fmtCN(d)} ${WEEK[d.getDay()]}`;
  const pc = $('#punchClock');
  if (pc) pc.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const pd = $('#punchDate');
  if (pd) pd.textContent = `${fmtCN(d)} ${WEEK[d.getDay()]} · 白班`;
  $$('.js-next-patrol').forEach(el => { el.textContent = nextPatrolLabel(); });
}

/* ==================== 事件 ==================== */
function bindEvents() {
  $('#nav').addEventListener('click', e => {
    const item = e.target.closest('.nav-item');
    if (!item) return;
    route(item.dataset.page);
  });

  $('#sidebarMask').addEventListener('click', closeSidebar);

  $('#leaveForm').addEventListener('change', e => {
    if (e.target.name === 'start' || e.target.name === 'end') updateLeaveDays();
  });

  $('#attMonth').addEventListener('change', renderAttendance);

  $('#staffSearch').addEventListener('input', renderStaff);

  document.addEventListener('submit', e => {
    const f = e.target;
    if (f.id === 'leaveForm') { e.preventDefault(); submitLeave(f); }
    else if (f.id === 'swapForm') { e.preventDefault(); submitSwap(f); }
    else if (f.id === 'resignationForm') { e.preventDefault(); submitResignation(f); }
  });

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (el) handleAction(el);
    if (!e.target.closest('#notifyPanel') && !e.target.closest('[data-action="notify"]')) {
      $('#notifyPanel').classList.remove('open');
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  $('#modalRoot').addEventListener('click', e => {
    if (e.target.classList.contains('modal-mask')) closeModal();
  });
}

function handleAction(el) {
  const action = el.dataset.action;
  switch (action) {
    case 'role':
      switchRole(el.dataset.role);
      break;
    case 'go':
      route(el.dataset.page);
      break;
    case 'menu':
      $('#sidebar').classList.toggle('open');
      $('#sidebarMask').classList.toggle('show');
      break;
    case 'notify':
      $('#notifyPanel').classList.toggle('open');
      break;
    case 'punch-in':
      punchIn();
      break;
    case 'punch-out':
      punchOut();
      break;
    case 'start-patrol':
      openPatrolModal(el.dataset.due);
      break;
    case 'patrol-submit':
      submitPatrol();
      break;
    case 'withdraw':
      withdrawRecord(el.dataset.kind, el.dataset.id);
      break;
    case 'confirm-salary':
      confirmSalary();
      break;
    case 'dispute-salary':
      openDisputeModal();
      break;
    case 'confirm-yes':
      if (pendingConfirm) {
        const fn = pendingConfirm;
        pendingConfirm = null;
        closeModal();
        fn();
      }
      break;
    case 'modal-close':
      closeModal();
      break;
    case 'att-current':
      $('#attMonth').value = TODAY_KEY.slice(0, 7);
      renderAttendance();
      break;
    case 'dispute-submit':
      submitDispute();
      break;
    case 'approval-tab':
      approvalTab = el.dataset.tab;
      renderApprovals();
      break;
    case 'approve':
      approveItem(el.dataset.kind, el.dataset.id);
      break;
    case 'reject':
      openRejectModal(el.dataset.kind, el.dataset.id);
      break;
    case 'reject-submit':
      submitReject();
      break;
    case 'save-project':
      saveProject(el.dataset.id);
      break;
    case 'view-checkpoints':
      viewCheckpoints(el.dataset.id);
      break;
    case 'reset-form': {
      const f = document.getElementById(el.dataset.form);
      if (f) {
        f.reset();
        if (f.id === 'leaveForm') {
          $('#leaveStart').value = TODAY_KEY;
          $('#leaveEnd').value = TODAY_KEY;
          updateLeaveDays();
        }
        if (f.id === 'swapForm') $('#swapDate').value = TODAY_KEY;
        if (f.id === 'resignationForm') $('#resignLastDay').value = keyOf(addDays(NOW, 30));
      }
      break;
    }
  }
}

function closeSidebar() {
  $('#sidebar').classList.remove('open');
  $('#sidebarMask').classList.remove('show');
}
