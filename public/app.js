const API = 'http://localhost:3221';

/* ================= MIDI/音频 导出数据缓存 ================= */
const _midiData = {};
const _audioData = {};
let _currentFingerprint = '';

/* ================= 项目管理系统 ================= */
let currentProject = null;
function initCurrentProject() {
  currentProject = {
    version: '1.0.0',
    name: document.getElementById('projName')?.value || '未命名项目',
    createdAt: new Date().toISOString(),
    compositionParams: {
      key: document.getElementById('key')?.value || 'C',
      bpm: parseInt(document.getElementById('bpm')?.value) || 120,
      style: document.getElementById('style')?.value || 'pop',
      emotion: document.getElementById('arrEmotion')?.value || 'happy',
      barCount: parseInt(document.getElementById('length')?.value) || 16,
      algorithm: document.getElementById('algo')?.value || 'genetic',
    },
    melody: [],
    arrangement: { tracks: [], sampleRate: 44100, duration: 0 },
    lyrics: [],
    masteringSettings: { targetLUFS: -14, applied: [] },
    cognitiveState: { memoryBank: { memories: [], edges: [] }, knowledgeGraph: [], t6History: [] },
    learningState: { feedbackRecords: [], hyperparameters: {}, abilityMatrix: {} }
  };
}
initCurrentProject();
initCloudSync();
populatePluginSelects();

function collectCompositionParams() {
  return {
    key: document.getElementById('key')?.value || 'C',
    bpm: parseInt(document.getElementById('bpm')?.value) || 120,
    style: document.getElementById('style')?.value || 'pop',
    emotion: document.getElementById('arrEmotion')?.value || 'happy',
    barCount: parseInt(document.getElementById('length')?.value) || 16,
    algorithm: document.getElementById('algo')?.value || 'genetic',
  };
}

function normalizeMelody(notes, durations) {
  if (!Array.isArray(notes) || !Array.isArray(durations)) return [];
  return notes.map((n, i) => {
    const dur = durations[i] || 0.5;
    if (typeof n === 'string') {
      const octave = parseInt(n.slice(-1)) || 4;
      const semis = {C:0,c:0,D:2,d:2,E:4,e:4,F:5,f:5,G:7,g:7,A:9,a:9,B:11,b:11};
      const semi = semis[n[0]] || 0;
      const midi = (octave + 1) * 12 + semi;
      return { pitch: midi, duration: dur, velocity: 80, offset: i * dur };
    }
    if (typeof n === 'number') {
      return { pitch: n, duration: dur, velocity: 80, offset: i * dur };
    }
    return { duration: dur, velocity: 80, offset: i * dur };
  });
}

async function saveProject() {
  const loading = document.getElementById('projSaveLoading');
  const result = document.getElementById('projSaveResult');
  loading.classList.add('show'); result.textContent = '';
  try {
    currentProject.name = document.getElementById('projName')?.value || '未命名项目';
    currentProject.compositionParams = collectCompositionParams();
    const lyricText = document.getElementById('lyricResult')?.textContent || '';
    currentProject.lyrics = lyricText ? lyricText.split('\n').filter(Boolean) : [];
    const res = await fetch(`${API}/api/project/save`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentProject)
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error);
    result.textContent = `✓ 项目已保存！\nID: ${d.projectId}\n下载: ${d.downloadUrl}`;
  } catch (e) { result.textContent = '错误: ' + e.message; }
  loading.classList.remove('show');
}

function exportProject() {
  try {
    currentProject.name = document.getElementById('projName')?.value || '未命名项目';
    currentProject.compositionParams = collectCompositionParams();
    const lyricText = document.getElementById('lyricResult')?.textContent || '';
    currentProject.lyrics = lyricText ? lyricText.split('\n').filter(Boolean) : [];
    const json = JSON.stringify(currentProject, (_key, value) => {
      if (value instanceof Float32Array) return { __type: 'Float32Array', data: Array.from(value) };
      return value;
    });
    const base64 = btoa(unescape(encodeURIComponent(json)));
    const blob = new Blob([base64], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (currentProject.name || 'project') + '.qingluan';
    a.click();
    URL.revokeObjectURL(url);
    showToast('项目已导出');
  } catch (e) {
    document.getElementById('projSaveResult').textContent = '导出错误: ' + e.message;
  }
}

async function importProject(input) {
  const result = document.getElementById('projLoadResult');
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const json = decodeURIComponent(escape(atob(text)));
    const project = JSON.parse(json, (_key, value) => {
      if (value && typeof value === 'object' && value.__type === 'Float32Array' && Array.isArray(value.data)) {
        return new Float32Array(value.data);
      }
      return value;
    });
    if (!project.version) throw new Error('无效的项目文件');
    restoreProject(project);
    result.textContent = `✓ 项目「${project.name}」导入成功！`;
    showToast('项目导入成功');
  } catch (e) { result.textContent = '导入错误: ' + e.message; }
  input.value = '';
}

async function listProjects() {
  const listEl = document.getElementById('projList');
  listEl.innerHTML = '加载中...';
  try {
    const res = await fetch(`${API}/api/project/list`);
    const d = await res.json();
    if (!d.projects || d.projects.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text2);font-size:12px;">暂无保存的项目</div>';
      return;
    }
    listEl.innerHTML = d.projects.map(p => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:rgba(91,77,255,0.05);border-radius:10px;margin-bottom:6px;">
        <div>
          <div style="font-weight:600;font-size:13px;">${escapeHtml(p.name)}</div>
          <div style="font-size:11px;color:var(--text2);">${p.style} | ${p.key} | ${new Date(p.createdAt).toLocaleString()}</div>
        </div>
        <button class="s-btn-small" onclick="loadProject('${p.projectId}')">加载</button>
      </div>
    `).join('');
  } catch (e) { listEl.innerHTML = '<div style="color:#d44;font-size:12px;">错误: ' + e.message + '</div>'; }
}

async function loadProject(projectId) {
  const result = document.getElementById('projLoadResult');
  try {
    const res = await fetch(`${API}/api/project/load?id=${encodeURIComponent(projectId)}`);
    const d = await res.json();
    if (d.error) throw new Error(d.error);
    restoreProject(d);
    result.textContent = `✓ 项目「${d.name}」加载成功！`;
    showToast('项目加载成功');
  } catch (e) { result.textContent = '加载错误: ' + e.message; }
}

function restoreProject(project) {
  currentProject = project;
  if (project.name) document.getElementById('projName').value = project.name;
  if (project.compositionParams) {
    const cp = project.compositionParams;
    const keyEl = document.getElementById('key'); if (keyEl && cp.key) keyEl.value = cp.key;
    const bpmEl = document.getElementById('bpm'); if (bpmEl && cp.bpm) bpmEl.value = cp.bpm;
    const styleEl = document.getElementById('style'); if (styleEl && cp.style) styleEl.value = cp.style;
    const algoEl = document.getElementById('algo'); if (algoEl && cp.algorithm) algoEl.value = cp.algorithm;
    const lenEl = document.getElementById('length'); if (lenEl && cp.barCount) lenEl.value = cp.barCount;
    const emoEl = document.getElementById('arrEmotion'); if (emoEl && cp.emotion) emoEl.value = cp.emotion;
    const arrKeyEl = document.getElementById('arrKey'); if (arrKeyEl && cp.key) arrKeyEl.value = cp.key;
    const arrBpmEl = document.getElementById('arrBpm'); if (arrBpmEl && cp.bpm) arrBpmEl.value = cp.bpm;
    const arrStyleEl = document.getElementById('arrStyle'); if (arrStyleEl && cp.style) arrStyleEl.value = cp.style;
    const emKeyEl = document.getElementById('emKey'); if (emKeyEl && cp.key) emKeyEl.value = cp.key;
    const emBarsEl = document.getElementById('emBars'); if (emBarsEl && cp.barCount) emBarsEl.value = cp.barCount;
    const emBpmEl = document.getElementById('emBpm'); if (emBpmEl && cp.bpm) emBpmEl.value = cp.bpm;
    const prodStyleEl = document.getElementById('prodStyle'); if (prodStyleEl && cp.style) prodStyleEl.value = cp.style;
    const prodKeyEl = document.getElementById('prodKey'); if (prodKeyEl && cp.key) prodKeyEl.value = cp.key;
    const prodEmoEl = document.getElementById('prodEmotion'); if (prodEmoEl && cp.emotion) prodEmoEl.value = cp.emotion;
    const prodBarsEl = document.getElementById('prodBars'); if (prodBarsEl && cp.barCount) prodBarsEl.value = cp.barCount;
  }
  if (project.lyrics && project.lyrics.length) {
    const lr = document.getElementById('lyricResult');
    if (lr) lr.textContent = project.lyrics.join('\n');
  }
}

/* ================= 云端同步系统 ================= */
function getDeviceId() {
  let did = localStorage.getItem('qingluan_deviceId');
  if (!did) {
    did = 'dev_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36);
    localStorage.setItem('qingluan_deviceId', did);
  }
  return did;
}

function initCloudSync() {
  const did = getDeviceId();
  const el = document.getElementById('cloudDeviceId');
  if (el) el.value = did;
  listCloudProjects();
}

async function uploadToCloud() {
  const loading = document.getElementById('cloudSyncLoading');
  const result = document.getElementById('cloudSyncResult');
  loading.classList.add('show'); result.textContent = '';
  try {
    currentProject.name = document.getElementById('projName')?.value || '未命名项目';
    currentProject.compositionParams = collectCompositionParams();
    const lyricText = document.getElementById('lyricResult')?.textContent || '';
    currentProject.lyrics = lyricText ? lyricText.split('\n').filter(Boolean) : [];
    currentProject.projectId = currentProject.projectId || ('cloud_' + Date.now().toString(36));
    const deviceId = getDeviceId();

    const res = await fetch(`${API}/api/cloud/upload`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: currentProject, deviceId })
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error);

    localStorage.setItem('qingluan_cloud_projectId', d.projectId);
    localStorage.setItem('qingluan_cloud_syncToken', d.syncToken);
    result.textContent = `✓ 已上传到云端！\n项目ID: ${d.projectId}\n同步令牌: ${d.syncToken}`;
    showToast('上传成功');
    listCloudProjects();
  } catch (e) { result.textContent = '上传错误: ' + e.message; }
  loading.classList.remove('show');
}

async function listCloudProjects() {
  const listEl = document.getElementById('cloudProjectList');
  const selectEl = document.getElementById('cloudProjectSelect');
  try {
    const deviceId = getDeviceId();
    const res = await fetch(`${API}/api/cloud/list?deviceId=${encodeURIComponent(deviceId)}`);
    const d = await res.json();
    if (!d.projects || d.projects.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text2);font-size:12px;">暂无云端项目</div>';
      selectEl.innerHTML = '<option value="">选择云端项目...</option>';
      return;
    }

    selectEl.innerHTML = '<option value="">选择云端项目...</option>' +
      d.projects.map(p => `<option value="${p.projectId}" data-device="${p.deviceId}">${escapeHtml(p.name)} (${p.style}|${p.key}) ${p.isOwner ? '[本机]' : '[其他设备]'}</option>`).join('');

    listEl.innerHTML = d.projects.map(p => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:rgba(91,77,255,0.05);border-radius:10px;margin-bottom:6px;">
        <div>
          <div style="font-weight:600;font-size:13px;">${escapeHtml(p.name)} ${p.isOwner ? '<span style="color:var(--accent);font-size:11px;">[本机]</span>' : '<span style="color:var(--accent2);font-size:11px;">[' + escapeHtml(p.deviceId.slice(0,8)) + '...]</span>'}</div>
          <div style="font-size:11px;color:var(--text2);">${p.style} | ${p.key} | 同步: ${new Date(p.lastSyncTime).toLocaleString()}</div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    listEl.innerHTML = '<div style="color:#d44;font-size:12px;">加载云端列表失败: ' + e.message + '</div>';
  }
}

async function downloadFromCloud() {
  const selectEl = document.getElementById('cloudProjectSelect');
  const result = document.getElementById('cloudSyncResult');
  const projectId = selectEl.value;
  if (!projectId) { result.textContent = '请先选择一个云端项目'; return; }

  // 查找该项目的 syncToken（如果之前上传过）
  let syncToken = localStorage.getItem('qingluan_cloud_syncToken_' + projectId);
  if (!syncToken) {
    // 尝试从当前存储的通用 token 匹配（仅对本地上传的项目有效）
    const storedProjectId = localStorage.getItem('qingluan_cloud_projectId');
    if (storedProjectId === projectId) {
      syncToken = localStorage.getItem('qingluan_cloud_syncToken');
    }
  }
  if (!syncToken) {
    result.textContent = '错误: 缺少该项目的同步令牌，无法下载。请先由上传设备执行同步或重新上传。';
    return;
  }

  try {
    const res = await fetch(`${API}/api/cloud/download?projectId=${encodeURIComponent(projectId)}&syncToken=${encodeURIComponent(syncToken)}`);
    const d = await res.json();
    if (d.error) throw new Error(d.error);
    restoreProject(d.project);
    localStorage.setItem('qingluan_cloud_projectId', projectId);
    localStorage.setItem('qingluan_cloud_syncToken', syncToken);
    result.textContent = `✓ 项目「${d.project.name}」下载成功！\n最后修改: ${new Date(d.lastModified).toLocaleString()}\n来源设备: ${d.deviceId}`;
    showToast('下载成功');
  } catch (e) { result.textContent = '下载错误: ' + e.message; }
}

async function syncProject() {
  const loading = document.getElementById('cloudSyncLoading');
  const result = document.getElementById('cloudSyncResult');
  loading.classList.add('show'); result.textContent = '';

  const projectId = localStorage.getItem('qingluan_cloud_projectId');
  const syncToken = localStorage.getItem('qingluan_cloud_syncToken');
  if (!projectId || !syncToken) {
    result.textContent = '提示: 当前没有关联的云端项目，请先上传或下载一个项目。';
    loading.classList.remove('show');
    return;
  }

  try {
    currentProject.name = document.getElementById('projName')?.value || '未命名项目';
    currentProject.compositionParams = collectCompositionParams();
    const lyricText = document.getElementById('lyricResult')?.textContent || '';
    currentProject.lyrics = lyricText ? lyricText.split('\n').filter(Boolean) : [];

    // 使用项目 createdAt 的毫秒时间作为本地时间戳，如果没有则使用当前时间
    const localTimestamp = currentProject.lastModified ? new Date(currentProject.lastModified).getTime() : Date.now();

    const res = await fetch(`${API}/api/cloud/sync`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        syncToken,
        deviceId: getDeviceId(),
        timestamp: localTimestamp,
        project: currentProject
      })
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error);

    if (d.status === 'conflict') {
      result.innerHTML = `<div style="color:#c60;font-weight:600;">⚠️ 版本冲突</div>
<div style="font-size:12px;margin-top:4px;">${d.message}</div>
<div style="display:flex;gap:8px;margin-top:8px;">
  <button class="s-btn-small" onclick="resolveConflict('local')">保留本地</button>
  <button class="s-btn-small" onclick="resolveConflict('cloud')">使用云端</button>
</div>`;
      window._conflictData = d;
    } else if (d.status === 'updated' || d.status === 'local_newer') {
      result.textContent = `✓ ${d.message}\n时间戳: ${new Date(d.lastModified || localTimestamp).toLocaleString()}`;
      showToast('同步成功');
      listCloudProjects();
    } else if (d.status === 'cloud_newer') {
      restoreProject(d.cloudVersion);
      result.textContent = `✓ 已更新为云端版本\n云端时间: ${new Date(d.cloudTimestamp).toLocaleString()}`;
      showToast('已同步云端版本');
    } else {
      result.textContent = '同步状态: ' + d.status + '\n' + (d.message || '');
    }
  } catch (e) { result.textContent = '同步错误: ' + e.message; }
  loading.classList.remove('show');
}

function resolveConflict(choice) {
  const result = document.getElementById('cloudSyncResult');
  const data = window._conflictData;
  if (!data) { result.textContent = '冲突数据已过期'; return; }
  if (choice === 'cloud') {
    restoreProject(data.cloudVersion);
    result.textContent = '✓ 已采用云端版本';
    showToast('已采用云端版本');
  } else {
    result.textContent = '✓ 保留本地版本，请重新点击上传以覆盖云端';
    showToast('保留本地版本');
  }
  window._conflictData = null;
}

async function deleteCloudProject() {
  const result = document.getElementById('cloudSyncResult');
  const projectId = localStorage.getItem('qingluan_cloud_projectId');
  const syncToken = localStorage.getItem('qingluan_cloud_syncToken');
  if (!projectId || !syncToken) {
    result.textContent = '没有关联的云端项目可删除';
    return;
  }
  if (!confirm('确定要删除云端项目吗？此操作不可恢复。')) return;

  try {
    const res = await fetch(`${API}/api/cloud/delete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, syncToken })
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error);
    localStorage.removeItem('qingluan_cloud_projectId');
    localStorage.removeItem('qingluan_cloud_syncToken');
    localStorage.removeItem('qingluan_cloud_syncToken_' + projectId);
    result.textContent = '✓ 云端项目已删除';
    showToast('删除成功');
    listCloudProjects();
  } catch (e) { result.textContent = '删除错误: ' + e.message; }
}

/* ================= 多开会话系统 ================= */
let sessions = JSON.parse(localStorage.getItem('qingluan_sessions') || '[]');
let currentSessionId = localStorage.getItem('qingluan_current_session') || '';

function ensureSession() {
  if (!currentSessionId || !sessions.find(s => s.id === currentSessionId)) {
    newSession();
  }
}
function newSession() {
  const id = 'sess_' + Date.now();
  const session = {
    id,
    title: '创作 ' + (sessions.length + 1),
    preview: '新建创作会话...',
    messages: [],
    createdAt: Date.now(),
  };
  sessions.unshift(session);
  currentSessionId = id;
  saveSessions();
  renderDrawer();
  renderChat();
  showToast('新建创作会话');
}
function saveSessions() {
  localStorage.setItem('qingluan_sessions', JSON.stringify(sessions));
  localStorage.setItem('qingluan_current_session', currentSessionId);
}
function switchSession(id) {
  currentSessionId = id;
  saveSessions();
  renderDrawer();
  renderChat();
  toggleDrawer();
}
function deleteSession(e, id) {
  e.stopPropagation();
  sessions = sessions.filter(s => s.id !== id);
  if (sessions.length === 0) { newSession(); return; }
  if (currentSessionId === id) currentSessionId = sessions[0].id;
  saveSessions();
  renderDrawer();
  renderChat();
}
function updateSessionPreview(text) {
  const s = sessions.find(s => s.id === currentSessionId);
  if (s) { s.preview = text.slice(0, 30); s.updatedAt = Date.now(); saveSessions(); renderDrawer(); }
}
function addMessage(role, content, type='text', extra='') {
  ensureSession();
  const s = sessions.find(s => s.id === currentSessionId);
  if (!s) return;
  const msg = { role, content, type, extra, time: Date.now() };
  s.messages.push(msg);
  if (role === 'user') s.preview = content.slice(0, 30);
  saveSessions();
  renderChat();
  if (role === 'user') updateSessionPreview(content);
}
function renderDrawer() {
  const list = document.getElementById('sessionList');
  list.innerHTML = sessions.map(s => `
    <div class="session-item ${s.id===currentSessionId?'active':''}" onclick="switchSession('${s.id}')">
      <div class="session-avatar">${s.title.slice(0,1)}</div>
      <div class="session-info">
        <div class="session-title">${s.title}</div>
        <div class="session-preview">${s.preview || '无消息'}</div>
      </div>
      <div class="session-time">${fmtTime(s.updatedAt||s.createdAt)}</div>
    </div>
  `).join('');
}
function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function renderChat() {
  const container = document.getElementById('chatList');
  const s = sessions.find(s => s.id === currentSessionId);
  if (!s || s.messages.length === 0) {
    container.innerHTML = `
      <div class="welcome">
        <h1>Hey 👋 用户</h1>
        <p>今天青鸾 DAW<br>能帮你做什么？</p>
        <div class="sub">点击下方快捷入口开始创作，或进入工作室调整高级参数。</div>
      </div>`;
    return;
  }
  container.innerHTML = s.messages.map(m => renderMessage(m)).join('');
  container.scrollTop = container.scrollHeight;
}
function renderMessage(m) {
  const time = fmtTime(m.time);
  if (m.type === 'func-card') {
    return `<div class="msg-row ai"><div class="msg-avatar">🐦</div><div><div class="msg-bubble" style="background:transparent;padding:0;max-width:85%;">${m.extra}</div><div class="msg-time">${time}</div></div></div>`;
  }
  const avatar = m.role==='user' ? '👤' : '🐦';
  const cls = m.role;
  return `<div class="msg-row ${cls}"><div class="msg-avatar">${avatar}</div><div><div class="msg-bubble">${escapeHtml(m.content)}</div><div class="msg-time">${time}</div></div></div>`;
}
function escapeHtml(t) {
  if (t == null) return '';
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ================= UI 控制 ================= */
function toggleDrawer() {
  document.getElementById('drawer').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('show');
}
function toggleStudio() {
  document.getElementById('studio').classList.toggle('open');
}
function closeAll() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}
function switchNav(el, mode) {
  document.querySelectorAll('.nav-pills span').forEach(s=>s.classList.remove('active'));
  el.classList.add('active');
  if (mode==='studio' || mode==='project' || mode==='collab' || mode==='plugin') { document.getElementById('studio').classList.add('open'); }
  else { document.getElementById('studio').classList.remove('open'); }
  if (mode==='project') { switchStudioTab('s-project'); }
  if (mode==='collab') { switchStudioTab('s-collab'); }
  if (mode==='plugin') { switchStudioTab('s-plugin'); refreshPluginList(); }
}
function switchStudioTab(tabId) {
  document.querySelectorAll('.studio-tab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.studio-panel').forEach(x => x.classList.remove('active'));
  const tab = document.querySelector('.studio-tab[data-sp="'+tabId+'"]');
  if (tab) tab.classList.add('active');
  const panel = document.getElementById(tabId);
  if (panel) panel.classList.add('active');
}
function showToast(t) {
  const el=document.getElementById('toast'); el.textContent=t; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),2000);
}

// 输入框提示
const chatInput = document.getElementById('chatInput');
const inputHint = document.getElementById('inputHint');
chatInput.addEventListener('input', () => { inputHint.style.display = chatInput.value ? 'none' : 'block'; });

function sendChat() {
  const v = chatInput.value.trim();
  if (!v) return;
  addMessage('user', v);
  chatInput.value = '';
  inputHint.style.display = 'block';
  // 简单命令解析
  if (/作曲|旋律|创作/.test(v)) { setTimeout(()=>addFuncCard('compose'),400); }
  else if (/人声|唱歌|歌手/.test(v)) { setTimeout(()=>addFuncCard('realistic'),400); }
  else if (/伴奏|编曲|乐队/.test(v)) { setTimeout(()=>addFuncCard('arranger'),400); }
  else if (/歌词|词|写诗/.test(v)) { setTimeout(()=>addFuncCard('lyrics'),400); }
  else if (/合成器|音色|波/.test(v)) { setTimeout(()=>addFuncCard('flawless'),400); }
  else {
    setTimeout(()=>addMessage('ai', '收到！你可以在下方快捷入口选择具体功能，或进入「工作室」调整高级参数。'),500);
  }
}

/* ================= 聊天中的功能卡片 ================= */
let cardIdCounter = 0;
function addFuncCard(type) {
  ensureSession();
  cardIdCounter++;
  const cid = 'fc_' + cardIdCounter;
  let html = '';
  if (type === 'compose') {
    html = `<div class="func-card" id="${cid}">
      <h4>🎼 AI 智能作曲</h4>
      <div class="form-row"><label>风格</label><select id="${cid}_style"><option>流行</option><option>摇滚</option><option>电子</option><option>古典</option><option>中国风</option></select></div>
      <div class="form-row"><label>调性</label><select id="${cid}_key"><option>C大调</option><option>G大调</option><option>A小调</option><option>F大调</option></select></div>
      <div class="form-row"><label>BPM</label><input type="number" id="${cid}_bpm" value="120" min="40" max="240"></div>
      <div class="card-btns"><button class="secondary" onclick="closeCard('${cid}')">取消</button><button onclick="runCardCompose('${cid}')">生成</button></div>
      <div class="result-mini" id="${cid}_res"></div>
    </div>`;
  } else if (type === 'realistic') {
    html = `<div class="func-card" id="${cid}">
      <h4>🎙️ 真人级人声</h4>
      <div class="form-row"><label>性别</label><select id="${cid}_gender"><option value="female">女声</option><option value="male">男声</option></select></div>
      <div class="form-row"><label>歌词</label><input type="text" id="${cid}_text" value="啦 啦 啦"></div>
      <div class="form-row"><label>音符</label><input type="text" id="${cid}_notes" value="C4 E4 G4"></div>
      <div class="card-btns"><button class="secondary" onclick="closeCard('${cid}')">取消</button><button onclick="runCardRealistic('${cid}')">合成</button></div>
      <div id="${cid}_player"></div>
    </div>`;
  } else if (type === 'arranger') {
    html = `<div class="func-card" id="${cid}">
      <h4>🎹 真人级伴奏</h4>
      <div class="form-row"><label>风格</label><select id="${cid}_style"><option value="chinese">中国风</option><option value="pop">流行</option><option value="rock">摇滚</option><option value="jazz">爵士</option></select></div>
      <div class="form-row"><label>情绪</label><select id="${cid}_emo"><option value="romantic">浪漫</option><option value="happy">欢快</option><option value="sad">忧伤</option></select></div>
      <div class="card-btns"><button class="secondary" onclick="closeCard('${cid}')">取消</button><button onclick="runCardArranger('${cid}')">生成</button></div>
      <div id="${cid}_player"></div>
      <div class="result-mini" id="${cid}_res"></div>
    </div>`;
  } else if (type === 'lyrics') {
    html = `<div class="func-card" id="${cid}">
      <h4>📝 智能歌词生成</h4>
      <div class="form-row"><label>主题</label><select id="${cid}_theme"><option value="love">爱情</option><option value="nature">自然</option><option value="food">食物</option><option value="city">城市</option></select></div>
      <div class="form-row"><label>情感</label><select id="${cid}_emo"><option value="joy">欢喜</option><option value="sorrow">忧伤</option><option value="nostalgia">怀旧</option></select></div>
      <div class="card-btns"><button class="secondary" onclick="closeCard('${cid}')">取消</button><button onclick="runCardLyrics('${cid}')">生成</button></div>
      <div class="result-mini" id="${cid}_res"></div>
    </div>`;
  } else if (type === 'flawless') {
    html = `<div class="func-card" id="${cid}">
      <h4>✨ 无瑕疵合成器</h4>
      <div class="form-row"><label>波形</label><select id="${cid}_wave"><option value="triangle">三角波</option><option value="sine">正弦波</option><option value="sawtooth">锯齿波</option><option value="square">方波</option></select></div>
      <div class="form-row"><label>频率</label><input type="number" id="${cid}_freq" value="440"></div>
      <div class="card-btns"><button class="secondary" onclick="closeCard('${cid}')">取消</button><button onclick="runCardFlawless('${cid}')">生成</button></div>
      <div id="${cid}_player"></div>
      <div class="result-mini" id="${cid}_res"></div>
    </div>`;
  } else if (type === 'effects') {
    html = `<div class="func-card" id="${cid}">
      <h4>🔊 音频效果器</h4>
      <div class="form-row"><label>效果</label><select id="${cid}_fx"><option value="reverb">混响</option><option value="eq">均衡</option><option value="compress">压缩</option><option value="distort">失真</option><option value="delay">延迟</option></select></div>
      <div class="card-btns"><button class="secondary" onclick="closeCard('${cid}')">取消</button><button onclick="runCardEffects('${cid}')">应用</button></div>
      <div class="result-mini" id="${cid}_res"></div>
    </div>`;
  } else if (type === 'visual') {
    html = `<div class="func-card" id="${cid}">
      <h4>🌊 实时频谱可视化</h4>
      <canvas id="${cid}_canvas" width="300" height="120" style="width:100%;height:120px;border-radius:10px;background:#f0f0f5;"></canvas>
      <div class="card-btns"><button class="secondary" onclick="closeCard('${cid}')">关闭</button><button onclick="runCardVisual('${cid}')">启动</button></div>
    </div>`;
  } else if (type === 'cognitive') {
    html = `<div class="func-card" id="${cid}">
      <h4>🧠 认知涌现评估</h4>
      <div class="form-row"><label>内容</label><input type="text" id="${cid}_txt" placeholder="输入歌词或旋律..."></div>
      <div class="card-btns"><button class="secondary" onclick="closeCard('${cid}')">取消</button><button onclick="runCardCognitive('${cid}')">评估</button></div>
      <div class="result-mini" id="${cid}_res"></div>
    </div>`;
  } else if (type === 'emergence') {
    html = `<div class="func-card" id="${cid}">
      <h4>🌌 认知涌现音乐</h4>
      <div class="form-row"><label>调性</label><select id="${cid}_key"><option>C</option><option>G</option><option>Am</option><option>F</option></select></div>
      <div class="form-row"><label>小节数</label><input type="number" id="${cid}_bars" value="8" min="4" max="16"></div>
      <div class="form-row"><label>迭代</label><select id="${cid}_loop"><option value="1">单次</option><option value="3">闭环×3</option><option value="5">闭环×5</option></select></div>
      <div class="card-btns"><button class="secondary" onclick="closeCard('${cid}')">取消</button><button onclick="runCardEmergence('${cid}')">涌现</button></div>
      <div id="${cid}_mastering"></div>
      <div class="result-mini" id="${cid}_res"></div>
    </div>`;
  } else if (type === 'produce') {
    html = `<div class="func-card" id="${cid}">
      <h4>🚀 一键产音乐</h4>
      <div class="form-row"><label>风格</label><select id="${cid}_style"><option>pop</option><option>chinese</option><option>rock</option><option>jazz</option></select></div>
      <div class="form-row"><label>调性</label><select id="${cid}_key"><option>C</option><option>G</option><option>Am</option><option>F</option></select></div>
      <div class="form-row"><label>情绪</label><select id="${cid}_emo"><option>happy</option><option>sad</option><option>romantic</option><option>tense</option></select></div>
      <div class="card-btns"><button class="secondary" onclick="closeCard('${cid}')">取消</button><button onclick="runCardProduce('${cid}')">产音乐</button></div>
      <div id="${cid}_player"></div>
      <div class="form-row" id="${cid}_exportRow" style="display:none;margin-top:8px;">
        <label>格式</label><select id="${cid}_exportFormat"><option value="wav">WAV</option><option value="mp3">MP3</option><option value="flac">FLAC</option></select>
      </div>
      <button class="secondary" id="${cid}_exportAudio" style="display:none;margin-top:4px;padding:8px 12px;border-radius:8px;border:none;background:rgba(91,77,255,0.1);color:var(--accent);font-weight:600;cursor:pointer;" onclick="exportCardAudio('${cid}')">🎵 导出音频</button>
      <button class="secondary" id="${cid}_exportMidi" style="display:none;margin-top:4px;padding:8px 12px;border-radius:8px;border:none;background:rgba(91,77,255,0.1);color:var(--accent);font-weight:600;cursor:pointer;" onclick="exportCardMidi('${cid}')">🎼 导出 MIDI</button>
      <div id="${cid}_mastering"></div>
      <div class="result-mini" id="${cid}_res"></div>
    </div>`;
  } else if (type === 'video') {
    html = `<div class="func-card" id="${cid}">
      <h4>🎬 视频配乐</h4>
      <div class="form-row"><label>上传视频</label><input type="file" id="${cid}_file" accept="video/*" onchange="runCardVideoLoad('${cid}',this)"></div>
      <div id="${cid}_previewWrap" style="display:none;margin-bottom:8px;">
        <video id="${cid}_video" controls style="width:100%;border-radius:10px;background:#000;" crossorigin="anonymous"></video>
      </div>
      <div id="${cid}_controls" style="display:none;">
        <div class="card-btns"><button class="secondary" onclick="closeCard('${cid}')">取消</button><button onclick="runCardVideoAnalyze('${cid}')">分析情绪</button></div>
        <div class="result-mini" id="${cid}_res"></div>
        <div id="${cid}_player"></div>
      </div>
      <canvas id="${cid}_canvas" style="display:none;"></canvas>
    </div>`;
  }
  addMessage('ai', '', 'func-card', html);
}
function closeCard(id) {
  const el = document.getElementById(id);
  if (el) el.closest('.msg-row').remove();
}

// 卡片执行函数
async function runCardCompose(cid) {
  const styleMap = {流行:'pop',摇滚:'rock',电子:'electronic',古典:'classical',中国风:'chinese'};
  const keyMap = {'C大调':'C','G大调':'G','A小调':'Am','F大调':'F'};
  const style = styleMap[document.getElementById(cid+'_style').value] || 'pop';
  const key = keyMap[document.getElementById(cid+'_key').value] || 'C';
  const bpm = parseInt(document.getElementById(cid+'_bpm').value);
  const res = document.getElementById(cid+'_res');
  res.textContent = 'AI 创作中...';
  try {
    const r = await fetch(`${API}/api/composer/create`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({algorithm:'genetic', style, key, length:16, bpm})
    });
    const d = await r.json();
    res.textContent = `✓ 旋律生成成功！\n风格: ${style} | 调性: ${key}\n旋律: ${d.melody?.slice(0,16).join(' ')}${d.melody?.length>16?'...':''}`;
  } catch(e){ res.textContent = '错误: '+e.message; }
}
async function runCardRealistic(cid) {
  const gender = document.getElementById(cid+'_gender').value;
  const text = document.getElementById(cid+'_text').value.split(/\s+/);
  const notes = document.getElementById(cid+'_notes').value.split(/\s+/);
  const durations = notes.map(()=>0.5);
  const player = document.getElementById(cid+'_player');
  player.innerHTML = '<div style="font-size:12px;color:#999;">生成中...</div>';
  try {
    const r = await fetch(`${API}/api/synth/realistic`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({gender, timbre:'warm', text, notes, durations})
    });
    if (!r.ok) throw new Error(await r.text());
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    player.innerHTML = `<audio controls src="${url}" style="width:100%;margin-top:8px;"></audio>`;
  } catch(e){ player.innerHTML = '<div style="color:#d44;font-size:12px;">错误: '+e.message+'</div>'; }
}
async function runCardArranger(cid) {
  const style = document.getElementById(cid+'_style').value;
  const emotion = document.getElementById(cid+'_emo').value;
  const player = document.getElementById(cid+'_player');
  const res = document.getElementById(cid+'_res');
  player.innerHTML = '<div style="font-size:12px;color:#999;">多轨渲染中...</div>';
  try {
    const r = await fetch(`${API}/api/arranger/generate`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({style, key:'G', emotion, bpm:90})
    });
    if (!r.ok) throw new Error(await r.text());
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    player.innerHTML = `<audio controls src="${url}" style="width:100%;margin-top:8px;"></audio>`;
    res.textContent = `✓ 伴奏生成成功！\n风格: ${style} | 情绪: ${emotion}\n大小: ${(blob.size/1024).toFixed(1)} KB`;
  } catch(e){ player.innerHTML = '<div style="color:#d44;font-size:12px;">错误: '+e.message+'</div>'; }
}
async function runCardLyrics(cid) {
  const theme = document.getElementById(cid+'_theme').value;
  const emotion = document.getElementById(cid+'_emo').value;
  const res = document.getElementById(cid+'_res');
  res.textContent = '作词中...';
  try {
    const r = await fetch(`${API}/api/lyrics/generate`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({theme, emotion, perspective:'first', length:4, style:'modern'})
    });
    const d = await r.json();
    res.textContent = d.formatted || d.error || '无结果';
  } catch(e){ res.textContent = '错误: '+e.message; }
}
async function runCardFlawless(cid) {
  const waveform = document.getElementById(cid+'_wave').value;
  const freq = parseFloat(document.getElementById(cid+'_freq').value);
  const player = document.getElementById(cid+'_player');
  const res = document.getElementById(cid+'_res');
  player.innerHTML = '<div style="font-size:12px;color:#999;">合成中...</div>';
  try {
    const r = await fetch(`${API}/api/flawless/note`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({freq, duration:1, waveform, fm:false})
    });
    if (!r.ok) throw new Error(await r.text());
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    player.innerHTML = `<audio controls src="${url}" style="width:100%;margin-top:8px;"></audio>`;
    res.textContent = `✓ 无瑕疵音频生成！\n波形: ${waveform} | 频率: ${freq}Hz\n大小: ${(blob.size/1024).toFixed(1)} KB`;
  } catch(e){ player.innerHTML = '<div style="color:#d44;font-size:12px;">错误: '+e.message+'</div>'; }
}
async function runCardEffects(cid) {
  const effect = document.getElementById(cid+'_fx').value;
  const res = document.getElementById(cid+'_res');
  res.textContent = 'DSP处理中...';
  try {
    const sampleRate = 44100;
    const samples = new Float32Array(sampleRate);
    for (let i=0;i<sampleRate;i++) samples[i] = Math.sin(2*Math.PI*440*i/sampleRate)*0.5;
    const r = await fetch(`${API}/api/effects/${effect}`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({samples:Array.from(samples), sampleRate})
    });
    const d = await r.json();
    res.textContent = d.error ? d.error : `✓ ${effect} 处理成功！\n输出长度: ${d.output.length} 采样`;
  } catch(e){ res.textContent = '错误: '+e.message; }
}
function runCardVisual(cid) {
  const canvas = document.getElementById(cid+'_canvas');
  const ctx = canvas.getContext('2d');
  let running = true;
  function draw() {
    if (!running) return;
    ctx.fillStyle = 'rgba(240,240,245,0.3)';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    const bars = 32, bw = canvas.width/bars, t = Date.now()/1000;
    for (let i=0;i<bars;i++) {
      const h = Math.abs(Math.sin(t*3+i/bars*10)*Math.cos(t*2+i/bars*5))*80;
      ctx.fillStyle = `hsla(${180+i/bars*120},80%,60%,0.8)`;
      ctx.fillRect(i*bw+1, canvas.height-h, bw-2, h);
    }
    requestAnimationFrame(draw);
  }
  draw();
  // 点击关闭时停止
  const btn = document.querySelector(`#${cid} button[onclick^="closeCard"]`);
  const orig = btn.onclick;
  btn.onclick = ()=>{ running=false; orig(); };
}
async function runCardCognitive(cid) {
  const text = document.getElementById(cid+'_txt').value;
  const res = document.getElementById(cid+'_res');
  res.textContent = '认知评估中...';
  try {
    const r = await fetch(`${API}/api/cee/evaluate`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({text, type:'lyrics'})
    });
    const d = await r.json();
    res.textContent = JSON.stringify(d, null, 2).slice(0, 500);
  } catch(e){ res.textContent = '错误: '+e.message; }
}
async function runCardEmergence(cid) {
  const key = document.getElementById(cid+'_key').value;
  const bars = parseInt(document.getElementById(cid+'_bars').value);
  const loop = parseInt(document.getElementById(cid+'_loop').value);
  const res = document.getElementById(cid+'_res');
  const masterUI = document.getElementById(cid+'_mastering');
  res.textContent = '认知涌现引擎启动中...';
  if (masterUI) masterUI.innerHTML = '';
  try {
    const endpoint = loop > 1 ? '/api/emergence/loop' : '/api/emergence/compose';
    const body = loop > 1
      ? JSON.stringify({ key, barCount: bars, maxIterations: loop, threshold: 0.6 })
      : JSON.stringify({ key, barCount: bars });
    const r = await fetch(`${API}${endpoint}`, { method:'POST', headers:{'Content-Type':'application/json'}, body });
    const d = await r.json();
    if (d.error) { res.textContent = '错误: '+d.error; return; }
    if (masterUI) masterUI.innerHTML = renderMasteringUI(d.mastering);
    if (loop > 1) {
      res.textContent = `🌌 认知闭环完成\n迭代: ${d.iterations} 次\n最佳T6: ${d.bestScore?.toFixed?.(3) || d.bestScore}\n胶囊: ${d.finalResult?.capsuleId?.slice(0,8)}...\n旋律: ${d.finalResult?.melody?.slice(0,12).join(' ')}${d.finalResult?.melody?.length>12?'...':''}`;
    } else {
      res.textContent = `🌌 涌现作曲完成\nT6: ${d.scores?.overall?.toFixed?.(3) || d.scores?.overall}\nSwarm聚类: ${d.swarmAnalysis?.clusteringCoeff?.toFixed?.(3)}\nEisbach自信度: ${d.eisbach?.confidence?.toFixed?.(3)}\n胶囊: ${d.capsuleId?.slice(0,8)}...\n旋律: ${d.melody?.slice(0,12).join(' ')}${d.melody?.length>12?'...':''}`;
    }
  } catch(e){ res.textContent = '错误: '+e.message; }
}
async function runCardProduce(cid) {
  const style = document.getElementById(cid+'_style').value;
  const key = document.getElementById(cid+'_key').value;
  const emotion = document.getElementById(cid+'_emo').value;
  const res = document.getElementById(cid+'_res');
  const player = document.getElementById(cid+'_player');
  const masterUI = document.getElementById(cid+'_mastering');
  const exportMidiBtn = document.getElementById(cid+'_exportMidi');
  const exportAudioBtn = document.getElementById(cid+'_exportAudio');
  const exportRow = document.getElementById(cid+'_exportRow');
  res.textContent = '🚀 自我进化生产线启动...';
  player.innerHTML = '';
  if (masterUI) masterUI.innerHTML = '';
  if (exportMidiBtn) exportMidiBtn.style.display = 'none';
  if (exportAudioBtn) exportAudioBtn.style.display = 'none';
  if (exportRow) exportRow.style.display = 'none';
  try {
    const r = await fetch(`${API}/api/produce`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ style, key, emotion, barCount: 16, bpm: 120, maxAttempts: 3 })
    });
    const d = await r.json();
    if (d.error) { res.textContent = '错误: ' + d.error; return; }
    const wav = Uint8Array.from(atob(d.wavBase64), c => c.charCodeAt(0));
    const blob = new Blob([wav], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    player.innerHTML = `<audio controls src="${url}" style="width:100%;margin-top:8px;"></audio>`;
    if (masterUI) masterUI.innerHTML = renderMasteringUI(d.mastering);
    let text = `🚀 产音乐完成！\n尝试: ${d.attempt} 次 | 修复: ${d.fixed ? '是' : '否'} | 进化: ${d.evolved ? '是' : '否'}\nT6: ${d.composition?.scores?.overall?.toFixed?.(3)}\n诊断: ${d.diagnosis?.healthy ? '健康' : d.diagnosis?.severity}\n问题: ${d.diagnosis?.issues?.join(', ') || '无'}`;
    text += `\n\n日志:\n${d.productionLog?.slice(0,6).join('\n')}`;
    if (d.lyrics && d.lyrics.length > 0) {
      text += `\n\n📝 匹配歌词:\n${d.lyrics.join('\n')}`;
    }
    res.textContent = text;
    _midiData[cid] = d.composition;
    _audioData[cid] = d.wavBase64;
    if (exportMidiBtn) exportMidiBtn.style.display = 'inline-block';
    if (exportAudioBtn) exportAudioBtn.style.display = 'inline-block';
    if (exportRow) exportRow.style.display = 'flex';
  } catch(e){ res.textContent = '错误: '+e.message; }
}

/* ================= 原有 API 函数（工作室用） ================= */
async function compose() {
  const loading = document.getElementById('composeLoading');
  const result = document.getElementById('composeResult');
  loading.classList.add('show'); result.textContent = '';
  try {
    const res = await fetch(`${API}/api/composer/create`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        algorithm: document.getElementById('algo').value,
        style: document.getElementById('style').value,
        key: document.getElementById('key').value,
        length: parseInt(document.getElementById('length').value),
        bpm: parseInt(document.getElementById('bpm').value),
        usePhraseStructure: document.getElementById('composeUsePhrase')?.checked || false,
        useHumanization: document.getElementById('composeUseHumanize')?.checked || false,
        useAnalogFeel: document.getElementById('composeUseAnalog')?.checked || false,
        useSpatialReverb: document.getElementById('composeSpatial').value !== 'none',
        spatialPreset: document.getElementById('composeSpatial').value,
        useWatermark: document.getElementById('composeUseWatermark')?.checked || false,
        creatorId: 'qingluan-user',
        useHumanFeelEnhance: document.getElementById('composeUseHumanFeel')?.checked || false,
        humanFeelIntensity: (+document.getElementById('composeUseHumanFeel')?.checked || false) ? ((+document.getElementById('ntHumanFeelSlider')?.value || 50) / 100) : 0,
      })
    });
    const data = await res.json();
    if (!data.error) {
      currentProject.compositionParams = collectCompositionParams();
      currentProject.melody = normalizeMelody(data.melody || [], data.rhythm || []);
    }
    result.textContent = data.error ? '错误: '+data.error : `算法: ${data.algorithm}\n风格: ${data.style}\n调性: ${data.key}\n旋律: ${data.melody?.slice(0,20).join(' ')}${data.melody?.length>20?'...':''}`;
  } catch(e){ result.textContent = '网络错误: '+e.message; }
  loading.classList.remove('show');
}
async function autoArrange() {
  document.getElementById('composeResult').textContent = '自动编曲需要先有旋律...';
}
async function fullSong() {
  const loading = document.getElementById('fullSongLoading');
  const result = document.getElementById('fullSongResult');
  loading.classList.add('show'); result.textContent = '';
  try {
    const res = await fetch(`${API}/api/create/full-song`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        style: document.getElementById('style').value,
        key: document.getElementById('key').value,
        bpm: parseInt(document.getElementById('bpm').value),
        length: parseInt(document.getElementById('length').value),
        algorithm: document.getElementById('algo').value,
        usePhraseStructure: document.getElementById('composeUsePhrase')?.checked || false,
        useHumanization: document.getElementById('composeUseHumanize')?.checked || false,
        useAnalogFeel: document.getElementById('composeUseAnalog')?.checked || false,
        useSpatialReverb: document.getElementById('composeSpatial').value !== 'none',
        spatialPreset: document.getElementById('composeSpatial').value,
        useWatermark: document.getElementById('composeUseWatermark')?.checked || false,
        creatorId: 'qingluan-user',
        useHumanFeelEnhance: document.getElementById('composeUseHumanFeel')?.checked || false,
        humanFeelIntensity: (+document.getElementById('composeUseHumanFeel')?.checked || false) ? ((+document.getElementById('ntHumanFeelSlider')?.value || 50) / 100) : 0,
      })
    });
    const data = await res.json();
    if (!data.error) {
      currentProject.compositionParams = {
        key: data.key || document.getElementById('key').value,
        bpm: data.bpm || parseInt(document.getElementById('bpm').value),
        style: data.style || document.getElementById('style').value,
        emotion: document.getElementById('arrEmotion').value || 'happy',
        barCount: data.melody?.length || parseInt(document.getElementById('length').value),
        algorithm: data.algorithm || document.getElementById('algo').value,
      };
      currentProject.melody = normalizeMelody(data.melody || [], data.rhythm || []);
      currentProject.lyrics = data.lyrics || [];
      if (data.arrangement && data.arrangement.tracks) {
        currentProject.arrangement = {
          tracks: Object.entries(data.arrangement.tracks || {}).map(([name, track]) => ({
            name,
            notes: (track.notes || []).map(n => ({
              pitch: n.pitch || 60, duration: n.duration || 0.5, velocity: n.velocity || 80, offset: n.offset || 0
            }))
          })),
          sampleRate: 44100,
          duration: data.arrangement.totalDuration || 0
        };
      }
    }
    result.textContent = data.error ? '错误: '+data.error : `🎵 完整歌曲生成成功！\n风格: ${data.style} | 调性: ${data.key} | BPM: ${data.bpm}\n旋律: ${data.melody?.length}个音符\n歌词: ${data.lyrics?.slice(0,10)}...`;
  } catch(e){ result.textContent = '网络错误: '+e.message; }
  loading.classList.remove('show');
}
async function getScale() {
  const result = document.getElementById('scaleResult');
  try {
    const res = await fetch(`${API}/api/theory/scale/${document.getElementById('scaleType').value}?root=${document.getElementById('scaleRoot').value}`);
    const data = await res.json();
    result.textContent = data.error ? data.error : `${data.root} ${data.name}:\n${data.notes?.join(' ')}`;
  } catch(e){ result.textContent = '错误: '+e.message; }
}
async function getProgressions(style) {
  const result = document.getElementById('progResult');
  try {
    const res = await fetch(`${API}/api/theory/progressions?style=${style}`);
    const data = await res.json();
    const progs = data[style] || data;
    result.textContent = typeof progs==='object' ? JSON.stringify(progs,null,2).slice(0,800) : String(progs);
  } catch(e){ result.textContent = '错误: '+e.message; }
}
async function synthesizeTone() {
  const loading = document.getElementById('toneLoading');
  const player = document.getElementById('tonePlayer');
  loading.classList.add('show'); player.innerHTML = '';
  try {
    const res = await fetch(`${API}/api/synth/tone`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        note: document.getElementById('toneNote').value,
        duration: parseFloat(document.getElementById('toneDuration').value),
        timbre: document.getElementById('toneTimbre').value,
      })
    });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    player.innerHTML = `<audio controls src="${url}"></audio>`;
  } catch(e){ player.innerHTML = '<p style="color:#d44;font-size:11px;">错误: '+e.message+'</p>'; }
  loading.classList.remove('show');
}
async function applyEffect() {
  const loading = document.getElementById('effectLoading');
  const result = document.getElementById('effectResult');
  loading.classList.add('show'); result.textContent = '';
  try {
    const sampleRate = 44100;
    const samples = new Float32Array(sampleRate);
    for (let i=0;i<sampleRate;i++) samples[i] = Math.sin(2*Math.PI*440*i/sampleRate)*0.5;
    const effect = document.getElementById('effectType').value;
    const res = await fetch(`${API}/api/effects/${effect}`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({samples:Array.from(samples), sampleRate})
    });
    const data = await res.json();
    if (data.error) { result.textContent = '错误: '+data.error; }
    else {
      const rmsBefore = Math.sqrt(samples.reduce((a,b)=>a+b*b,0)/samples.length);
      const rmsAfter = Math.sqrt(data.output.reduce((a,b)=>a+b*b,0)/data.output.length);
      result.textContent = `效果器: ${effect}\n输入RMS: ${rmsBefore.toFixed(4)}\n输出RMS: ${rmsAfter.toFixed(4)}\n输出长度: ${data.output.length} 采样\n处理成功 ✓`;
    }
  } catch(e){ result.textContent = '错误: '+e.message; }
  loading.classList.remove('show');
}
/* ================= 新增可视化绘制函数 ================= */

function drawSpectrumStudio(freqData, timeData, spectrumCanvas, waveformCanvas) {
  const sCtx = spectrumCanvas.getContext('2d');
  const sw = spectrumCanvas.width;
  const sh = spectrumCanvas.height;
  sCtx.fillStyle = '#0a0a1a';
  sCtx.fillRect(0, 0, sw, sh);

  const barCount = 64;
  const barWidth = sw / barCount;
  for (let i = 0; i < barCount; i++) {
    const idx = Math.floor(i / barCount * freqData.length);
    const val = freqData[idx];
    const barHeight = (val / 255) * sh * 0.9;
    const hue = 200 + (i / barCount) * 160;
    const grad = sCtx.createLinearGradient(0, sh - barHeight, 0, sh);
    grad.addColorStop(0, `hsla(${hue}, 90%, 65%, 0.95)`);
    grad.addColorStop(1, `hsla(${hue}, 90%, 45%, 0.5)`);
    sCtx.fillStyle = grad;
    sCtx.fillRect(i * barWidth + 0.5, sh - barHeight, barWidth - 1, barHeight);
  }

  const wCtx = waveformCanvas.getContext('2d');
  const ww = waveformCanvas.width;
  const wh = waveformCanvas.height;
  wCtx.fillStyle = '#0a0a1a';
  wCtx.fillRect(0, 0, ww, wh);

  wCtx.lineWidth = 1.5;
  wCtx.strokeStyle = '#4caf50';
  wCtx.beginPath();
  const sliceWidth = ww / timeData.length;
  let x = 0;
  for (let i = 0; i < timeData.length; i++) {
    const v = timeData[i] / 128.0;
    const y = (v * wh) / 2;
    if (i === 0) wCtx.moveTo(x, y);
    else wCtx.lineTo(x, y);
    x += sliceWidth;
  }
  wCtx.stroke();

  wCtx.strokeStyle = 'rgba(156, 39, 176, 0.7)';
  wCtx.beginPath();
  x = 0;
  for (let i = 0; i < timeData.length; i++) {
    const v = timeData[(i + 2) % timeData.length] / 128.0;
    const y = (v * wh) / 2;
    if (i === 0) wCtx.moveTo(x, y);
    else wCtx.lineTo(x, y);
    x += sliceWidth;
  }
  wCtx.stroke();
}

function drawSpectrum3D(freqData, canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, w, h);

  const bars = 28;
  const bw = (w * 0.8) / bars;
  const cx = w / 2;
  const by = h * 0.88;
  const depth = 10;

  for (let i = 0; i < bars; i++) {
    const idx = Math.floor(i / bars * freqData.length);
    const val = freqData[idx] / 255;
    const bh = val * h * 0.65;
    const x = cx + (i - bars / 2) * bw * 1.05;
    const hue = 240 - (i / bars) * 240;

    const dx = -depth * 0.6;
    const dy = -depth * 0.35;

    ctx.fillStyle = `hsl(${hue}, 85%, 28%)`;
    ctx.fillRect(x + bw - 1, by - bh, dx + 1, bh);

    ctx.fillStyle = `hsl(${hue}, 85%, 72%)`;
    ctx.beginPath();
    ctx.moveTo(x, by - bh);
    ctx.lineTo(x + dx, by - bh + dy);
    ctx.lineTo(x + bw + dx, by - bh + dy);
    ctx.lineTo(x + bw - 1, by - bh);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = `hsl(${hue}, 85%, 52%)`;
    ctx.fillRect(x, by - bh, bw - 1, bh);
  }
}

function drawParticles(freqData, canvas, time) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = 'rgba(10, 10, 26, 0.22)';
  ctx.fillRect(0, 0, w, h);

  let lowEnergy = 0, midEnergy = 0, highEnergy = 0;
  const third = Math.floor(freqData.length / 3);
  for (let i = 0; i < third; i++) lowEnergy += freqData[i];
  for (let i = third; i < third * 2; i++) midEnergy += freqData[i];
  for (let i = third * 2; i < freqData.length; i++) highEnergy += freqData[i];
  lowEnergy = (lowEnergy / third) / 255;
  midEnergy = (midEnergy / third) / 255;
  highEnergy = (highEnergy / (freqData.length - third * 2)) / 255;
  const totalEnergy = (lowEnergy + midEnergy + highEnergy) / 3;

  if (!canvas._particles) {
    canvas._particles = [];
    const count = 250;
    for (let i = 0; i < count; i++) {
      canvas._particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        size: Math.random() * 2 + 0.8,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  const particles = canvas._particles;
  const cx = w / 2, cy = h / 2;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const isLow = i < particles.length * 0.33;
    const isHigh = i > particles.length * 0.66;

    if (isLow) {
      const tx = cx + Math.cos(p.phase + time * 0.001) * 20;
      const ty = cy + Math.sin(p.phase + time * 0.001) * 20;
      p.vx += (tx - p.x) * 0.015 * (1 + lowEnergy * 3);
      p.vy += (ty - p.y) * 0.015 * (1 + lowEnergy * 3);
    } else if (isHigh) {
      const angle = Math.atan2(p.y - cy, p.x - cx);
      const push = 1 + highEnergy * 4;
      p.vx += Math.cos(angle) * 0.15 * push;
      p.vy += Math.sin(angle) * 0.15 * push;
    } else {
      const angle = time * 0.001 + p.phase;
      const radius = 40 + midEnergy * 80;
      const tx = cx + Math.cos(angle) * radius;
      const ty = cy + Math.sin(angle) * radius;
      p.vx += (tx - p.x) * 0.012;
      p.vy += (ty - p.y) * 0.012;
    }

    p.vx *= 0.93;
    p.vy *= 0.93;
    p.x += p.vx;
    p.y += p.vy;

    if (p.x < -5) p.x = w + 5;
    if (p.x > w + 5) p.x = -5;
    if (p.y < -5) p.y = h + 5;
    if (p.y > h + 5) p.y = -5;

    const hue = 180 + totalEnergy * 180 + (i / particles.length) * 60;
    ctx.fillStyle = `hsla(${hue}, 85%, 65%, 0.85)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.8 + totalEnergy * 0.8), 0, Math.PI * 2);
    ctx.fill();
  }

  const connDist = 50 + totalEnergy * 60;
  for (let i = 0; i < particles.length; i++) {
    let connects = 0;
    for (let j = i + 1; j < particles.length && connects < 3; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < connDist) {
        connects++;
        const alpha = (1 - dist / connDist) * 0.35;
        ctx.strokeStyle = `hsla(${200 + totalEnergy * 100}, 85%, 70%, ${alpha})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.stroke();
      }
    }
  }
}

function initFractalGL(canvas) {
  const gl = canvas.getContext('webgl');
  if (!gl) return null;

  const vsSource = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fsSource = `
    precision mediump float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform float u_zoomSpeed;
    uniform float u_colorShift;
    uniform float u_rotSpeed;

    vec2 cmul(vec2 a, vec2 b) {
      return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x);
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy - u_resolution * 0.5) / min(u_resolution.x, u_resolution.y);
      float angle = u_time * u_rotSpeed;
      float ca = cos(angle), sa = sin(angle);
      uv = vec2(ca*uv.x - sa*uv.y, sa*uv.x + ca*uv.y);
      float zoom = exp(u_time * u_zoomSpeed * 0.3);
      uv *= zoom;

      vec2 z = uv;
      vec2 c = vec2(-0.8 + 0.08*sin(u_time*0.6), 0.156 + 0.08*cos(u_time*0.4));

      float iter = 0.0;
      for (int i = 0; i < 80; i++) {
        if (dot(z, z) > 4.0) break;
        z = cmul(z, z) + c;
        iter += 1.0;
      }

      float t = iter / 80.0;
      vec3 col = vec3(
        0.5 + 0.5*cos(6.28318*(t + u_colorShift + 0.0)),
        0.5 + 0.5*cos(6.28318*(t + u_colorShift + 0.33)),
        0.5 + 0.5*cos(6.28318*(t + u_colorShift + 0.66))
      );
      if (iter >= 80.0) col = vec3(0.02, 0.02, 0.04);
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(prog, 'a_position');
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

  return {
    gl, prog,
    u_resolution: gl.getUniformLocation(prog, 'u_resolution'),
    u_time: gl.getUniformLocation(prog, 'u_time'),
    u_zoomSpeed: gl.getUniformLocation(prog, 'u_zoomSpeed'),
    u_colorShift: gl.getUniformLocation(prog, 'u_colorShift'),
    u_rotSpeed: gl.getUniformLocation(prog, 'u_rotSpeed'),
  };
}

function drawFractal(freqData, canvas, time, isPlaying) {
  if (!canvas._gl) {
    canvas._gl = initFractalGL(canvas);
    if (!canvas._gl) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0a0a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.fillText('WebGL 不支持', 10, 20);
      return;
    }
  }
  const { gl, u_resolution, u_time, u_zoomSpeed, u_colorShift, u_rotSpeed } = canvas._gl;

  let low = 0, mid = 0, high = 0;
  const third = Math.floor(freqData.length / 3);
  for (let i = 0; i < third; i++) low += freqData[i];
  for (let i = third; i < third * 2; i++) mid += freqData[i];
  for (let i = third * 2; i < freqData.length; i++) high += freqData[i];
  low = (low / third) / 255;
  mid = (mid / third) / 255;
  high = (high / (freqData.length - third * 2)) / 255;

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform2f(u_resolution, canvas.width, canvas.height);
  gl.uniform1f(u_time, time * 0.001);
  gl.uniform1f(u_zoomSpeed, isPlaying ? (0.3 + low * 2.5) : 0.0);
  gl.uniform1f(u_colorShift, mid * 0.5);
  gl.uniform1f(u_rotSpeed, isPlaying ? (high * 1.2) : 0.0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

let studioAnalyserRef = { analyser: null, isPlaying: false };

/* ================= 实时频谱与波形可视化 ================= */
let vizRunning = false;
function startVisualizer() {
  const btn = document.getElementById('vizBtn');
  if (vizRunning) { vizRunning = false; btn.textContent = '▶ 启动可视化'; return; }
  vizRunning = true; btn.textContent = '⏹ 停止';

  const spectrumCanvas = document.getElementById('spectrumCanvas');
  const waveformCanvas = document.getElementById('waveformCanvas');
  const spectrum3dCanvas = document.getElementById('spectrum3dCanvas');
  const particleCanvas = document.getElementById('particleCanvas');
  const fractalCanvas = document.getElementById('fractalCanvas');

  let lastTime = performance.now();
  let simTime = 0;

  function loop(now) {
    if (!vizRunning) {
      [spectrumCanvas, spectrum3dCanvas, waveformCanvas, particleCanvas].forEach(c => {
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, c.width, c.height);
      });
      if (fractalCanvas._gl) {
        const gl = fractalCanvas._gl.gl;
        gl.clearColor(0.04, 0.04, 0.1, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      return;
    }

    const dt = now - lastTime;
    lastTime = now;
    simTime += dt;

    let freqData, timeData;
    const buflen = 128;
    if (studioAnalyserRef.analyser && studioAnalyserRef.isPlaying) {
      const alen = studioAnalyserRef.analyser.frequencyBinCount;
      freqData = new Uint8Array(alen);
      timeData = new Uint8Array(alen);
      studioAnalyserRef.analyser.getByteFrequencyData(freqData);
      studioAnalyserRef.analyser.getByteTimeDomainData(timeData);
    } else {
      freqData = new Uint8Array(buflen);
      timeData = new Uint8Array(buflen);
      const t = simTime * 0.001;
      for (let i = 0; i < buflen; i++) {
        const f = i / buflen;
        freqData[i] = Math.abs(Math.sin(t * 3 + f * 10) * Math.cos(t * 2 + f * 5)) * 220 * (0.6 + 0.4 * Math.sin(t + i));
        timeData[i] = 128 + Math.sin(t * 4 + i / buflen * 10) * 50 + Math.cos(t * 3 + i * 0.2) * 20;
      }
    }

    drawSpectrumStudio(freqData, timeData, spectrumCanvas, waveformCanvas);
    drawSpectrum3D(freqData, spectrum3dCanvas);
    drawParticles(freqData, particleCanvas, simTime);
    drawFractal(freqData, fractalCanvas, simTime, studioAnalyserRef.isPlaying || vizRunning);

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
async function synthesizeRealistic() {
  const loading = document.getElementById('rvLoading');
  const player = document.getElementById('rvPlayer');
  loading.classList.add('show'); player.innerHTML = '';
  try {
    const res = await fetch(`${API}/api/synth/realistic`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        gender: document.getElementById('rvGender').value,
        timbre: document.getElementById('rvTimbre').value,
        text: document.getElementById('rvLyrics').value.split(/\s+/),
        notes: document.getElementById('rvNotes').value.split(/\s+/),
        durations: document.getElementById('rvDurations').value.split(/\s+/).map(parseFloat),
      })
    });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    player.innerHTML = `<audio controls src="${url}"></audio>`;
  } catch(e){ player.innerHTML = '<p style="color:#d44;font-size:11px;">错误: '+e.message+'</p>'; }
  loading.classList.remove('show');
}
async function synthesizeJianpu() {
  const loading = document.getElementById('rvJianpuLoading');
  const player = document.getElementById('rvJianpuPlayer');
  loading.classList.add('show'); player.innerHTML = '';
  try {
    const res = await fetch(`${API}/api/synth/jianpu`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        gender: document.getElementById('rvGender').value,
        timbre: document.getElementById('rvTimbre').value,
        jianpu: document.getElementById('rvJianpu').value,
        lyrics: document.getElementById('rvJianpuLyrics').value.split(/\s+/),
      })
    });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    player.innerHTML = `<audio controls src="${url}"></audio>`;
  } catch(e){ player.innerHTML = '<p style="color:#d44;font-size:11px;">错误: '+e.message+'</p>'; }
  loading.classList.remove('show');
}
async function generateArranger() {
  const loading = document.getElementById('arrLoading');
  const player = document.getElementById('arrPlayer');
  const result = document.getElementById('arrResult');
  loading.classList.add('show'); player.innerHTML = ''; result.textContent = '';
  try {
    const res = await fetch(`${API}/api/arranger/generate`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        style: document.getElementById('arrStyle').value,
        key: document.getElementById('arrKey').value,
        emotion: document.getElementById('arrEmotion').value,
        bpm: parseInt(document.getElementById('arrBpm').value),
      })
    });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    player.innerHTML = `<audio controls src="${url}"></audio>`;
    result.textContent = `✓ 伴奏生成成功！\n风格: ${document.getElementById('arrStyle').value}\n调性: ${document.getElementById('arrKey').value}\n情绪: ${document.getElementById('arrEmotion').value}\nBPM: ${document.getElementById('arrBpm').value}\n大小: ${(blob.size/1024/1024).toFixed(2)} MB`;
    currentProject.compositionParams = {
      ...currentProject.compositionParams,
      style: document.getElementById('arrStyle').value,
      key: document.getElementById('arrKey').value,
      emotion: document.getElementById('arrEmotion').value,
      bpm: parseInt(document.getElementById('arrBpm').value),
    };
  } catch(e){ result.textContent = '错误: '+e.message; }
  loading.classList.remove('show');
}
function toggleLyricMode() {
  const mode = document.getElementById('lyricMode').value;
  document.getElementById('lyricGeneral').style.display = mode==='general'?'block':'none';
  document.getElementById('lyricFood').style.display = mode==='food'?'block':'none';
  document.getElementById('lyricEmotionDiv').style.display = mode==='emotion'?'block':'none';
  document.getElementById('lyricCharacter').style.display = mode==='character'?'block':'none';
}
async function generateLyrics() {
  const loading = document.getElementById('lyricLoading');
  const result = document.getElementById('lyricResult');
  loading.classList.add('show'); result.textContent = '';
  const mode = document.getElementById('lyricMode').value;
  let endpoint = '/api/lyrics/generate'; let body = {};
  try {
    if (mode==='general') {
      body = { theme: document.getElementById('lyricTheme').value, emotion: document.getElementById('lyricEmotion').value, perspective: document.getElementById('lyricPersp').value, object: document.getElementById('lyricObject').value||undefined, length: parseInt(document.getElementById('lyricLength').value), style: document.getElementById('lyricStyle').value };
    } else if (mode==='food') {
      endpoint = '/api/lyrics/food';
      body = { food: document.getElementById('lyricFoodName').value, emotion: document.getElementById('lyricFoodEmotion').value, perspective: document.getElementById('lyricPersp')?.value||'first' };
    } else if (mode==='emotion') {
      endpoint = '/api/lyrics/emotion';
      body = { emotion: document.getElementById('lyricEmoCore').value, perspective: document.getElementById('lyricPersp')?.value||'first' };
    } else if (mode==='character') {
      endpoint = '/api/lyrics/character';
      body = { character: document.getElementById('lyricCharDesc').value, emotion: document.getElementById('lyricCharEmo').value, perspective: document.getElementById('lyricCharPersp').value };
    }
    const res = await fetch(`${API}${endpoint}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const data = await res.json();
    if (!data.error && data.formatted) {
      currentProject.lyrics = data.formatted.split('\n').filter(Boolean);
    }
    result.textContent = data.error ? '错误: '+data.error : data.formatted;
  } catch(e){ result.textContent = '网络错误: '+e.message; }
  loading.classList.remove('show');
}
function toggleCeeMode() {
  const mode = document.getElementById('ceeMode').value;
  document.getElementById('ceeEvaluate').style.display = mode==='evaluate'?'block':'none';
  document.getElementById('ceeOptimize').style.display = mode==='optimize'?'block':'none';
  document.getElementById('ceeFeedback').style.display = mode==='feedback'?'block':'none';
  document.getElementById('ceeOrchestrate').style.display = mode==='orchestrate'?'block':'none';
  document.getElementById('ceeStatus').style.display = mode==='status'?'block':'none';
}
async function ceeEvaluate() {
  const loading = document.getElementById('ceeLoading');
  const result = document.getElementById('ceeResult');
  loading.classList.add('show'); result.textContent = '';
  try {
    const res = await fetch(`${API}/api/cee/evaluate`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text: document.getElementById('ceeEvalText').value, type: document.getElementById('ceeEvalType').value }) });
    result.textContent = JSON.stringify(await res.json(), null, 2);
  } catch(e){ result.textContent = '错误: '+e.message; }
  loading.classList.remove('show');
}
async function ceeOptimize() {
  const loading = document.getElementById('ceeLoading');
  const result = document.getElementById('ceeResult');
  loading.classList.add('show'); result.textContent = '';
  try {
    const res = await fetch(`${API}/api/cee/optimize`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ lyrics: document.getElementById('ceeOptText').value }) });
    result.textContent = JSON.stringify(await res.json(), null, 2);
  } catch(e){ result.textContent = '错误: '+e.message; }
  loading.classList.remove('show');
}
async function ceeFeedback() {
  const loading = document.getElementById('ceeLoading');
  const result = document.getElementById('ceeResult');
  loading.classList.add('show'); result.textContent = '';
  try {
    const res = await fetch(`${API}/api/cee/feedback`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ score: parseFloat(document.getElementById('ceeScore').value), message: document.getElementById('ceeMsg').value, tags: document.getElementById('ceeTags').value.split(',').map(s=>s.trim()).filter(Boolean) }) });
    result.textContent = JSON.stringify(await res.json(), null, 2);
  } catch(e){ result.textContent = '错误: '+e.message; }
  loading.classList.remove('show');
}
async function ceeOrchestrate() {
  const loading = document.getElementById('ceeLoading');
  const result = document.getElementById('ceeResult');
  loading.classList.add('show'); result.textContent = '';
  try {
    const res = await fetch(`${API}/api/cee/orchestrate`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ goal: document.getElementById('ceeGoal').value }) });
    result.textContent = JSON.stringify(await res.json(), null, 2);
  } catch(e){ result.textContent = '错误: '+e.message; }
  loading.classList.remove('show');
}
async function ceeStatus() {
  const loading = document.getElementById('ceeLoading');
  const result = document.getElementById('ceeResult');
  loading.classList.add('show'); result.textContent = '';
  try {
    const res = await fetch(`${API}/api/cee/status`);
    result.textContent = JSON.stringify(await res.json(), null, 2);
  } catch(e){ result.textContent = '错误: '+e.message; }
  loading.classList.remove('show');
}
function toggleFlawMode() {
  const mode = document.getElementById('flawMode').value;
  document.getElementById('flawNote').style.display = mode==='note'?'block':'none';
  document.getElementById('flawChord').style.display = mode==='chord'?'block':'none';
  document.getElementById('flawArp').style.display = mode==='arpeggio'?'block':'none';
  document.getElementById('flawDrum').style.display = mode==='drum'?'block':'none';
  document.getElementById('flawPreset').style.display = mode==='preset'?'block':'none';
}
async function generateFlawless() {
  const loading = document.getElementById('flawLoading');
  const player = document.getElementById('flawPlayer');
  const result = document.getElementById('flawResult');
  loading.classList.add('show'); player.innerHTML = ''; result.textContent = '';
  const mode = document.getElementById('flawMode').value;
  let endpoint = '/api/flawless/note'; let body = {};
  try {
    if (mode==='note') {
      body = { freq: parseFloat(document.getElementById('flawFreq').value), duration: parseFloat(document.getElementById('flawDur').value), waveform: document.getElementById('flawWave').value, fm: document.getElementById('flawFm').checked };
    } else if (mode==='chord') {
      endpoint = '/api/flawless/chord';
      body = { freqs: document.getElementById('flawChordFreqs').value.split(',').map(parseFloat), duration: parseFloat(document.getElementById('flawChordDur').value) };
    } else if (mode==='arpeggio') {
      endpoint = '/api/flawless/arpeggio';
      body = { freqs: document.getElementById('flawArpFreqs').value.split(',').map(parseFloat), noteDuration: parseFloat(document.getElementById('flawArpNoteDur').value) };
    } else if (mode==='drum') {
      endpoint = '/api/flawless/drum';
      body = { type: document.getElementById('flawDrumType').value };
    } else if (mode==='preset') {
      endpoint = '/api/flawless/preset';
      body = { preset: document.getElementById('flawPresetName').value, freq: parseFloat(document.getElementById('flawPresetFreq').value), duration: parseFloat(document.getElementById('flawPresetDur').value) };
    }
    const res = await fetch(`${API}${endpoint}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    player.innerHTML = `<audio controls src="${url}"></audio>`;
    result.textContent = `✓ 无瑕疵音频生成成功！\n模式: ${mode}\n大小: ${(blob.size/1024).toFixed(2)} KB`;
  } catch(e){ result.textContent = '错误: '+e.message; }
  loading.classList.remove('show');
}

async function generateEmergence() {
  const loading = document.getElementById('emLoading');
  const result = document.getElementById('emResult');
  const masterUI = document.getElementById('emMasteringUI');
  loading.classList.add('show'); result.textContent = '';
  if (masterUI) masterUI.innerHTML = '';
  const mode = document.getElementById('emMode').value;
  const key = document.getElementById('emKey').value;
  const bars = parseInt(document.getElementById('emBars').value);
  const bpm = parseInt(document.getElementById('emBpm').value);
  try {
    const endpoint = mode === 'loop' ? '/api/emergence/loop' : '/api/emergence/compose';
    const body = mode === 'loop'
      ? JSON.stringify({ key, barCount: bars, bpm, maxIterations: 5, threshold: 0.6 })
      : JSON.stringify({ key, barCount: bars, bpm });
    const res = await fetch(`${API}${endpoint}`, { method:'POST', headers:{'Content-Type':'application/json'}, body });
    const d = await res.json();
    if (d.error) { result.textContent = '错误: ' + d.error; }
    else {
      if (masterUI) masterUI.innerHTML = renderMasteringUI(d.mastering);
      const melody = mode === 'loop' ? (d.finalResult?.melody || []) : (d.melody || []);
      const durations = mode === 'loop' ? (d.finalResult?.durations || []) : (d.durations || []);
      currentProject.compositionParams = { ...currentProject.compositionParams, key, bpm, barCount: bars };
      currentProject.melody = normalizeMelody(melody, durations);
      if (d.mastering) {
        currentProject.masteringSettings = { targetLUFS: d.mastering.finalLUFS || -14, applied: d.mastering.applied || [] };
      }
      if (d.scores) {
        currentProject.cognitiveState.t6History.push({ timestamp: new Date().toISOString(), scores: d.scores });
      }
      if (mode === 'loop') {
        result.textContent = `🌌 认知闭环完成\n迭代: ${d.iterations} 次\n最佳T6: ${d.bestScore?.toFixed?.(3) || d.bestScore}\n最终旋律: ${d.finalResult?.melody?.slice(0,16).join(' ')}${d.finalResult?.melody?.length>16?'...':''}`;
      } else {
        result.textContent = `🌌 涌现作曲完成\nT6: ${d.scores?.overall?.toFixed?.(3) || d.scores?.overall}\nSwarm聚类: ${d.swarmAnalysis?.clusteringCoeff?.toFixed?.(3)}\nEisbach自信度: ${d.eisbach?.confidence?.toFixed?.(3)}\n胶囊: ${d.capsuleId?.slice(0,10)}...\n旋律: ${d.melody?.slice(0,16).join(' ')}${d.melody?.length>16?'...':''}`;
      }
    }
  } catch(e){ result.textContent = '错误: '+e.message; }
  loading.classList.remove('show');
}
async function getAbilityMatrix() {
  const result = document.getElementById('emAbilityResult');
  try {
    const res = await fetch(`${API}/api/emergence/ability`);
    const d = await res.json();
    result.textContent = JSON.stringify(d, null, 2).slice(0, 1200);
  } catch(e){ result.textContent = '错误: '+e.message; }
}
async function getCapsules() {
  const result = document.getElementById('emAbilityResult');
  try {
    const res = await fetch(`${API}/api/emergence/capsules`);
    const d = await res.json();
    result.textContent = JSON.stringify(d, null, 2).slice(0, 1200);
  } catch(e){ result.textContent = '错误: '+e.message; }
}
let _lastProduceParams = null;

function renderAutoMixTable(autoMixSettings) {
  const container = document.getElementById('prodAutoMixTable');
  if (!container || !autoMixSettings) { if (container) container.innerHTML = ''; return; }
  const rows = Object.entries(autoMixSettings).map(([name, p]) => {
    const thresholdDb = p.compressorThreshold > 0 ? (20 * Math.log10(p.compressorThreshold)).toFixed(1) : '-∞';
    const duck = p.duckingReduction ? `<span style="color:#ff6b9d">闪避 -${p.duckingReduction.toFixed(1)}dB</span>` : '-';
    return `<tr><td style="padding:6px;border-bottom:1px solid var(--border);font-weight:600;font-size:12px;">${name}</td><td style="padding:6px;border-bottom:1px solid var(--border);font-size:12px;">${p.gain.toFixed(3)}</td><td style="padding:6px;border-bottom:1px solid var(--border);font-size:12px;">${p.pan.toFixed(2)}</td><td style="padding:6px;border-bottom:1px solid var(--border);font-size:12px;">${p.eqLow}/${p.eqMid}/${p.eqHigh}</td><td style="padding:6px;border-bottom:1px solid var(--border);font-size:12px;">${p.compressorRatio}:1 @ ${thresholdDb}dB</td><td style="padding:6px;border-bottom:1px solid var(--border);font-size:12px;">${duck}</td></tr>`;
  }).join('');
  container.innerHTML = `<div style="margin-top:10px;"><h4 style="font-size:13px;margin-bottom:6px;color:var(--accent);">🎚 AI 自动混音参数</h4><table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f7f7f7;"><th style="padding:6px;font-size:11px;text-align:left;">轨道</th><th style="padding:6px;font-size:11px;text-align:left;">增益</th><th style="padding:6px;font-size:11px;text-align:left;">声像</th><th style="padding:6px;font-size:11px;text-align:left;">EQ低/中/高(dB)</th><th style="padding:6px;font-size:11px;text-align:left;">压缩</th><th style="padding:6px;font-size:11px;text-align:left;">闪避</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

async function generateProduce() {
  const loading = document.getElementById('prodLoading');
  const result = document.getElementById('prodResult');
  const player = document.getElementById('prodPlayer');
  const masterUI = document.getElementById('prodMasteringUI');
  const exportMidiBtn = document.getElementById('prodExportMidi');
  const exportAudioBtn = document.getElementById('prodExportAudio');
  const exportRow = document.getElementById('prodExportRow');
  const optimizeBtn = document.getElementById('prodOptimizeMix');
  const autoMixTable = document.getElementById('prodAutoMixTable');
  loading.classList.add('show'); result.textContent = ''; player.innerHTML = ''; masterUI.innerHTML = '';
  if (autoMixTable) autoMixTable.innerHTML = '';
  if (exportMidiBtn) exportMidiBtn.style.display = 'none';
  if (exportAudioBtn) exportAudioBtn.style.display = 'none';
  if (exportRow) exportRow.style.display = 'none';
  if (optimizeBtn) optimizeBtn.style.display = 'none';
  const style = document.getElementById('prodStyle').value;
  const key = document.getElementById('prodKey').value;
  const emotion = document.getElementById('prodEmotion').value;
  const bars = parseInt(document.getElementById('prodBars').value);
  const attempts = parseInt(document.getElementById('prodAttempts').value);
  const masteringPreset = document.getElementById('prodMastering').value;
  const useAutoMix = document.getElementById('prodUseAutoMix').checked;
  try {
    const body = { style, key, emotion, barCount: bars, bpm: 120, maxAttempts: attempts, masteringPreset, useAutoMix };
    _lastProduceParams = { ...body };
    const res = await fetch(`${API}/api/produce`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const d = await res.json();
    if (d.error) { result.textContent = '错误: ' + d.error; }
    else {
      const wav = Uint8Array.from(atob(d.wavBase64), c => c.charCodeAt(0));
      const blob = new Blob([wav], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      player.innerHTML = `<audio controls src="${url}" style="width:100%;margin-top:8px;"></audio>`;
      masterUI.innerHTML = renderMasteringUI(d.mastering);
      let text = `🚀 产音乐完成！\n尝试: ${d.attempt} 次 | 修复: ${d.fixed ? '是' : '否'} | 进化: ${d.evolved ? '是' : '否'}\nT6: ${d.composition?.scores?.overall?.toFixed?.(3)}\n诊断: ${d.diagnosis?.healthy ? '健康' : d.diagnosis?.severity}\n问题: ${d.diagnosis?.issues?.join(', ') || '无'}\n日志:\n${d.productionLog?.slice(0,8).join('\n')}`;
      if (d.fingerprint) {
        text += `\n\n🔐 声学指纹: ${d.fingerprint.slice(0,16)}...`;
        _currentFingerprint = d.fingerprint;
      }
      if (d.lyrics && d.lyrics.length > 0) {
        text += `\n\n📝 匹配歌词:\n${d.lyrics.join('\n')}`;
      }
      result.textContent = text;
      _midiData['studio'] = d.composition;
      _audioData['studio'] = d.wavBase64;
      if (exportMidiBtn) exportMidiBtn.style.display = 'block';
      if (exportAudioBtn) exportAudioBtn.style.display = 'block';
      if (exportRow) exportRow.style.display = 'block';
      if (optimizeBtn) optimizeBtn.style.display = 'block';
      renderAutoMixTable(d.autoMixSettings);
      currentProject.compositionParams = { key, bpm: 120, style, emotion, barCount: bars };
      currentProject.melody = normalizeMelody(d.composition?.melody || [], d.composition?.durations || []);
      currentProject.lyrics = d.lyrics || [];
      if (d.mastering) {
        currentProject.masteringSettings = { targetLUFS: d.mastering.finalLUFS || -14, applied: d.mastering.applied || [] };
      }
      if (d.composition?.scores) {
        currentProject.cognitiveState.t6History.push({ timestamp: new Date().toISOString(), scores: d.composition.scores });
      }
      // 自动推荐封面
      autoRecommendCover(style, emotion, d.lyrics || []);
    }
  } catch(e){ result.textContent = '错误: '+e.message; }
  loading.classList.remove('show');
}

async function optimizeMix() {
  if (!_lastProduceParams) { showToast('请先生成音乐'); return; }
  const loading = document.getElementById('prodLoading');
  const result = document.getElementById('prodResult');
  const player = document.getElementById('prodPlayer');
  const masterUI = document.getElementById('prodMasteringUI');
  const optimizeBtn = document.getElementById('prodOptimizeMix');
  const autoMixTable = document.getElementById('prodAutoMixTable');
  loading.classList.add('show'); result.textContent = ''; player.innerHTML = ''; masterUI.innerHTML = '';
  if (autoMixTable) autoMixTable.innerHTML = '';
  try {
    const body = { ..._lastProduceParams, useAutoMix: true };
    const res = await fetch(`${API}/api/produce`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const d = await res.json();
    if (d.error) { result.textContent = '错误: ' + d.error; }
    else {
      const wav = Uint8Array.from(atob(d.wavBase64), c => c.charCodeAt(0));
      const blob = new Blob([wav], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      player.innerHTML = `<audio controls src="${url}" style="width:100%;margin-top:8px;"></audio>`;
      masterUI.innerHTML = renderMasteringUI(d.mastering);
      let text = `🔧 优化混音完成！\n尝试: ${d.attempt} 次 | 修复: ${d.fixed ? '是' : '否'} | 进化: ${d.evolved ? '是' : '否'}\nT6: ${d.composition?.scores?.overall?.toFixed?.(3)}\n诊断: ${d.diagnosis?.healthy ? '健康' : d.diagnosis?.severity}\n问题: ${d.diagnosis?.issues?.join(', ') || '无'}\n日志:\n${d.productionLog?.slice(0,8).join('\n')}`;
      if (d.fingerprint) {
        text += `\n\n🔐 声学指纹: ${d.fingerprint.slice(0,16)}...`;
        _currentFingerprint = d.fingerprint;
      }
      if (d.lyrics && d.lyrics.length > 0) {
        text += `\n\n📝 匹配歌词:\n${d.lyrics.join('\n')}`;
      }
      result.textContent = text;
      _midiData['studio'] = d.composition;
      _audioData['studio'] = d.wavBase64;
      renderAutoMixTable(d.autoMixSettings);
      currentProject.melody = normalizeMelody(d.composition?.melody || [], d.composition?.durations || []);
      currentProject.lyrics = d.lyrics || [];
      if (d.mastering) {
        currentProject.masteringSettings = { targetLUFS: d.mastering.finalLUFS || -14, applied: d.mastering.applied || [] };
      }
      if (d.composition?.scores) {
        currentProject.cognitiveState.t6History.push({ timestamp: new Date().toISOString(), scores: d.composition.scores });
      }
    }
  } catch(e){ result.textContent = '错误: '+e.message; }
  loading.classList.remove('show');
}
async function exportCardMidi(cid) {
  const comp = _midiData[cid];
  if (!comp || !comp.melody || !comp.durations) { showToast('无可用 MIDI 数据'); return; }
  await doExportMidi(comp.melody, comp.durations, comp.bpm || 120, comp.key || 'C');
}
async function exportStudioMidi() {
  const comp = _midiData['studio'];
  if (!comp || !comp.melody || !comp.durations) { showToast('无可用 MIDI 数据'); return; }
  await doExportMidi(comp.melody, comp.durations, comp.bpm || 120, comp.key || 'C');
}
async function doExportMidi(melody, durations, bpm, key) {
  const noteEvents = [];
  let startTime = 0;
  for (let i = 0; i < melody.length; i++) {
    noteEvents.push({
      midi: melody[i],
      startTime: startTime,
      duration: durations[i] || 0.5,
      velocity: 0.8,
    });
    startTime += durations[i] || 0.5;
  }
  try {
    const r = await fetch(`${API}/api/export/midi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteEvents, bpm, key }),
    });
    const d = await r.json();
    if (d.error) { showToast('导出失败: ' + d.error); return; }
    const bytes = Uint8Array.from(atob(d.midiBase64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qingluan_${key}_${bpm}.mid`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('MIDI 导出成功');
  } catch (e) { showToast('导出失败: ' + e.message); }
}
async function exportCardAudio(cid) {
  const wavBase64 = _audioData[cid];
  const format = document.getElementById(cid + '_exportFormat')?.value || 'mp3';
  if (!wavBase64) { showToast('无可用音频数据'); return; }
  await doExportAudio(wavBase64, format);
}
async function exportStudioAudio() {
  const wavBase64 = _audioData['studio'];
  const format = document.getElementById('prodExportFormat')?.value || 'mp3';
  if (!wavBase64) { showToast('无可用音频数据'); return; }
  await doExportAudio(wavBase64, format);
}
async function doExportAudio(wavBase64, format) {
  if (format === 'wav') {
    const bytes = Uint8Array.from(atob(wavBase64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qingluan_export.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('WAV 导出成功');
    return;
  }
  try {
    showToast('音频编码中...');
    const r = await fetch(`${API}/api/export/audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wavBase64, format, bitrate: format === 'mp3' ? 192 : undefined }),
    });
    const d = await r.json();
    if (d.error) { showToast('导出失败: ' + d.error); return; }
    const bytes = Uint8Array.from(atob(d.audioBase64), c => c.charCodeAt(0));
    const mime = format === 'mp3' ? 'audio/mpeg' : 'audio/flac';
    const ext = format === 'mp3' ? 'mp3' : 'flac';
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qingluan_export.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`${format.toUpperCase()} 导出成功`);
  } catch (e) { showToast('导出失败: ' + e.message); }
}
async function getProduceStatus() {
  const result = document.getElementById('prodStatusResult');
  try {
    const res = await fetch(`${API}/api/produce/status`);
    const d = await res.json();
    result.textContent = JSON.stringify(d, null, 2).slice(0, 1200);
  } catch(e){ result.textContent = '错误: '+e.message; }
}

/* ================= AI 专辑封面生成 ================= */
let _lastCoverUrl = '';
let _lastCoverParams = null;

async function generateCover(seedVariant) {
  const loading = document.getElementById('coverLoading');
  const result = document.getElementById('coverResult');
  const actions = document.getElementById('coverActions');
  loading.classList.add('show'); result.innerHTML = ''; actions.style.display = 'none';
  const style = document.getElementById('coverStyle').value;
  const emotion = document.getElementById('coverEmotion').value;
  const theme = document.getElementById('coverTheme').value;
  const lyricSnippet = document.getElementById('coverLyric').value;
  _lastCoverParams = { style, emotion, theme, lyricSnippet };
  try {
    const res = await fetch(`${API}/api/cover/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style, emotion, theme, lyricSnippet, seedVariant })
    });
    const d = await res.json();
    if (d.error) { result.innerHTML = '<div style="color:#d44;font-size:12px;">错误: ' + escapeHtml(d.error) + '</div>'; }
    else {
      _lastCoverUrl = d.coverUrl;
      result.innerHTML = `<img src="${escapeHtml(d.coverUrl)}" style="width:100%;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.12);display:block;">`;
      actions.style.display = 'block';
    }
  } catch (e) { result.innerHTML = '<div style="color:#d44;font-size:12px;">错误: ' + escapeHtml(e.message) + '</div>'; }
  loading.classList.remove('show');
}

function downloadCover() {
  if (!_lastCoverUrl) { showToast('请先生成封面'); return; }
  window.open(_lastCoverUrl, '_blank');
}

function regenerateCover() {
  if (!_lastCoverParams) { showToast('请先生成封面'); return; }
  const variants = ['slightly different angle', 'alternate lighting', 'different composition', 'unique color grading', 'fresh perspective'];
  const variant = variants[Math.floor(Math.random() * variants.length)];
  generateCover(variant);
}

async function autoRecommendCover(style, emotion, lyrics) {
  const card = document.getElementById('coverRecommendCard');
  const result = document.getElementById('coverRecommendResult');
  if (!card || !result) return;
  card.style.display = 'block';
  result.innerHTML = '<div style="font-size:12px;color:var(--text2);">正在生成推荐封面...</div>';
  const lyricSnippet = Array.isArray(lyrics) && lyrics.length ? lyrics.slice(0, 2).join(' ') : '';
  try {
    const res = await fetch(`${API}/api/cover/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style, emotion, lyricSnippet })
    });
    const d = await res.json();
    if (d.error) { result.innerHTML = '<div style="color:#d44;font-size:12px;">推荐失败: ' + escapeHtml(d.error) + '</div>'; }
    else {
      result.innerHTML = `<img src="${escapeHtml(d.coverUrl)}" style="width:100%;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.12);display:block;">`;
      // 同步到封面面板
      document.getElementById('coverStyle').value = style;
      document.getElementById('coverEmotion').value = emotion;
      document.getElementById('coverLyric').value = lyricSnippet;
    }
  } catch (e) { result.innerHTML = '<div style="color:#d44;font-size:12px;">推荐错误: ' + escapeHtml(e.message) + '</div>'; }
}

function renderMasteringUI(m) {
  if (!m) return '';
  const lufs = m.finalLUFS ?? -70;
  const tp = m.finalTruePeak ?? 0;
  const dr = m.metrics?.dynamicRangeLU ?? 0;
  const lra = m.metrics?.loudnessRange ?? 0;
  // LUFS 条: 范围 -24 到 0, 目标 -14
  const pct = Math.max(0, Math.min(100, (lufs + 24) / 24 * 100));
  let fillClass = 'green';
  if (lufs > -10 || lufs < -20) fillClass = 'yellow';
  if (tp > 0.99) fillClass = 'red';
  const tags = (m.applied || []).map(a => `<span class="mastering-tag">${a}</span>`).join('');
  return `<div class="lufs-meter">
    <div class="lufs-text">${lufs.toFixed(1)} LUFS</div>
    <div class="lufs-bar"><div class="lufs-fill ${fillClass}" style="width:${pct}%"></div></div>
    <div class="lufs-text">TP ${tp.toFixed(3)}</div>
  </div>
  <div style="font-size:11px;color:var(--text2);margin-top:4px;">动态范围 ${dr.toFixed(1)} LU | 响度范围 ${lra.toFixed(1)} LU</div>
  <div class="mastering-chain">${tags}</div>`;
}

/* ================= 实时频谱与波形可视化 ================= */
let vizAudioCtx = null;
const vizConnected = new WeakSet();

function ensureVizAudioCtx() {
  if (!vizAudioCtx) {
    vizAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return vizAudioCtx;
}

function drawSpectrum(analyser, spectrumCanvas, waveformCanvas, isPlayingRef) {
  if (!isPlayingRef.value) return;
  requestAnimationFrame(() => drawSpectrum(analyser, spectrumCanvas, waveformCanvas, isPlayingRef));

  const sCtx = spectrumCanvas.getContext('2d');
  const sw = spectrumCanvas.width;
  const sh = spectrumCanvas.height;
  sCtx.fillStyle = '#0a0a1a';
  sCtx.fillRect(0, 0, sw, sh);

  const bufferLength = analyser.frequencyBinCount;
  const freqData = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(freqData);

  const barCount = 64;
  const barWidth = sw / barCount;
  for (let i = 0; i < barCount; i++) {
    const idx = Math.floor(i / barCount * bufferLength);
    const val = freqData[idx];
    const barHeight = (val / 255) * sh * 0.9;
    const hue = 200 + (i / barCount) * 160;
    const grad = sCtx.createLinearGradient(0, sh - barHeight, 0, sh);
    grad.addColorStop(0, `hsla(${hue}, 90%, 65%, 0.95)`);
    grad.addColorStop(1, `hsla(${hue}, 90%, 45%, 0.5)`);
    sCtx.fillStyle = grad;
    sCtx.fillRect(i * barWidth + 0.5, sh - barHeight, barWidth - 1, barHeight);
  }

  const wCtx = waveformCanvas.getContext('2d');
  const ww = waveformCanvas.width;
  const wh = waveformCanvas.height;
  wCtx.fillStyle = '#0a0a1a';
  wCtx.fillRect(0, 0, ww, wh);

  const timeData = new Uint8Array(bufferLength);
  analyser.getByteTimeDomainData(timeData);

  wCtx.lineWidth = 1.5;
  wCtx.strokeStyle = '#4caf50';
  wCtx.beginPath();
  const sliceWidth = ww / bufferLength;
  let x = 0;
  for (let i = 0; i < bufferLength; i++) {
    const v = timeData[i] / 128.0;
    const y = (v * wh) / 2;
    if (i === 0) wCtx.moveTo(x, y);
    else wCtx.lineTo(x, y);
    x += sliceWidth;
  }
  wCtx.stroke();

  wCtx.strokeStyle = 'rgba(156, 39, 176, 0.7)';
  wCtx.beginPath();
  x = 0;
  for (let i = 0; i < bufferLength; i++) {
    const v = timeData[(i + 2) % bufferLength] / 128.0;
    const y = (v * wh) / 2;
    if (i === 0) wCtx.moveTo(x, y);
    else wCtx.lineTo(x, y);
    x += sliceWidth;
  }
  wCtx.stroke();
}

function attachVisualizer(audioEl) {
  if (vizConnected.has(audioEl)) return;
  vizConnected.add(audioEl);

  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-top:6px;display:flex;flex-direction:column;gap:4px;';

  const spectrumCanvas = document.createElement('canvas');
  spectrumCanvas.className = 'viz-spectrum';
  spectrumCanvas.width = 360;
  spectrumCanvas.height = 100;

  const waveformCanvas = document.createElement('canvas');
  waveformCanvas.className = 'viz-waveform';
  waveformCanvas.width = 360;
  waveformCanvas.height = 60;

  wrap.appendChild(spectrumCanvas);
  wrap.appendChild(waveformCanvas);
  audioEl.parentNode.insertBefore(wrap, audioEl.nextSibling);

  const ctx = ensureVizAudioCtx();
  const source = ctx.createMediaElementSource(audioEl);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  analyser.connect(ctx.destination);

  const isPlayingRef = { value: false };

  audioEl.addEventListener('play', () => {
    isPlayingRef.value = true;
    studioAnalyserRef.analyser = analyser;
    studioAnalyserRef.isPlaying = true;
    if (ctx.state === 'suspended') ctx.resume();
    drawSpectrum(analyser, spectrumCanvas, waveformCanvas, isPlayingRef);
  });

  audioEl.addEventListener('pause', () => {
    isPlayingRef.value = false;
    if (studioAnalyserRef.analyser === analyser) studioAnalyserRef.isPlaying = false;
  });
  audioEl.addEventListener('ended', () => {
    isPlayingRef.value = false;
    if (studioAnalyserRef.analyser === analyser) studioAnalyserRef.isPlaying = false;
  });
}

const vizObserver = new MutationObserver((mutations) => {
  mutations.forEach(mutation => {
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === 1) {
        if (node.tagName === 'AUDIO') attachVisualizer(node);
        if (node.querySelectorAll) node.querySelectorAll('audio').forEach(attachVisualizer);
      }
    });
  });
});
vizObserver.observe(document.body, { childList: true, subtree: true });

/* ================= 视频配乐系统 ================= */
let _videoFileUrl = null;
let _videoEmotionSequence = [];
let _videoAudioUrl = null;
let _videoAudioBlob = null;
let _videoWavBase64 = null;

function loadVideoFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (_videoFileUrl) URL.revokeObjectURL(_videoFileUrl);
  _videoFileUrl = URL.createObjectURL(file);
  const video = document.getElementById('videoPreview');
  video.src = _videoFileUrl;
  document.getElementById('videoPreviewWrap').style.display = 'block';
  document.getElementById('videoControls').style.display = 'block';
  document.getElementById('videoEmotionResult').textContent = '';
  document.getElementById('videoEmotionChart').innerHTML = '';
  document.getElementById('videoGenerateBtn').style.display = 'none';
  document.getElementById('videoAudioPlayer').innerHTML = '';
  document.getElementById('videoSyncWrap').style.display = 'none';
  document.getElementById('videoExportWrap').style.display = 'none';
  _videoEmotionSequence = [];
  _videoAudioUrl = null;
  _videoAudioBlob = null;
  _videoWavBase64 = null;
}

function runCardVideoLoad(cid, input) {
  const file = input.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const video = document.getElementById(cid + '_video');
  video.src = url;
  document.getElementById(cid + '_previewWrap').style.display = 'block';
  document.getElementById(cid + '_controls').style.display = 'block';
  video.dataset.fileUrl = url;
}

function computeFrameEmotion(data, width, height, prevData) {
  let totalR = 0, totalG = 0, totalB = 0, totalBright = 0;
  let totalSat = 0;
  const count = width * height;
  for (let i = 0; i < count; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    totalR += r; totalG += g; totalB += b;
    const bright = (r + g + b) / 3;
    totalBright += bright;
    const maxc = Math.max(r, g, b);
    const minc = Math.min(r, g, b);
    totalSat += (maxc - minc) / 255;
  }
  const avgBright = totalBright / count / 255;
  const avgSat = totalSat / count;
  const avgR = totalR / count / 255;
  const avgG = totalG / count / 255;
  const avgB = totalB / count / 255;

  let warmScore = (avgR * 0.6 + avgG * 0.4) - avgB;
  let coolScore = avgB - (avgR * 0.5 + avgG * 0.3);
  if (warmScore < 0) warmScore = 0;
  if (coolScore < 0) coolScore = 0;

  let motion = 0;
  if (prevData) {
    let diffSum = 0;
    for (let i = 0; i < count; i++) {
      const dr = data[i * 4] - prevData[i * 4];
      const dg = data[i * 4 + 1] - prevData[i * 4 + 1];
      const db = data[i * 4 + 2] - prevData[i * 4 + 2];
      diffSum += (Math.abs(dr) + Math.abs(dg) + Math.abs(db)) / 3;
    }
    motion = (diffSum / count) / 255;
  }

  const happy = Math.min(1, avgBright * 0.5 + avgSat * 0.5 + warmScore * 0.3);
  const sad = Math.min(1, (1 - avgBright) * 0.5 + coolScore * 0.4 + (1 - avgSat) * 0.2);
  const tense = Math.min(1, motion * 0.6 + (1 - avgBright) * 0.2 + avgSat * 0.2);
  const calm = Math.min(1, (1 - motion) * 0.5 + coolScore * 0.3 + (1 - avgSat) * 0.2);
  const excited = Math.min(1, motion * 0.5 + avgSat * 0.4 + warmScore * 0.3);

  return { happy, sad, tense, calm, excited, avgBright, avgSat, motion };
}

async function analyzeVideoEmotion() {
  const video = document.getElementById('videoPreview');
  const canvas = document.getElementById('videoAnalyzeCanvas');
  const ctx = canvas.getContext('2d');
  const loading = document.getElementById('videoAnalyzeLoading');
  const result = document.getElementById('videoEmotionResult');
  const chart = document.getElementById('videoEmotionChart');

  if (!video.src || video.readyState < 2) { showToast('请先等待视频加载'); return; }

  loading.classList.add('show');
  result.textContent = '';
  chart.innerHTML = '';
  _videoEmotionSequence = [];

  const duration = video.duration || 0;
  const interval = 2;
  const captureWidth = 160;
  const captureHeight = 90;
  canvas.width = captureWidth;
  canvas.height = captureHeight;

  let prevData = null;
  const times = [];
  for (let t = 0; t < duration; t += interval) times.push(t);
  if (duration - times[times.length - 1] > 0.5) times.push(duration);

  for (let idx = 0; idx < times.length; idx++) {
    const t = times[idx];
    video.currentTime = t;
    await new Promise(r => {
      const onSeek = () => { video.removeEventListener('seeked', onSeek); r(); };
      video.addEventListener('seeked', onSeek);
    });
    await new Promise(r => setTimeout(r, 50));
    ctx.drawImage(video, 0, 0, captureWidth, captureHeight);
    const imageData = ctx.getImageData(0, 0, captureWidth, captureHeight);
    const emotion = computeFrameEmotion(imageData.data, captureWidth, captureHeight, prevData);
    prevData = new Uint8ClampedArray(imageData.data);
    _videoEmotionSequence.push({ time: Math.round(t * 10) / 10, emotion, intensity: (emotion.tense + emotion.excited) / 2 });
  }

  drawEmotionChart(_videoEmotionSequence);

  const dominant = _videoEmotionSequence.reduce((acc, cur) => {
    const e = cur.emotion;
    acc.happy += e.happy; acc.sad += e.sad; acc.tense += e.tense; acc.calm += e.calm; acc.excited += e.excited;
    return acc;
  }, { happy: 0, sad: 0, tense: 0, calm: 0, excited: 0 });
  const total = _videoEmotionSequence.length || 1;
  result.textContent = `分析完成！共 ${times.length} 个采样点\n主导情绪: happy=${(dominant.happy/total).toFixed(2)} sad=${(dominant.sad/total).toFixed(2)} tense=${(dominant.tense/total).toFixed(2)} calm=${(dominant.calm/total).toFixed(2)} excited=${(dominant.excited/total).toFixed(2)}`;
  document.getElementById('videoGenerateBtn').style.display = 'block';
  loading.classList.remove('show');
}

function drawEmotionChart(sequence) {
  const chart = document.getElementById('videoEmotionChart');
  if (!sequence.length) { chart.innerHTML = ''; return; }
  const w = chart.clientWidth || 340;
  const h = chart.clientHeight || 100;
  const colors = { happy: '#ff9800', sad: '#3f51b5', tense: '#f44336', calm: '#4caf50', excited: '#e91e63' };
  const labels = { happy: '欢', sad: '忧', tense: '紧', calm: '静', excited: '激' };
  let html = `<div style="position:relative;width:${w}px;height:${h}px;">`;
  const n = sequence.length;
  Object.keys(colors).forEach(key => {
    let path = '';
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1 || 1)) * w;
      const y = h - (sequence[i].emotion[key] * h * 0.85) - 2;
      path += (i === 0 ? `M${x},${y}` : ` L${x},${y}`);
    }
    html += `<svg style="position:absolute;inset:0;pointer-events:none;" width="${w}" height="${h}"><path d="${path}" fill="none" stroke="${colors[key]}" stroke-width="2" opacity="0.85"/></svg>`;
  });
  const legend = Object.keys(colors).map(k => `<span style="font-size:10px;color:${colors[k]};margin-right:6px;">●${labels[k]}</span>`).join('');
  html += `<div style="position:absolute;bottom:2px;left:4px;background:rgba(255,255,255,0.7);border-radius:4px;padding:0 4px;">${legend}</div></div>`;
  chart.innerHTML = html;
}

async function generateVideoScore() {
  const loading = document.getElementById('videoGenLoading');
  const player = document.getElementById('videoAudioPlayer');
  const result = document.getElementById('videoEmotionResult');
  loading.classList.add('show'); player.innerHTML = '';

  try {
    const res = await fetch(`${API}/api/video/score`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emotionSequence: _videoEmotionSequence })
    });
    const params = await res.json();
    if (params.error) throw new Error(params.error);

    const prodRes = await fetch(`${API}/api/produce`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style: params.style, key: params.key, emotion: params.emotion, bpm: params.bpm, barCount: params.barCount, maxAttempts: 2 })
    });
    const d = await prodRes.json();
    if (d.error) throw new Error(d.error);

    const wav = Uint8Array.from(atob(d.wavBase64), c => c.charCodeAt(0));
    _videoWavBase64 = d.wavBase64;
    _videoAudioBlob = new Blob([wav], { type: 'audio/wav' });
    _videoAudioUrl = URL.createObjectURL(_videoAudioBlob);
    player.innerHTML = `<audio id="videoGeneratedAudio" controls src="${_videoAudioUrl}" style="width:100%;margin-top:8px;"></audio>`;
    result.textContent += `\n\n🎼 配乐生成完成！\n风格: ${params.style} | 调性: ${params.key} | BPM: ${params.bpm}\n小节: ${params.barCount} | 情绪: ${params.emotion}\n段落: ${params.sections?.map(s=>s.type).join(' → ')}`;
    document.getElementById('videoSyncWrap').style.display = 'block';
    document.getElementById('videoExportWrap').style.display = 'block';
  } catch (e) {
    result.textContent += '\n\n配乐生成错误: ' + e.message;
  }
  loading.classList.remove('show');
}

function syncPlayVideoAudio() {
  const video = document.getElementById('videoPreview');
  const audio = document.getElementById('videoGeneratedAudio');
  if (!video || !audio) return;
  video.currentTime = 0;
  audio.currentTime = 0;
  const p1 = video.play();
  const p2 = audio.play();
  if (p1 && p1.catch) p1.catch(()=>{});
  if (p2 && p2.catch) p2.catch(()=>{});
}
function stopSyncPlay() {
  const video = document.getElementById('videoPreview');
  const audio = document.getElementById('videoGeneratedAudio');
  if (video) video.pause();
  if (audio) audio.pause();
}

async function exportVideoAudioZip() {
  if (!_videoFileUrl || !_videoAudioBlob) { showToast('无可导出内容'); return; }
  try {
    const videoResp = await fetch(_videoFileUrl);
    const videoBlob = await videoResp.blob();
    const videoName = 'video' + (videoBlob.type.includes('mp4') ? '.mp4' : '.video');
    const audioName = 'soundtrack.wav';

    // 简化 ZIP 实现（无外部库）：构造一个最简有效的 ZIP
    const encoder = new TextEncoder();
    function crc32(bytes) {
      const table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[i] = c >>> 0;
      }
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    function uint16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
    function uint32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }
    function dateToDos(d) {
      return ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    }
    function timeToDos(d) {
      return (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    }
    async function makeLocalFile(name, blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const nameBytes = encoder.encode(name);
      const crc = crc32(bytes);
      const now = new Date();
      const header = new Uint8Array([
        0x50, 0x4B, 0x03, 0x04, 20, 0, 0, 0, 0,
        ...uint16(timeToDos(now)), ...uint16(dateToDos(now)),
        ...uint32(crc), ...uint32(bytes.length), ...uint32(bytes.length),
        ...uint16(nameBytes.length), 0, 0, ...nameBytes
      ]);
      return { header, bytes, nameBytes, crc, size: bytes.length };
    }
    const f1 = await makeLocalFile(videoName, videoBlob);
    const f2 = await makeLocalFile(audioName, _videoAudioBlob);
    let offset = 0;
    const central = [];
    const parts = [];
    [f1, f2].forEach(f => {
      parts.push(f.header, f.bytes);
      const cd = new Uint8Array([
        0x50, 0x4B, 0x01, 0x02, 20, 0, 20, 0, 0, 0, 0,
        ...uint16(timeToDos(new Date())), ...uint16(dateToDos(new Date())),
        ...uint32(f.crc), ...uint32(f.size), ...uint32(f.size),
        ...uint16(f.nameBytes.length), 0, 0, 0, 0, 0, 0, 0,
        ...uint32(0), ...f.nameBytes
      ]);
      central.push({ cd, offset });
      offset += f.header.length + f.bytes.length;
    });
    const cdStart = offset;
    const cdArrays = central.map(c => { c.cd.set(uint32(c.offset), 42); return c.cd; });
    const cdTotal = cdArrays.reduce((s, a) => s + a.length, 0);
    const eocd = new Uint8Array([
      0x50, 0x4B, 0x05, 0x06, 0, 0, 0, 0,
      ...uint16(2), ...uint16(2), ...uint32(cdTotal), ...uint32(cdStart), 0, 0
    ]);
    const zip = new Blob([...parts, ...cdArrays, eocd], { type: 'application/zip' });
    const url = URL.createObjectURL(zip);
    const a = document.createElement('a');
    a.href = url; a.download = 'video_soundtrack.zip';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('ZIP 导出成功');
  } catch (e) { showToast('导出失败: ' + e.message); }
}

async function runCardVideoAnalyze(cid) {
  const video = document.getElementById(cid + '_video');
  const canvas = document.getElementById(cid + '_canvas');
  const ctx = canvas.getContext('2d');
  const resEl = document.getElementById(cid + '_res');
  const player = document.getElementById(cid + '_player');

  if (!video.src || video.readyState < 2) { resEl.textContent = '请先等待视频加载'; return; }
  resEl.textContent = '分析中...';
  player.innerHTML = '';

  const duration = video.duration || 0;
  const interval = 2;
  const captureWidth = 160;
  const captureHeight = 90;
  canvas.width = captureWidth;
  canvas.height = captureHeight;

  let prevData = null;
  const times = [];
  for (let t = 0; t < duration; t += interval) times.push(t);
  if (duration - times[times.length - 1] > 0.5) times.push(duration);

  const sequence = [];
  for (let idx = 0; idx < times.length; idx++) {
    const t = times[idx];
    video.currentTime = t;
    await new Promise(r => {
      const onSeek = () => { video.removeEventListener('seeked', onSeek); r(); };
      video.addEventListener('seeked', onSeek);
    });
    await new Promise(r => setTimeout(r, 50));
    ctx.drawImage(video, 0, 0, captureWidth, captureHeight);
    const imageData = ctx.getImageData(0, 0, captureWidth, captureHeight);
    const emotion = computeFrameEmotion(imageData.data, captureWidth, captureHeight, prevData);
    prevData = new Uint8ClampedArray(imageData.data);
    sequence.push({ time: Math.round(t * 10) / 10, emotion, intensity: (emotion.tense + emotion.excited) / 2 });
  }

  try {
    const scoreRes = await fetch(`${API}/api/video/score`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emotionSequence: sequence })
    });
    const params = await scoreRes.json();
    if (params.error) throw new Error(params.error);

    const prodRes = await fetch(`${API}/api/produce`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style: params.style, key: params.key, emotion: params.emotion, bpm: params.bpm, barCount: params.barCount, maxAttempts: 2 })
    });
    const d = await prodRes.json();
    if (d.error) throw new Error(d.error);

    const wav = Uint8Array.from(atob(d.wavBase64), c => c.charCodeAt(0));
    const blob = new Blob([wav], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    player.innerHTML = `<audio controls src="${url}" style="width:100%;margin-top:8px;"></audio>`;
    resEl.textContent = `配乐生成完成！\n风格: ${params.style} | 调性: ${params.key} | BPM: ${params.bpm}\n小节: ${params.barCount}`;
  } catch (e) {
    resEl.textContent = '错误: ' + e.message;
  }
}

/* ================= 插件系统 ================= */
let pluginParams = [];
function onPluginTypeChange() {
  const type = document.getElementById('pluginType').value;
  const codeEl = document.getElementById('pluginCode');
  if (!codeEl.value.trim()) {
    if (type === 'effect') loadExamplePlugin('distortion');
    else if (type === 'instrument') loadExamplePlugin('sine');
    else loadExamplePlugin('scope');
  }
}
function addPluginParam() {
  const idx = pluginParams.length;
  pluginParams.push({ name: '', type: 'number', default: 0, min: 0, max: 1 });
  renderPluginParams();
}
function removePluginParam(idx) {
  pluginParams.splice(idx, 1);
  renderPluginParams();
}
function updatePluginParam(idx, key, val) {
  if (key === 'default') {
    const p = pluginParams[idx];
    if (p.type === 'number') val = parseFloat(val) || 0;
    else if (p.type === 'boolean') val = val === 'true' || val === true;
  }
  if (key === 'min' || key === 'max') val = val === '' ? undefined : parseFloat(val);
  pluginParams[idx][key] = val;
}
function renderPluginParams() {
  const wrap = document.getElementById('pluginParamsWrap');
  wrap.innerHTML = pluginParams.map((p, i) => `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
      <input type="text" placeholder="名称" value="${escapeHtml(p.name)}" onchange="updatePluginParam(${i},'name',this.value)" style="flex:1;padding:6px 8px;border-radius:8px;border:1px solid var(--border);font-size:12px;">
      <select onchange="updatePluginParam(${i},'type',this.value)" style="padding:6px 8px;border-radius:8px;border:1px solid var(--border);font-size:12px;">
        <option value="number" ${p.type==='number'?'selected':''}>number</option>
        <option value="boolean" ${p.type==='boolean'?'selected':''}>boolean</option>
        <option value="enum" ${p.type==='enum'?'selected':''}>enum</option>
      </select>
      <input type="text" placeholder="默认值" value="${escapeHtml(String(p.default))}" onchange="updatePluginParam(${i},'default',this.value)" style="width:70px;padding:6px 8px;border-radius:8px;border:1px solid var(--border);font-size:12px;">
      <input type="number" placeholder="min" value="${p.min!==undefined?p.min:''}" onchange="updatePluginParam(${i},'min',this.value)" style="width:60px;padding:6px 8px;border-radius:8px;border:1px solid var(--border);font-size:12px;">
      <input type="number" placeholder="max" value="${p.max!==undefined?p.max:''}" onchange="updatePluginParam(${i},'max',this.value)" style="width:60px;padding:6px 8px;border-radius:8px;border:1px solid var(--border);font-size:12px;">
      <button class="s-btn-small" onclick="removePluginParam(${i})" style="background:rgba(255,0,0,0.06);color:#d44;">✕</button>
    </div>
  `).join('');
}
function getPluginPayload() {
  const params = pluginParams.map(p => {
    const out = { name: p.name, type: p.type, default: p.default };
    if (p.min !== undefined) out.min = p.min;
    if (p.max !== undefined) out.max = p.max;
    return out;
  });
  return {
    name: document.getElementById('pluginName').value.trim(),
    version: document.getElementById('pluginVersion').value.trim() || '1.0.0',
    type: document.getElementById('pluginType').value,
    parameters: params,
    code: document.getElementById('pluginCode').value.trim(),
  };
}
async function registerPlugin() {
  const loading = document.getElementById('pluginLoading');
  const result = document.getElementById('pluginResult');
  loading.classList.add('show'); result.textContent = '';
  try {
    const payload = getPluginPayload();
    if (!payload.name) throw new Error('插件名称不能为空');
    if (!payload.code) throw new Error('插件代码不能为空');
    const r = await fetch(`${API}/api/plugin/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const d = await r.json();
    if (d.success) {
      result.textContent = `✓ ${d.message}`;
      refreshPluginList();
      populatePluginSelects();
    } else {
      throw new Error(d.message);
    }
  } catch (e) { result.textContent = '错误: ' + e.message; }
  loading.classList.remove('show');
}
async function testPlugin() {
  const loading = document.getElementById('pluginLoading');
  const result = document.getElementById('pluginResult');
  const canvas = document.getElementById('pluginTestCanvas');
  loading.classList.add('show'); result.textContent = '';
  try {
    const payload = getPluginPayload();
    if (!payload.name) throw new Error('插件名称不能为空');
    if (!payload.code) throw new Error('插件代码不能为空');
    // Compile client-side for quick test
    const scopeKeys = ['Math','NaN','Infinity','undefined'];
    const scopeVals = [Math,NaN,Infinity,undefined];
    const factory = new Function(...scopeKeys, `
      "use strict";
      return (function(input, output, params, sampleRate) {
        ${payload.code}
        if (typeof processBlock !== 'function') throw new Error('processBlock not defined');
        return processBlock(input, output, params, sampleRate);
      });
    `);
    const processBlock = factory(...scopeVals);
    const sampleRate = 44100;
    const blockSize = 256;
    const input = new Float32Array(blockSize);
    // Create a simple test signal: mix of sine and noise
    for (let i = 0; i < blockSize; i++) {
      input[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5 + (Math.random() - 0.5) * 0.1;
    }
    const output = new Float32Array(blockSize);
    const params = {};
    for (const p of payload.parameters) {
      if (p.type === 'number') params[p.name] = typeof p.default === 'number' ? p.default : 0;
      else if (p.type === 'boolean') params[p.name] = p.default === true ? 1 : 0;
      else params[p.name] = 0;
    }
    processBlock(input, output, params, sampleRate);

    // Draw output on canvas
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 1.5; ctx.beginPath();
    let maxVal = 0;
    for (let i = 0; i < blockSize; i++) maxVal = Math.max(maxVal, Math.abs(output[i]));
    const scale = maxVal > 0 ? (h / 2 - 8) / maxVal : 1;
    for (let i = 0; i < blockSize; i++) {
      const x = (i / (blockSize - 1)) * w;
      const y = h / 2 - output[i] * scale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    result.textContent = `✓ 客户端测试通过！输出峰值: ${maxVal.toFixed(4)}`;
  } catch (e) { result.textContent = '测试错误: ' + e.message; }
  loading.classList.remove('show');
}
async function refreshPluginList() {
  const listEl = document.getElementById('pluginList');
  try {
    const r = await fetch(`${API}/api/plugin/list`);
    const d = await r.json();
    if (!d.plugins || d.plugins.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text2);font-size:12px;">暂无已注册插件</div>';
      return;
    }
    listEl.innerHTML = d.plugins.map(p => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:rgba(91,77,255,0.05);border-radius:10px;margin-bottom:6px;">
        <div>
          <div style="font-weight:600;font-size:13px;">${escapeHtml(p.name)} <span style="font-size:10px;color:var(--text3);">v${escapeHtml(p.version)}</span></div>
          <div style="font-size:11px;color:var(--text2);">类型: ${p.type} | 参数: ${p.parameters.length}个</div>
        </div>
        <button class="s-btn-small" onclick="deletePlugin('${escapeHtml(p.name)}')" style="background:rgba(255,0,0,0.06);color:#d44;">删除</button>
      </div>
    `).join('');
  } catch (e) { listEl.innerHTML = '<div style="color:#d44;font-size:12px;">加载失败: ' + e.message + '</div>'; }
}
async function deletePlugin(name) {
  if (!confirm(`确定删除插件 "${name}" 吗？`)) return;
  try {
    const r = await fetch(`${API}/api/plugin/unregister`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const d = await r.json();
    if (d.success) { showToast(d.message); refreshPluginList(); populatePluginSelects(); }
    else throw new Error(d.message);
  } catch (e) { showToast('删除失败: ' + e.message); }
}
function populatePluginSelects() {
  // Populate effect/instrument selects if they exist on the page
  fetch(`${API}/api/plugin/list`).then(r => r.json()).then(d => {
    const plugins = d.plugins || [];
    const effectSelect = document.getElementById('effectType');
    if (effectSelect) {
      // Remove old custom options
      Array.from(effectSelect.options).forEach(opt => { if (opt.dataset.custom === 'true') effectSelect.removeChild(opt); });
      plugins.filter(p => p.type === 'effect').forEach(p => {
        const opt = document.createElement('option'); opt.value = 'plugin:' + p.name; opt.textContent = '🔌 ' + p.name; opt.dataset.custom = 'true';
        effectSelect.appendChild(opt);
      });
    }
    const waveSelect = document.getElementById('flawWave');
    if (waveSelect) {
      Array.from(waveSelect.options).forEach(opt => { if (opt.dataset.custom === 'true') waveSelect.removeChild(opt); });
      plugins.filter(p => p.type === 'instrument').forEach(p => {
        const opt = document.createElement('option'); opt.value = 'plugin:' + p.name; opt.textContent = '🔌 ' + p.name; opt.dataset.custom = 'true';
        waveSelect.appendChild(opt);
      });
    }
  }).catch(() => {});
}
function loadExamplePlugin(name) {
  const examples = {
    distortion: {
      name: 'SimpleDistortion', version: '1.0.0', type: 'effect',
      params: [{ name:'drive', type:'number', default:0.5, min:0, max:1 }, { name:'mix', type:'number', default:0.5, min:0, max:1 }],
      code: `// 软削波失真效果器\nfunction processBlock(input, output, params, sampleRate) {\n  const drive = params.drive || 0.5;\n  const mix = params.mix || 0.5;\n  const threshold = 1.0 / (1.0 + drive * 3.0);\n  for (let i = 0; i < input.length; i++) {\n    const x = input[i];\n    // 软削波\n    const clipped = x > threshold ? threshold + (x - threshold) / (1.0 + Math.pow(x - threshold, 2))\n      : (x < -threshold ? -threshold + (x + threshold) / (1.0 + Math.pow(x + threshold, 2)) : x);\n    output[i] = x * (1.0 - mix) + clipped * mix;\n  }\n}`
    },
    sine: {
      name: 'SimpleSineSynth', version: '1.0.0', type: 'instrument',
      params: [{ name:'attack', type:'number', default:0.01, min:0, max:1 }, { name:'release', type:'number', default:0.2, min:0, max:1 }],
      code: `// 正弦波合成器\nfunction processBlock(input, output, params, sampleRate) {\n  // 效果器占位\n  for (let i = 0; i < input.length; i++) output[i] = input[i];\n}\nfunction generateNote(frequency, duration, velocity, params, sampleRate) {\n  const attack = params.attack || 0.01;\n  const release = params.release || 0.2;\n  const samples = Math.floor(duration * sampleRate);\n  const out = new Float32Array(samples);\n  const attackSamples = Math.max(1, Math.floor(attack * sampleRate));\n  const releaseSamples = Math.max(1, Math.floor(release * sampleRate));\n  const sustainSamples = Math.max(0, samples - attackSamples - releaseSamples);\n  for (let i = 0; i < samples; i++) {\n    const t = i / sampleRate;\n    const env = i < attackSamples ? (i / attackSamples)\n      : (i < attackSamples + sustainSamples ? 1.0\n      : Math.max(0, 1.0 - (i - attackSamples - sustainSamples) / releaseSamples));\n    out[i] = Math.sin(2.0 * Math.PI * frequency * t) * env * velocity;\n  }\n  return out;\n}`
    },
    scope: {
      name: 'SimpleScope', version: '1.0.0', type: 'visualizer',
      params: [{ name:'gain', type:'number', default:1.0, min:0.1, max:5.0 }],
      code: `// 示波器效果（增益+限幅）\nfunction processBlock(input, output, params, sampleRate) {\n  const gain = params.gain || 1.0;\n  for (let i = 0; i < input.length; i++) {\n    const v = input[i] * gain;\n    output[i] = Math.max(-1.0, Math.min(1.0, v));\n  }\n}`
    }
  };
  const ex = examples[name];
  if (!ex) return;
  document.getElementById('pluginName').value = ex.name;
  document.getElementById('pluginVersion').value = ex.version;
  document.getElementById('pluginType').value = ex.type;
  pluginParams = ex.params.map(p => ({ ...p }));
  renderPluginParams();
  document.getElementById('pluginCode').value = ex.code;
}
/* ================= 工作室标签切换 ================= */
document.querySelectorAll('.studio-tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.studio-tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.studio-panel').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById(t.dataset.sp).classList.add('active');
  });
});

/* ================= 时钟 ================= */
setInterval(() => {
  const now = new Date();
  document.getElementById('clock').textContent = `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;
}, 1000);

/* ================= 实时协作系统 ================= */
let collabState = {
  connected: false,
  roomId: '',
  userId: '',
  nickname: '',
  ownerId: '',
  locked: false,
  users: [],
  eventSource: null,
};

function generateCollabUserId() {
  return 'u_' + Math.random().toString(36).slice(2, 8) + '_' + Date.now().toString(36).slice(-4);
}

function generateRoomId() {
  return 'room_' + Math.random().toString(36).slice(2, 8);
}

function joinCollabRoom() {
  const nickname = document.getElementById('collabNickname').value.trim() || '匿名';
  let roomId = document.getElementById('collabRoomId').value.trim();
  if (!roomId) {
    roomId = generateRoomId();
    document.getElementById('collabRoomId').value = roomId;
  }
  const userId = generateCollabUserId();
  collabState.nickname = nickname;
  collabState.userId = userId;
  collabState.roomId = roomId;

  document.getElementById('collabNotJoined').style.display = 'none';
  document.getElementById('collabJoined').style.display = 'block';
  document.getElementById('collabDisplayRoomId').textContent = roomId;

  setupCollabEventSource();
  addCollabLog('正在加入房间...');
}

function leaveCollabRoom() {
  if (collabState.eventSource) {
    collabState.eventSource.close();
    collabState.eventSource = null;
  }
  collabState.connected = false;
  collabState.roomId = '';
  collabState.ownerId = '';
  collabState.locked = false;
  collabState.users = [];

  document.getElementById('collabNotJoined').style.display = 'block';
  document.getElementById('collabJoined').style.display = 'none';
  document.getElementById('collabStatus').textContent = '未连接';
  document.getElementById('collabStatus').className = 'collab-status offline';
  document.getElementById('collabUserList').innerHTML = '';
  document.getElementById('collabChatMessages').innerHTML = '';
  document.getElementById('collabLog').innerHTML = '';
  document.getElementById('collabLockedBadge').innerHTML = '';
  document.getElementById('collabOwnerActions').style.display = 'none';
  showToast('已离开房间');
}

function setupCollabEventSource() {
  if (collabState.eventSource) {
    collabState.eventSource.close();
  }
  const url = `${API}/api/collab/stream?roomId=${encodeURIComponent(collabState.roomId)}&userId=${encodeURIComponent(collabState.userId)}&nickname=${encodeURIComponent(collabState.nickname)}`;
  const es = new EventSource(url);
  collabState.eventSource = es;

  es.onopen = () => {
    collabState.connected = true;
    document.getElementById('collabStatus').textContent = '已连接';
    document.getElementById('collabStatus').className = 'collab-status online';
    addCollabLog('SSE 连接已建立');
  };

  es.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      handleCollabEvent(event);
    } catch (err) {
      console.error('协作事件解析错误:', err);
    }
  };

  es.onerror = () => {
    collabState.connected = false;
    document.getElementById('collabStatus').textContent = '连接中断';
    document.getElementById('collabStatus').className = 'collab-status offline';
    addCollabLog('SSE 连接中断，尝试重连...');
  };
}

function handleCollabEvent(event) {
  switch (event.type) {
    case 'connected':
      collabState.ownerId = event.data.ownerId;
      collabState.locked = event.data.locked;
      updateCollabOwnerUI();
      addCollabLog(`已连接到房间，房主: ${event.data.ownerId === collabState.userId ? '你' : event.data.ownerId}`);
      if (event.data.locked) addCollabLog('房间当前处于锁定状态');
      break;
    case 'userList':
      collabState.users = event.data || [];
      renderCollabUsers();
      break;
    case 'userJoined':
      collabState.users = event.data.users || [];
      if (event.data.ownerChanged) {
        collabState.ownerId = event.data.userId;
        updateCollabOwnerUI();
      }
      renderCollabUsers();
      addCollabChat('system', `${event.data.nickname} 加入了房间`);
      addCollabLog(`用户加入: ${event.data.nickname}`);
      break;
    case 'userLeft':
      collabState.users = event.data.users || [];
      renderCollabUsers();
      addCollabChat('system', `用户 ${event.data.userId.slice(0,8)} 离开了房间`);
      addCollabLog(`用户离开: ${event.data.userId.slice(0,8)}`);
      break;
    case 'chatMessage':
      if (event.from !== collabState.userId) {
        const user = collabState.users.find(u => u.userId === event.from);
        addCollabChat(event.from, event.data.text, user?.color);
      }
      break;
    case 'noteAdded':
      addCollabLog(`[${fmtTime(event.time)}] ${event.from.slice(0,8)} 添加了音符`);
      break;
    case 'noteDeleted':
      addCollabLog(`[${fmtTime(event.time)}] ${event.from.slice(0,8)} 删除了音符`);
      break;
    case 'paramChanged':
      addCollabLog(`[${fmtTime(event.time)}] ${event.from.slice(0,8)} 修改了参数: ${event.data.key}=${event.data.value}`);
      break;
    case 'cursorMoved':
      addCollabLog(`[${fmtTime(event.time)}] ${event.from.slice(0,8)} 光标移动: ${event.data.panel}`);
      break;
    case 'roomLocked':
      collabState.locked = true;
      document.getElementById('collabLockedBadge').innerHTML = '<span class="collab-locked-badge">🔒 锁定</span>';
      addCollabLog('房间已被锁定');
      updateCollabOwnerUI();
      break;
    case 'roomUnlocked':
      collabState.locked = false;
      document.getElementById('collabLockedBadge').innerHTML = '';
      addCollabLog('房间已解锁');
      updateCollabOwnerUI();
      break;
    case 'syncResponse':
      if (event.data.project) {
        restoreProject(event.data.project);
        addCollabLog('收到项目同步数据');
        showToast('项目已同步');
      }
      break;
  }
}

function updateCollabOwnerUI() {
  const isOwner = collabState.ownerId === collabState.userId;
  document.getElementById('collabOwnerActions').style.display = isOwner ? 'block' : 'none';
  document.getElementById('collabLockBtn').style.display = (!collabState.locked && isOwner) ? 'inline-block' : 'none';
  document.getElementById('collabUnlockBtn').style.display = (collabState.locked && isOwner) ? 'inline-block' : 'none';
}

function renderCollabUsers() {
  const container = document.getElementById('collabUserList');
  container.innerHTML = collabState.users.map(u => {
    const isMe = u.userId === collabState.userId;
    const isOwner = u.userId === collabState.ownerId;
    return `<div class="collab-user-chip ${isMe ? 'me' : ''}"><span class="dot" style="background:${u.color || '#999'}"></span>${escapeHtml(u.nickname)}${isOwner ? ' (房主)' : ''}${isMe ? ' (你)' : ''}</div>`;
  }).join('');
}

function addCollabChat(from, text, color) {
  const container = document.getElementById('collabChatMessages');
  const div = document.createElement('div');
  if (from === 'system') {
    div.className = 'collab-chat-msg system';
    div.textContent = text;
  } else {
    const isMe = from === collabState.userId;
    const user = collabState.users.find(u => u.userId === from);
    const name = isMe ? '你' : (user?.nickname || from.slice(0,8));
    div.className = 'collab-chat-msg';
    div.innerHTML = `<span class="msg-name" style="color:${color || (isMe ? 'var(--accent)' : 'var(--text2)')}">${escapeHtml(name)}:</span><span class="msg-text">${escapeHtml(text)}</span>`;
  }
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function addCollabLog(text) {
  const container = document.getElementById('collabLog');
  const div = document.createElement('div');
  div.className = 'collab-log-item';
  const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  div.innerHTML = `<span class="log-time">${time}</span><span>${escapeHtml(text)}</span>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function clearCollabLog() {
  document.getElementById('collabLog').innerHTML = '';
}

async function broadcastCollabEvent(type, data) {
  if (!collabState.connected || !collabState.roomId) return;
  try {
    await fetch(`${API}/api/collab/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: collabState.roomId, userId: collabState.userId, type, data })
    });
  } catch (e) {
    console.error('广播失败:', e);
  }
}

function sendCollabChat() {
  const input = document.getElementById('collabChatInput');
  const text = input.value.trim();
  if (!text) return;
  if (!collabState.connected) { showToast('未连接'); return; }
  addCollabChat(collabState.userId, text);
  broadcastCollabEvent('chatMessage', { text });
  input.value = '';
}

async function lockCollabRoom() {
  if (!collabState.connected) return;
  try {
    const r = await fetch(`${API}/api/collab/lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: collabState.roomId, userId: collabState.userId })
    });
    const d = await r.json();
    if (d.ok) showToast('房间已锁定');
    else showToast(d.error || '锁定失败');
  } catch (e) { showToast('锁定失败'); }
}

async function unlockCollabRoom() {
  if (!collabState.connected) return;
  try {
    const r = await fetch(`${API}/api/collab/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: collabState.roomId, userId: collabState.userId })
    });
    const d = await r.json();
    if (d.ok) showToast('房间已解锁');
    else showToast(d.error || '解锁失败');
  } catch (e) { showToast('解锁失败'); }
}

function requestCollabSync() {
  if (!collabState.connected) { showToast('未连接'); return; }
  broadcastCollabEvent('syncRequest', { requester: collabState.userId });
  addCollabLog('已请求项目同步');
}

/* ================= 在现有操作函数中集成协作广播 ================= */
const _origCompose = compose;
compose = async function() {
  await _origCompose();
  broadcastCollabEvent('paramChanged', { key: 'compose', value: document.getElementById('algo')?.value });
};

const _origFullSong = fullSong;
fullSong = async function() {
  await _origFullSong();
  broadcastCollabEvent('noteAdded', { count: currentProject.melody?.length || 0 });
};

const _origGenerateLyrics = generateLyrics;
generateLyrics = async function() {
  await _origGenerateLyrics();
  broadcastCollabEvent('paramChanged', { key: 'lyrics', value: 'generated' });
};

const _origGenerateArranger = generateArranger;
generateArranger = async function() {
  await _origGenerateArranger();
  broadcastCollabEvent('paramChanged', { key: 'arranger', value: document.getElementById('arrStyle')?.value });
};

const _origGenerateFlawless = generateFlawless;
generateFlawless = async function() {
  await _origGenerateFlawless();
  broadcastCollabEvent('paramChanged', { key: 'flawless', value: document.getElementById('flawMode')?.value });
};

const _origGenerateEmergence = generateEmergence;
generateEmergence = async function() {
  await _origGenerateEmergence();
  broadcastCollabEvent('paramChanged', { key: 'emergence', value: 'composed' });
};

const _origGenerateProduce = generateProduce;
generateProduce = async function() {
  await _origGenerateProduce();
  broadcastCollabEvent('noteAdded', { count: currentProject.melody?.length || 0 });
};

/* ================= 语音控制 ================= */
function setChatInput(text) {
  const input = document.getElementById('chatInput');
  const hint = document.getElementById('inputHint');
  if (input) {
    input.value = text;
    if (hint) hint.style.display = 'none';
    input.focus();
  }
}

let recognition = null;
let isRecording = false;
let voiceFinalTranscript = '';

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const rec = new SpeechRecognition();
  rec.lang = 'zh-CN';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onstart = () => {
    isRecording = true;
    voiceFinalTranscript = '';
    const btn = document.getElementById('voiceBtn');
    const status = document.getElementById('voiceStatus');
    const text = document.getElementById('voiceText');
    if (btn) btn.classList.add('recording');
    if (status) status.style.display = 'flex';
    if (text) text.textContent = '正在聆听...';
  };

  rec.onend = () => {
    isRecording = false;
    const btn = document.getElementById('voiceBtn');
    const status = document.getElementById('voiceStatus');
    if (btn) btn.classList.remove('recording');
    if (status) status.style.display = 'none';
    // 如果有最终识别结果，自动填入并发送
    if (voiceFinalTranscript.trim()) {
      setChatInput(voiceFinalTranscript.trim());
      sendChat();
    }
    voiceFinalTranscript = '';
  };

  rec.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        final += transcript;
      } else {
        interim += transcript;
      }
    }
    if (final) voiceFinalTranscript += final;
    const text = document.getElementById('voiceText');
    if (text) text.textContent = voiceFinalTranscript + interim || '正在聆听...';
  };

  rec.onerror = (event) => {
    console.error('语音识别错误:', event.error);
    const text = document.getElementById('voiceText');
    if (text) {
      if (event.error === 'not-allowed') text.textContent = '麦克风权限被拒绝';
      else if (event.error === 'no-speech') text.textContent = '未检测到语音，请重试';
      else text.textContent = '语音识别出错: ' + event.error;
    }
    stopVoiceRecognition();
  };

  return rec;
}

function toggleVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('您的浏览器不支持语音识别');
    return;
  }
  if (isRecording) {
    stopVoiceRecognition();
  } else {
    startVoiceRecognition();
  }
}

function startVoiceRecognition() {
  if (!recognition) recognition = initSpeechRecognition();
  if (!recognition) {
    showToast('您的浏览器不支持语音识别');
    return;
  }
  try {
    recognition.start();
  } catch (e) {
    showToast('无法启动语音识别');
  }
}

function stopVoiceRecognition() {
  if (recognition && isRecording) {
    try { recognition.stop(); } catch (e) {}
  }
  isRecording = false;
  const btn = document.getElementById('voiceBtn');
  const status = document.getElementById('voiceStatus');
  if (btn) btn.classList.remove('recording');
  if (status) status.style.display = 'none';
}

function speak(text) {
  if (!window.speechSynthesis) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'zh-CN';
  utter.rate = 1.1;
  utter.pitch = 1.0;
  window.speechSynthesis.speak(utter);
}

// 语音命令解析并执行
async function handleVoiceCommand(text) {
  try {
    const r = await fetch(`${API}/api/voice/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const cmd = await r.json();
    if (cmd.error) {
      addMessage('ai', '语音解析出错: ' + cmd.error);
      return;
    }

    // 播报已理解
    speak('已理解，正在生成...');
    addMessage('ai', `🎤 语音指令解析结果：\n风格: ${cmd.style || '默认'}\n情绪: ${cmd.emotion || '默认'}\n调性: ${cmd.key || 'C'}\nBPM: ${cmd.bpm || '默认'}\n动作: ${cmd.action}`);

    // 根据 action 执行对应操作
    if (cmd.action === 'arrange') {
      // 只生成伴奏
      const cid = 'voice_' + Date.now();
      addFuncCard('arranger');
      // 找到最新添加的卡片并自动填写参数
      setTimeout(() => {
        const cards = document.querySelectorAll('.func-card');
        const card = cards[cards.length - 1];
        if (!card) return;
        const cid2 = card.id;
        if (cmd.style) {
          const styleSel = document.getElementById(cid2 + '_style');
          if (styleSel) styleSel.value = cmd.style;
        }
        if (cmd.emotion) {
          const emoSel = document.getElementById(cid2 + '_emo');
          if (emoSel) emoSel.value = cmd.emotion;
        }
        runCardArranger(cid2).then(() => speak('生成完成'));
      }, 100);
    } else if (cmd.action === 'compose') {
      // 生成旋律
      const cid = 'voice_' + Date.now();
      addFuncCard('compose');
      setTimeout(() => {
        const cards = document.querySelectorAll('.func-card');
        const card = cards[cards.length - 1];
        if (!card) return;
        const cid2 = card.id;
        if (cmd.style) {
          const styleMap = {流行:'pop',摇滚:'rock',电子:'electronic',古典:'classical',中国风:'chinese'};
          const styleSel = document.getElementById(cid2 + '_style');
          if (styleSel) {
            const mapped = styleMap[cmd.style] || cmd.style;
            const options = Array.from(styleSel.options).map(o => o.value);
            if (options.includes(mapped)) styleSel.value = mapped;
          }
        }
        if (cmd.key) {
          const keyMap = {'C':'C大调','G':'G大调','Am':'A小调','F':'F大调'};
          const keySel = document.getElementById(cid2 + '_key');
          if (keySel && keyMap[cmd.key]) keySel.value = keyMap[cmd.key];
        }
        if (cmd.bpm) {
          const bpmInput = document.getElementById(cid2 + '_bpm');
          if (bpmInput) bpmInput.value = String(cmd.bpm);
        }
        runCardCompose(cid2).then(() => speak('生成完成'));
      }, 100);
    } else {
      // full：使用 produce 一键产音乐
      const cid = 'voice_' + Date.now();
      addFuncCard('produce');
      setTimeout(() => {
        const cards = document.querySelectorAll('.func-card');
        const card = cards[cards.length - 1];
        if (!card) return;
        const cid2 = card.id;
        if (cmd.style) {
          const styleSel = document.getElementById(cid2 + '_style');
          if (styleSel) styleSel.value = cmd.style;
        }
        if (cmd.emotion) {
          const emoSel = document.getElementById(cid2 + '_emo');
          if (emoSel) emoSel.value = cmd.emotion;
        }
        if (cmd.key) {
          const keySel = document.getElementById(cid2 + '_key');
          if (keySel) keySel.value = cmd.key;
        }
        runCardProduce(cid2).then(() => {
          speak('生成完成');
          // 如果包含歌词请求，同时生成歌词
          if (cmd.includeLyrics !== false && cmd.includeVoice) {
            addFuncCard('realistic');
          }
        });
      }, 100);
    }
  } catch (e) {
    addMessage('ai', '语音命令处理失败: ' + (e && e.message ? e.message : String(e)));
  }
}

// 修改 sendChat 以支持语音命令自动解析
const _origSendChat = sendChat;
sendChat = function() {
  const v = document.getElementById('chatInput').value.trim();
  if (!v) return;
  // 如果消息看起来像作曲指令，自动解析
  if (/来一首|给我一段|写一首|生成一首|伴奏|编曲|作曲|旋律|风格/.test(v)) {
    _origSendChat();
    handleVoiceCommand(v);
    return;
  }
  _origSendChat();
};

/* ================= 音频文件备用方案 ================= */
function initAudioFileUpload() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.id = 'audioFileInput';
  input.style.display = 'none';
  input.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const data = audioBuffer.getChannelData(0);

      // 简单分析：计算 RMS 能量和零交叉率作为节奏/音高参考
      let sum = 0;
      let zeroCrossings = 0;
      for (let i = 0; i < data.length; i++) {
        sum += data[i] * data[i];
        if (i > 0 && data[i] * data[i - 1] < 0) zeroCrossings++;
      }
      const rms = Math.sqrt(sum / data.length);
      const zcr = zeroCrossings / (data.length - 1);
      const estimatedPitch = zcr > 0 ? audioBuffer.sampleRate / (2 * zcr) : 0;

      addMessage('ai', `🎵 音频分析结果：\n文件名: ${file.name}\n采样率: ${audioBuffer.sampleRate}Hz\n时长: ${audioBuffer.duration.toFixed(2)}s\nRMS能量: ${rms.toFixed(4)}\n估计基频: ${estimatedPitch.toFixed(1)}Hz\n（此功能为语音识别备用方案）`);
    } catch (err) {
      showToast('音频解析失败');
    }
  });
  document.body.appendChild(input);
}

function triggerAudioUpload() {
  const input = document.getElementById('audioFileInput');
  if (input) input.click();
  else showToast('音频上传未初始化');
}

// 如果浏览器不支持语音识别，在语音按钮上添加点击提示
function checkVoiceSupport() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    const btn = document.getElementById('voiceBtn');
    if (btn) {
      btn.title = '您的浏览器不支持语音识别，点击上传音频文件';
      btn.onclick = triggerAudioUpload;
    }
    // 显示提示条
    const bar = document.querySelector('.input-bar');
    if (bar) {
      const hint = document.createElement('div');
      hint.className = 'voice-hint';
      hint.id = 'voiceBrowserHint';
      hint.textContent = '您的浏览器不支持语音识别，可使用音频文件分析作为备用';
      bar.parentElement.insertBefore(hint, bar);
    }
    initAudioFileUpload();
  }
}

/* ================= 版权指纹系统 ================= */
async function loadFpFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let base64 = '';
    for (let i = 0; i < bytes.length; i++) {
      base64 += String.fromCharCode(bytes[i]);
    }
    document.getElementById('fpWavBase64').value = btoa(base64);
  } catch (e) {
    showToast('文件读取失败: ' + e.message);
  }
  input.value = '';
}

async function generateFingerprintFromInput() {
  const loading = document.getElementById('fpLoading');
  const result = document.getElementById('fpResult');
  const base64 = document.getElementById('fpWavBase64').value.trim();
  if (!base64) { showToast('请输入 WAV Base64 或上传文件'); return; }
  loading.classList.add('show'); result.textContent = '';
  try {
    const res = await fetch(`${API}/api/fingerprint/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wavBase64: base64 })
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error);
    _currentFingerprint = d.fingerprint;
    result.innerHTML = `<div style="font-size:12px;word-break:break-all;"><b>指纹:</b> ${escapeHtml(d.fingerprint.slice(0,16))}... <span style="color:var(--accent);cursor:pointer;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">点击展开</span><pre style="display:none;margin-top:4px;background:rgba(0,0,0,0.03);padding:6px;border-radius:6px;font-size:10px;">${escapeHtml(d.fingerprint)}</pre></div><div style="font-size:11px;color:var(--text2);margin-top:4px;">全局哈希: ${escapeHtml(d.globalHash)}</div>`;
  } catch (e) { result.textContent = '错误: ' + e.message; }
  loading.classList.remove('show');
}

async function compareFingerprintsUI() {
  const loading = document.getElementById('fpCompareLoading');
  const result = document.getElementById('fpCompareResult');
  const b1 = document.getElementById('fpCompare1').value.trim();
  const b2 = document.getElementById('fpCompare2').value.trim();
  if (!b1 || !b2) { showToast('请提供两段音频'); return; }
  loading.classList.add('show'); result.textContent = '';
  try {
    let fp1, fp2;
    if (b1.length > 64 && b1.includes(':')) {
      fp1 = b1;
    } else {
      const r1 = await fetch(`${API}/api/fingerprint/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wavBase64: b1 }) });
      const d1 = await r1.json();
      fp1 = d1.fingerprint;
    }
    if (b2.length > 64 && b2.includes(':')) {
      fp2 = b2;
    } else {
      const r2 = await fetch(`${API}/api/fingerprint/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wavBase64: b2 }) });
      const d2 = await r2.json();
      fp2 = d2.fingerprint;
    }
    const res = await fetch(`${API}/api/fingerprint/compare`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fp1, fp2 })
    });
    const d = await res.json();
    result.textContent = `相似度: ${(d.similarity * 100).toFixed(2)}%\n汉明距离: ${d.hammingDistance}`;
  } catch (e) { result.textContent = '错误: ' + e.message; }
  loading.classList.remove('show');
}

async function listFingerprintDatabase() {
  const listEl = document.getElementById('fpDatabaseList');
  try {
    const res = await fetch(`${API}/api/fingerprint/database`);
    const d = await res.json();
    if (!d.entries || d.entries.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text2);font-size:12px;">数据库为空</div>';
      return;
    }
    listEl.innerHTML = d.entries.map((e, i) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:rgba(91,77,255,0.05);border-radius:10px;margin-bottom:6px;">
        <div>
          <div style="font-weight:600;font-size:13px;">${escapeHtml(e.metadata?.title || '未命名')}</div>
          <div style="font-size:11px;color:var(--text2);">${escapeHtml(e.metadata?.style || '')} | ${escapeHtml(e.metadata?.createdAt || '')}</div>
          <div style="font-size:10px;color:var(--text3);word-break:break-all;">${escapeHtml(e.fingerprint.slice(0,24))}...</div>
        </div>
      </div>
    `).join('');
  } catch (e) { listEl.innerHTML = '<div style="color:#d44;font-size:12px;">错误: ' + e.message + '</div>'; }
}

async function storeCurrentFingerprint() {
  if (!_currentFingerprint) { showToast('无可用指纹，请先生成音乐或上传音频'); return; }
  const title = document.getElementById('fpStoreTitle').value.trim() || '未命名';
  const style = document.getElementById('fpStoreStyle').value.trim() || '未知';
  try {
    const res = await fetch(`${API}/api/fingerprint/store`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprint: _currentFingerprint, metadata: { title, style, createdAt: new Date().toISOString() } })
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error);
    showToast('指纹已存储');
    listFingerprintDatabase();
  } catch (e) { showToast('存储失败: ' + e.message); }
}

async function searchSimilarFromFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  const loading = document.getElementById('fpSearchLoading');
  const result = document.getElementById('fpSearchResult');
  loading.classList.add('show'); result.textContent = '';
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binStr = '';
    for (let i = 0; i < bytes.length; i++) binStr += String.fromCharCode(bytes[i]);
    const base64 = btoa(binStr);
    const genRes = await fetch(`${API}/api/fingerprint/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wavBase64: base64 })
    });
    const genD = await genRes.json();
    if (genD.error) throw new Error(genD.error);
    const searchRes = await fetch(`${API}/api/fingerprint/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprint: genD.fingerprint })
    });
    const searchD = await searchRes.json();
    renderFpSearchResults(searchD.results);
  } catch (e) { result.textContent = '错误: ' + e.message; }
  loading.classList.remove('show');
  input.value = '';
}

async function searchSimilarCurrent() {
  if (!_currentFingerprint) { showToast('无可用指纹，请先生成音乐或上传音频'); return; }
  const loading = document.getElementById('fpSearchLoading');
  const result = document.getElementById('fpSearchResult');
  loading.classList.add('show'); result.textContent = '';
  try {
    const res = await fetch(`${API}/api/fingerprint/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprint: _currentFingerprint })
    });
    const d = await res.json();
    renderFpSearchResults(d.results);
  } catch (e) { result.textContent = '错误: ' + e.message; }
  loading.classList.remove('show');
}

function renderFpSearchResults(results) {
  const result = document.getElementById('fpSearchResult');
  if (!results || results.length === 0) {
    result.textContent = '未找到相似音乐';
    return;
  }
  result.innerHTML = results.map((r, i) => `
    <div style="padding:8px 10px;background:rgba(91,77,255,0.05);border-radius:10px;margin-bottom:6px;">
      <div style="font-weight:600;font-size:13px;">#${i+1} ${escapeHtml(r.metadata?.title || '未命名')}</div>
      <div style="font-size:11px;color:var(--text2);">相似度: ${(r.similarity*100).toFixed(2)}% | ${escapeHtml(r.metadata?.style || '')}</div>
      <div style="font-size:10px;color:var(--text3);word-break:break-all;">${escapeHtml(r.fingerprint.slice(0,24))}...</div>
    </div>
  `).join('');
}

/* ================= 初始化 ================= */
ensureSession();
renderDrawer();
renderChat();
fetch(`${API}/api/health`).then(r=>r.json()).then(d=>console.log('青鸾DAW 已连接:', d.name, d.version)).catch(()=>console.log('后端未连接'));
checkVoiceSupport();

/* ================= 音乐教育模块 ================= */
const eduAudioCtx = new (window.AudioContext || window.webkitAudioContext)();

function noteToFreq(note) {
  const map = { 'C':0,'C#':1,'Db':1,'D':2,'D#':3,'Eb':3,'E':4,'F':5,'F#':6,'Gb':6,'G':7,'G#':8,'Ab':8,'A':9,'A#':10,'Bb':10,'B':11 };
  const m = note.match(/^([A-G][#b]?)(\d+)$/);
  if (!m) return 440;
  const semi = map[m[1]] || 0;
  const oct = parseInt(m[2], 10);
  return 440 * Math.pow(2, (semi + (oct - 4) * 12 - 9) / 12);
}

function eduPlayTone(freq, duration, type = 'sine', when = 0) {
  const t = when || eduAudioCtx.currentTime;
  const osc = eduAudioCtx.createOscillator();
  const gain = eduAudioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.3, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain);
  gain.connect(eduAudioCtx.destination);
  osc.start(t);
  osc.stop(t + duration);
  return { osc, gain };
}

function eduPlayNote(note, duration, when) {
  eduPlayTone(noteToFreq(note), duration, 'sine', when);
}

function eduPlayNotes(notes, duration, stagger) {
  const d = duration || 0.5;
  const s = stagger || 0;
  const now = eduAudioCtx.currentTime;
  notes.forEach((n, i) => eduPlayNote(n, d, now + i * s));
}

function eduPlayChordNotes(notes, duration) {
  const d = duration || 1;
  const now = eduAudioCtx.currentTime;
  notes.forEach(n => eduPlayNote(n, d, now));
}

function switchEduTab(tab, el) {
  document.querySelectorAll('.edu-tabs span').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.edu-section').forEach(s => s.classList.remove('active'));
  if (el) el.classList.add('active');
  else document.querySelector(`.edu-tabs span[onclick*="'${tab}'"]`).classList.add('active');
  document.getElementById('edu-' + tab).classList.add('active');
}

/* ---- 乐理练习 ---- */
let intScore = 0, intStreak = 0;
let currentInt = null, currentScale = null, currentChord = null;

async function eduIntervalNext() {
  const res = await fetch(`${API}/api/edu/interval`);
  const data = await res.json();
  currentInt = data;
  eduPlayNotes([data.note1, data.note2], 0.6, 0.5);
  const wrap = document.getElementById('intOptions');
  wrap.innerHTML = data.options.map(o => `<button onclick="eduIntervalAnswer('${o}')">${o}</button>`).join('');
  document.getElementById('intResult').textContent = '';
}

function eduIntervalAnswer(ans) {
  if (!currentInt) return;
  const correct = ans === currentInt.correctAnswer;
  const btns = document.querySelectorAll('#intOptions button');
  btns.forEach(b => {
    if (b.textContent === currentInt.correctAnswer) b.classList.add('correct');
    else if (b.textContent === ans) b.classList.add('wrong');
  });
  if (correct) { intScore += 10; intStreak++; }
  else { intStreak = 0; }
  document.getElementById('intScore').textContent = intScore;
  document.getElementById('intStreak').textContent = intStreak;
  document.getElementById('intResult').textContent = correct ? '✅ 正确！' : `❌ 错误，正确答案是 ${currentInt.correctAnswer}`;
}

async function eduScaleNext() {
  const res = await fetch(`${API}/api/edu/scale`);
  const data = await res.json();
  currentScale = data;
  eduPlayNotes(data.notes, 0.4, 0.3);
  const wrap = document.getElementById('scaleOptions');
  wrap.innerHTML = data.options.map(o => `<button onclick="eduScaleAnswer('${o}')">${o}</button>`).join('');
  document.getElementById('scaleResultEdu').textContent = '';
}

function eduScaleAnswer(ans) {
  if (!currentScale) return;
  const correct = ans === currentScale.correctAnswer;
  const btns = document.querySelectorAll('#scaleOptions button');
  btns.forEach(b => {
    if (b.textContent === currentScale.correctAnswer) b.classList.add('correct');
    else if (b.textContent === ans) b.classList.add('wrong');
  });
  document.getElementById('scaleResultEdu').textContent = correct ? '✅ 正确！' : `❌ 错误，正确答案是 ${currentScale.correctAnswer}`;
}

async function eduChordNext() {
  const res = await fetch(`${API}/api/edu/chord`);
  const data = await res.json();
  currentChord = data;
  eduPlayChordNotes(data.notes, 1.2);
  const wrap = document.getElementById('chordOptions');
  wrap.innerHTML = data.options.map(o => `<button onclick="eduChordAnswer('${o}')">${o}</button>`).join('');
  document.getElementById('chordResultEdu').textContent = '';
}

function eduChordAnswer(ans) {
  if (!currentChord) return;
  const correct = ans === currentChord.correctAnswer;
  const btns = document.querySelectorAll('#chordOptions button');
  btns.forEach(b => {
    if (b.textContent === currentChord.correctAnswer) b.classList.add('correct');
    else if (b.textContent === ans) b.classList.add('wrong');
  });
  document.getElementById('chordResultEdu').textContent = correct ? `✅ 正确！构成音: ${currentChord.notes.join(' ')}` : `❌ 错误，正确答案是 ${currentChord.correctAnswer} (${currentChord.notes.join(' ')})`;
}

/* ---- 视唱练耳 ---- */
let singTarget = null;
let micStream = null;
let micAnalyser = null;
let micRaf = null;

function eduSingNext() {
  const notes = ['C4','C#4','D4','D#4','E4','F4','F#4','G4','G#4','A4','A#4','B4'];
  singTarget = notes[Math.floor(Math.random() * notes.length)];
  document.getElementById('singTarget').textContent = singTarget + ' (' + Math.round(noteToFreq(singTarget)) + 'Hz)';
  eduPlayNote(singTarget, 1);
}

async function eduSingStartMic() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('浏览器不支持麦克风'); return;
  }
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const src = eduAudioCtx.createMediaStreamSource(micStream);
    micAnalyser = eduAudioCtx.createAnalyser();
    micAnalyser.fftSize = 2048;
    src.connect(micAnalyser);
    eduSingLoop();
    showToast('已开始收音');
  } catch (e) { showToast('麦克风启动失败'); }
}

function eduSingStopMic() {
  if (micRaf) cancelAnimationFrame(micRaf);
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  micAnalyser = null;
  showToast('已停止收音');
}

function eduSingLoop() {
  if (!micAnalyser) return;
  const buf = new Float32Array(micAnalyser.fftSize);
  micAnalyser.getFloatTimeDomainData(buf);
  const freq = eduDetectPitch(buf, eduAudioCtx.sampleRate);
  if (freq > 0 && singTarget) {
    const targetFreq = noteToFreq(singTarget);
    const cents = 1200 * Math.log2(freq / targetFreq);
    const absCents = Math.abs(cents);
    document.getElementById('singDetected').textContent = Math.round(freq) + 'Hz';
    document.getElementById('singCents').textContent = (cents > 0 ? '+' : '') + Math.round(cents) + '音分';
    const pct = Math.max(0, Math.min(100, 100 - absCents));
    document.getElementById('singBar').style.width = pct + '%';
    if (absCents < 50) {
      document.getElementById('singResult').textContent = '✅ 音准正确！偏差 ' + Math.round(absCents) + ' 音分';
    } else {
      document.getElementById('singResult').textContent = '继续调整... 偏差 ' + Math.round(absCents) + ' 音分';
    }
  }
  micRaf = requestAnimationFrame(eduSingLoop);
}

function eduDetectPitch(buf, sampleRate) {
  // 自相关法检测基频
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;
  let r1 = 0, r2 = SIZE - 1, thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) { if (Math.abs(buf[i]) < thres) { r1 = i; break; } }
  for (let i = 1; i < SIZE / 2; i++) { if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; } }
  const c = new Float32Array(SIZE);
  for (let i = 0; i < SIZE; i++) {
    let sum = 0;
    for (let j = 0; j < SIZE - i; j++) sum += buf[j] * buf[j + i];
    c[i] = sum;
  }
  let d = 0; while (c[d] > c[d + 1]) d++;
  let maxval = -1, maxpos = -1;
  for (let i = d; i < SIZE; i++) {
    if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  }
  let T0 = maxpos;
  // 抛物线插值
  if (T0 > 0 && T0 < SIZE - 1) {
    const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);
  }
  return sampleRate / T0;
}

/* ---- 旋律听写 ---- */
let melodyTarget = [];
let melodyUser = [];

function eduBuildPiano() {
  const wrap = document.getElementById('pianoWrap');
  if (!wrap || wrap.children.length > 0) return;
  const white = ['C4','D4','E4','F4','G4','A4','B4','C5'];
  const blackMap = { 'C#4':0, 'D#4':1, 'F#4':3, 'G#4':4, 'A#4':5 };
  white.forEach((n, i) => {
    const key = document.createElement('div');
    key.className = 'piano-key';
    key.textContent = n;
    key.dataset.note = n;
    key.onclick = () => { eduPlayNote(n, 0.3); melodyUser.push(n); eduMelodyRender(); };
    wrap.appendChild(key);
  });
  Object.keys(blackMap).forEach(n => {
    const idx = blackMap[n];
    const key = document.createElement('div');
    key.className = 'piano-key black';
    key.textContent = n;
    key.dataset.note = n;
    const leftPct = ((idx + 0.7) / white.length) * 100;
    key.style.left = leftPct + '%';
    key.style.width = (80 / white.length) + '%';
    key.onclick = () => { eduPlayNote(n, 0.3); melodyUser.push(n); eduMelodyRender(); };
    wrap.appendChild(key);
  });
}

function eduMelodyRender() {
  const wrap = document.getElementById('melodySeq');
  wrap.innerHTML = melodyUser.map(n => `<span class="melody-note">${n}</span>`).join('');
}

function eduMelodyPlay() {
  const notes = ['C4','D4','E4','F4','G4','A4','B4','C5'];
  const len = 3 + Math.floor(Math.random() * 3);
  melodyTarget = [];
  for (let i = 0; i < len; i++) melodyTarget.push(notes[Math.floor(Math.random() * notes.length)]);
  melodyUser = [];
  eduMelodyRender();
  eduPlayNotes(melodyTarget, 0.4, 0.5);
  document.getElementById('melodyResult').textContent = '';
}

function eduMelodyClear() {
  melodyUser = [];
  eduMelodyRender();
  document.getElementById('melodyResult').textContent = '';
}

function eduMelodyCheck() {
  const correct = melodyUser.length === melodyTarget.length && melodyUser.every((n, i) => n === melodyTarget[i]);
  document.getElementById('melodyResult').textContent = correct ? '✅ 完全正确！' : `❌ 不匹配。正确旋律: ${melodyTarget.join(' ')}`;
}

/* ---- 和弦挑战游戏 ---- */
let gameTimer = null, gameTimeLeft = 60, gameScore = 0, gameActive = false;
let currentGameChord = null;
const RANKS = ['青铜','白银','黄金','铂金','钻石','王者'];
const RANK_THRESHOLDS = [0, 50, 100, 150, 200, 250];

function getRank(score) {
  for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) if (score >= RANK_THRESHOLDS[i]) return RANKS[i];
  return RANKS[0];
}

function getRankProgress(score) {
  for (let i = 0; i < RANK_THRESHOLDS.length; i++) {
    if (score < RANK_THRESHOLDS[i]) {
      const prev = RANK_THRESHOLDS[i - 1] || 0;
      const next = RANK_THRESHOLDS[i];
      return ((score - prev) / (next - prev)) * 100;
    }
  }
  return 100;
}

async function eduGameStart() {
  gameScore = 0; gameTimeLeft = 60; gameActive = true;
  document.getElementById('gameScore').textContent = '0';
  document.getElementById('gameTime').textContent = '60';
  document.getElementById('gameRank').textContent = '青铜';
  document.getElementById('rankFill').style.width = '0%';
  document.getElementById('gameStartBtn').style.display = 'none';
  document.getElementById('gamePlayArea').style.display = 'block';
  document.getElementById('gameResult').textContent = '';
  eduGameNext();
  gameTimer = setInterval(() => {
    gameTimeLeft--;
    document.getElementById('gameTime').textContent = gameTimeLeft;
    if (gameTimeLeft <= 0) eduGameEnd();
  }, 1000);
  eduGameDrawSpectrum();
}

async function eduGameNext() {
  if (!gameActive) return;
  const res = await fetch(`${API}/api/edu/chord`);
  const data = await res.json();
  currentGameChord = data;
  eduPlayChordNotes(data.notes, 1);
  const wrap = document.getElementById('gameOptions');
  wrap.innerHTML = data.options.map(o => `<button onclick="eduGameAnswer('${o}')">${o}</button>`).join('');
}

function eduGamePlayChord() {
  if (currentGameChord) eduPlayChordNotes(currentGameChord.notes, 1);
}

function eduGameAnswer(ans) {
  if (!gameActive || !currentGameChord) return;
  const correct = ans === currentGameChord.correctAnswer;
  const btns = document.querySelectorAll('#gameOptions button');
  btns.forEach(b => {
    if (b.textContent === currentGameChord.correctAnswer) b.classList.add('correct');
    else if (b.textContent === ans) b.classList.add('wrong');
  });
  if (correct) {
    gameScore += 10;
    document.getElementById('gameScore').textContent = gameScore;
    const rank = getRank(gameScore);
    document.getElementById('gameRank').textContent = rank;
    document.getElementById('rankFill').style.width = getRankProgress(gameScore) + '%';
  }
  setTimeout(() => eduGameNext(), 600);
}

function eduGameEnd() {
  gameActive = false;
  clearInterval(gameTimer);
  document.getElementById('gameStartBtn').style.display = 'inline-block';
  document.getElementById('gamePlayArea').style.display = 'none';
  const rank = getRank(gameScore);
  document.getElementById('gameResult').textContent = `时间到！得分: ${gameScore} | 段位: ${rank}`;
  // 本地最高分
  const key = 'edu_highscore_chord';
  const prev = parseInt(localStorage.getItem(key) || '0', 10);
  if (gameScore > prev) localStorage.setItem(key, String(gameScore));
  // 提交到后端
  eduSaveScore('chord', gameScore, rank);
}

async function eduSaveScore(game, score, level) {
  try {
    await fetch(`${API}/api/edu/score`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game, score, level })
    });
  } catch (e) {}
}

async function eduLoadLeaderboard() {
  try {
    const res = await fetch(`${API}/api/edu/leaderboard?game=chord`);
    const data = await res.json();
    const wrap = document.getElementById('eduLeaderboard');
    if (!data.leaderboard || data.leaderboard.length === 0) {
      wrap.innerHTML = '<div style="color:var(--text2)">暂无数据</div>'; return;
    }
    wrap.innerHTML = data.leaderboard.map((e, i) =>
      `<div style="display:flex;justify-content:space-between;padding:6px 8px;background:rgba(0,0,0,0.03);border-radius:8px;margin-bottom:4px;">
        <span>#${i+1} ${e.level}</span><span style="font-weight:700;color:var(--accent)">${e.score}分</span>
      </div>`
    ).join('');
  } catch (e) { showToast('加载排行榜失败'); }
}

function eduGameDrawSpectrum() {
  const canvas = document.getElementById('gameSpectrum');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  if (!gameActive) { ctx.clearRect(0,0,w,h); return; }
  requestAnimationFrame(eduGameDrawSpectrum);
  ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0,0,w,h);
  // 模拟频谱条
  const bars = 32;
  const bw = w / bars;
  for (let i = 0; i < bars; i++) {
    const height = Math.random() * h * 0.8;
    const hue = 200 + (i / bars) * 160;
    ctx.fillStyle = `hsla(${hue}, 80%, 60%, 0.8)`;
    ctx.fillRect(i * bw, h - height, bw - 1, height);
  }
}

/* 初始化虚拟钢琴 */
eduBuildPiano();

// 非传统引擎面板切换
function toggleNtPanel() {
  const engine = document.getElementById('ntEngine').value;
  const map = { selfmodifying: 'ntSelfModifying', chemical: 'ntChemical', topological: 'ntTopological', cellular: 'ntCellular', consciousness: 'ntConsciousness' };
  ['ntSelfModifying','ntChemical','ntTopological','ntCellular','ntConsciousness'].forEach(id => {
    document.getElementById(id).style.display = id === map[engine] ? 'block' : 'none';
  });
}

// 运行单个非传统引擎
async function runNonTraditional() {
  const engine = document.getElementById('ntEngine').value;
  const loading = document.getElementById('ntLoading');
  const resultEl = document.getElementById('ntResult');
  const playerEl = document.getElementById('ntPlayer');
  loading.style.display = 'flex';
  resultEl.textContent = '';
  playerEl.innerHTML = '';
  
  try {
    let endpoint = '/api/engine/' + engine;
    let body = {};
    
    if (engine === 'selfmodifying') {
      body = { freq: +document.getElementById('smFreq').value, duration: +document.getElementById('smDuration').value, evolutionRate: +document.getElementById('smRate').value, mutationIntensity: +document.getElementById('smIntensity').value };
    } else if (engine === 'chemical') {
      const key = document.getElementById('chemKey').value;
      const keyMap = {C:60,G:67,Am:69,F:65}; // 简化映射
      body = { style: document.getElementById('chemStyle').value, keyRoot: keyMap[key]||60, barCount: +document.getElementById('chemBars').value, bpm: +document.getElementById('chemBpm').value, temperature: +document.getElementById('chemTemp').value };
    } else if (engine === 'topological') {
      const key = document.getElementById('topoKey').value;
      const keyMap = {C:60,Am:69,G:67,F:65};
      body = { keyRoot: keyMap[key]||60, barCount: +document.getElementById('topoBars').value, bpm: +document.getElementById('topoBpm').value, curvature: +document.getElementById('topoCurve').value };
    } else if (engine === 'cellular') {
      const key = document.getElementById('caKey').value;
      const keyMap = {C:60,G:67,Am:69,F:65};
      body = { keyRoot: keyMap[key]||60, barCount: +document.getElementById('caBars').value, bpm: +document.getElementById('caBpm').value, seedDensity: +document.getElementById('caSeed').value, generations: +document.getElementById('caGen').value };
    } else if (engine === 'consciousness') {
      body = { theme: document.getElementById('scTheme').value, bpm: +document.getElementById('scBpm').value, bars: +document.getElementById('scBars').value, temperature: +document.getElementById('scTemp').value };
    }
    
    const res = await fetch(endpoint, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    
    if (data.wavBase64) {
      playerEl.innerHTML = '<audio controls style="width:100%;margin-top:8px;" src="data:audio/wav;base64,' + data.wavBase64 + '"></audio>';
    }
    resultEl.textContent = JSON.stringify(data, null, 2).replace(/wavBase64.*\n/g, '');
  } catch (e) {
    resultEl.textContent = '错误: ' + e.message;
  } finally {
    loading.style.display = 'none';
  }
}

// 非传统生产线（调用 /api/produce）
async function runNtProduction() {
  const engine = document.getElementById('ntProdEngine').value;
  const loading = document.getElementById('ntProdLoading');
  const resultEl = document.getElementById('ntProdResult');
  const playerEl = document.getElementById('ntProdPlayer');
  loading.style.display = 'flex';
  resultEl.textContent = '';
  playerEl.innerHTML = '';
  
  try {
    const key = document.getElementById('ntProdKey').value;
    const body = {
      style: document.getElementById('ntProdStyle').value,
      key: key,
      bpm: +document.getElementById('ntProdBpm').value,
      barCount: +document.getElementById('ntProdBars').value,
      nonTraditionalEngine: engine,
      emotion: 'happy',
      useAutoMix: true,
      usePhraseStructure: document.getElementById('ntUsePhrase')?.checked || false,
      useHumanization: document.getElementById('ntUseHumanize')?.checked || false,
      useAnalogFeel: document.getElementById('ntUseAnalog')?.checked || false,
      analogIntensity: (+document.getElementById('ntAnalogSlider')?.value || 40) / 100,
      useSpatialReverb: document.getElementById('ntSpatialPreset').value !== 'none',
      spatialPreset: document.getElementById('ntSpatialPreset').value,
      useWatermark: document.getElementById('ntUseWatermark')?.checked || false,
      creatorId: document.getElementById('ntCreatorId')?.value || 'qingluan-user',
      useHumanFeelEnhance: document.getElementById('ntUseHumanFeel')?.checked || false,
      humanFeelIntensity: (+document.getElementById('ntHumanFeelSlider')?.value || 50) / 100,
    };
    
    const res = await fetch('/api/produce', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    
    if (data.wavBase64) {
      playerEl.innerHTML = '<audio controls style="width:100%;margin-top:8px;" src="data:audio/wav;base64,' + data.wavBase64 + '"></audio>';
    }
    resultEl.textContent = JSON.stringify(data, null, 2).replace(/wavBase64.*\n/g, '');
  } catch (e) {
    resultEl.textContent = '错误: ' + e.message;
  } finally {
    loading.style.display = 'none';
  }
}

async function runSpatialOriginality() {
  const loading = document.getElementById('ntSpatialLoading');
  const resultEl = document.getElementById('ntSpatialResult');
  loading.style.display = 'flex';
  resultEl.textContent = '';
  
  try {
    const res = await fetch('/api/spatial/presets');
    const data = await res.json();
    resultEl.textContent = '可用空间预设: ' + (data.presets || []).join(', ');
  } catch (e) {
    resultEl.textContent = '错误: ' + e.message;
  } finally {
    loading.style.display = 'none';
  }
}

// 声带实验室
function updateVfParams() {
  const preset = document.getElementById('vfPreset').value;
  const defaults = {
    male: { length: 15, thickness: 3, tension: 50, pressure: 80, mucosal: 30 },
    female: { length: 12, thickness: 2.5, tension: 60, pressure: 70, mucosal: 25 },
    child: { length: 10, thickness: 2, tension: 40, pressure: 60, mucosal: 35 },
    falsetto: { length: 14, thickness: 2, tension: 85, pressure: 50, mucosal: 20 },
    fry: { length: 16, thickness: 3.5, tension: 20, pressure: 30, mucosal: 40 },
    whistle: { length: 11, thickness: 1.5, tension: 95, pressure: 90, mucosal: 15 },
    growl: { length: 15, thickness: 3, tension: 75, pressure: 100, mucosal: 35 },
    breathy: { length: 13, thickness: 2.5, tension: 35, pressure: 90, mucosal: 20 },
  };
  const d = defaults[preset] || defaults.male;
  document.getElementById('vfLength').value = d.length;
  document.getElementById('vfLengthVal').textContent = d.length;
  document.getElementById('vfThickness').value = d.thickness;
  document.getElementById('vfThicknessVal').textContent = d.thickness;
  document.getElementById('vfTension').value = d.tension;
  document.getElementById('vfTensionVal').textContent = d.tension;
  document.getElementById('vfPressure').value = d.pressure;
  document.getElementById('vfPressureVal').textContent = d.pressure;
  document.getElementById('vfMucosal').value = d.mucosal;
  document.getElementById('vfMucosalVal').textContent = d.mucosal;
}

async function generateVocalFold() {
  const loading = document.getElementById('vfLoading');
  const resultEl = document.getElementById('vfResult');
  const playerEl = document.getElementById('vfPlayer');
  loading.style.display = 'flex';
  resultEl.textContent = '';
  playerEl.innerHTML = '';
  
  try {
    const res = await fetch('/api/vocalfold/generate', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        preset: document.getElementById('vfPreset').value,
        pitch: +document.getElementById('vfPitch').value,
        duration: +document.getElementById('vfDuration').value,
        params: {
          length: +document.getElementById('vfLength').value,
          thickness: +document.getElementById('vfThickness').value,
          tension: +document.getElementById('vfTension').value / 100,
          subglottalPressure: +document.getElementById('vfPressure').value / 100,
          mucosalMassRatio: +document.getElementById('vfMucosal').value / 100,
        }
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    
    if (data.wavBase64) {
      playerEl.innerHTML = '<audio controls style="width:100%;margin-top:8px;" src="data:audio/wav;base64,' + data.wavBase64 + '"></audio>';
    }
    resultEl.textContent = '预设: ' + data.preset + '\n时长: ' + data.duration.toFixed(2) + '秒';
  } catch (e) {
    resultEl.textContent = '错误: ' + e.message;
  } finally {
    loading.style.display = 'none';
  }
}

async function singWithVocalFold() {
  const loading = document.getElementById('vfSingLoading');
  const resultEl = document.getElementById('vfSingResult');
  const playerEl = document.getElementById('vfSingPlayer');
  loading.style.display = 'flex';
  resultEl.textContent = '';
  playerEl.innerHTML = '';
  
  try {
    const notesStr = document.getElementById('vfSingNotes').value;
    const noteValues = notesStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    const duration = +document.getElementById('vfSingDuration').value;
    
    const res = await fetch('/api/vocalfold/singing', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        preset: document.getElementById('vfSingPreset').value,
        notes: noteValues.map(midi => ({midi, duration}))
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    
    if (data.wavBase64) {
      playerEl.innerHTML = '<audio controls style="width:100%;margin-top:8px;" src="data:audio/wav;base64,' + data.wavBase64 + '"></audio>';
    }
    resultEl.textContent = '时长: ' + data.duration.toFixed(2) + '秒';
  } catch (e) {
    resultEl.textContent = '错误: ' + e.message;
  } finally {
    loading.style.display = 'none';
  }
}

/* ============================================================
   青鸾 DAW — 前端 UI 扩展模块（约4000行）
   包含：PianoRoll、Waveform、Analyzer、Metronome、Tuner、
   Theme、KeyboardShortcuts、Undo/Redo、Toast、DragDrop、
   ContextMenu、Loading、Modal、Tooltip、Scroll动画、Counter动画
   ============================================================ */

/* ================= PianoRoll 钢琴卷帘渲染 ================= */

const PianoRollDefaults = {
  gridColor: 'rgba(0,0,0,0.06)',
  beatColor: 'rgba(0,0,0,0.12)',
  barColor: 'rgba(0,0,0,0.2)',
  noteColor: 'rgba(91,77,255,0.85)',
  noteBorder: 'rgba(91,77,255,1)',
  playheadColor: '#ff6b9d',
  whiteKeyColor: '#fff',
  blackKeyColor: '#1a1a1a',
  blackKeyWidth: 0.65,
  rowHeight: 16,
  keyWidth: 48,
  pixelsPerBeat: 40,
  minNote: 36,
  maxNote: 96
};

function renderPianoRoll(notes, options = {}) {
  const opts = { ...PianoRollDefaults, ...options };
  const canvasId = opts.canvasId || 'pianoRollCanvas';
  let canvas = document.getElementById(canvasId);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = canvasId;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    const container = opts.container || document.getElementById('studio') || document.body;
    if (container) container.appendChild(canvas);
  }

  const totalBeats = opts.totalBeats || Math.max(16, ...notes.map(n => (n.offset || 0) + (n.duration || 0.5)));
  const noteRange = opts.maxNote - opts.minNote + 1;
  const w = opts.width || canvas.clientWidth || 800;
  const h = opts.height || canvas.clientHeight || noteRange * opts.rowHeight;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 背景
  ctx.fillStyle = opts.bgColor || 'transparent';
  ctx.fillRect(0, 0, w, h);

  const keyW = opts.keyWidth;
  const drawW = w - keyW;
  const beatW = opts.pixelsPerBeat;
  const rowH = opts.rowHeight;

  // 钢琴键区域背景
  ctx.fillStyle = opts.whiteKeyColor;
  ctx.fillRect(0, 0, keyW, h);
  ctx.strokeStyle = opts.gridColor;
  ctx.beginPath();
  ctx.moveTo(keyW, 0);
  ctx.lineTo(keyW, h);
  ctx.stroke();

  // 绘制钢琴键
  const blackKeys = new Set([1,3,6,8,10]);
  for (let n = opts.maxNote; n >= opts.minNote; n--) {
    const row = opts.maxNote - n;
    const y = row * rowH;
    const semitone = n % 12;
    const isBlack = blackKeys.has(semitone);
    if (isBlack) {
      ctx.fillStyle = opts.blackKeyColor;
      ctx.fillRect(0, y, keyW * opts.blackKeyWidth, rowH);
    } else {
      ctx.fillStyle = opts.whiteKeyColor;
      ctx.fillRect(0, y, keyW, rowH);
    }
    ctx.strokeStyle = opts.gridColor;
    ctx.strokeRect(0, y, keyW, rowH);
    // 音符标签
    if (!isBlack && (n % 12 === 0 || n === opts.maxNote || n === opts.minNote)) {
      ctx.fillStyle = isBlack ? '#fff' : '#333';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
      const octave = Math.floor(n / 12) - 1;
      ctx.fillText(names[semitone] + octave, 4, y + rowH / 2);
    }
  }

  // 网格线（竖线）
  ctx.strokeStyle = opts.gridColor;
  ctx.lineWidth = 0.5;
  const totalBars = Math.ceil(totalBeats / 4);
  for (let b = 0; b <= totalBeats * 4; b++) {
    const x = keyW + (b / 4) * beatW;
    if (x > w) break;
    const isBar = b % 16 === 0;
    const isBeat = b % 4 === 0;
    ctx.strokeStyle = isBar ? opts.barColor : (isBeat ? opts.beatColor : opts.gridColor);
    ctx.lineWidth = isBar ? 1.5 : (isBeat ? 0.8 : 0.4);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // 网格线（横线）
  for (let row = 0; row <= noteRange; row++) {
    const y = row * rowH;
    ctx.strokeStyle = opts.gridColor;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(keyW, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // 绘制音符块
  notes.forEach(note => {
    const pitch = note.pitch || note.midi || 60;
    if (pitch < opts.minNote || pitch > opts.maxNote) return;
    const dur = note.duration || 0.5;
    const offset = note.offset || 0;
    const row = opts.maxNote - pitch;
    const x = keyW + offset * beatW;
    const y = row * rowH + 1;
    const nw = Math.max(2, dur * beatW - 2);
    const nh = rowH - 2;
    ctx.fillStyle = note.color || opts.noteColor;
    ctx.strokeStyle = note.border || opts.noteBorder;
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, nw, nh, 3);
    ctx.fill();
    ctx.stroke();
    // 音符文字
    if (nw > 20 && opts.showNoteLabels !== false) {
      ctx.fillStyle = '#fff';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((note.name || pitch), x + nw / 2, y + nh / 2);
    }
  });

  // 播放头
  if (opts.playhead !== undefined && opts.playhead >= 0) {
    const px = keyW + opts.playhead * beatW;
    ctx.strokeStyle = opts.playheadColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
    // 播放头三角
    ctx.fillStyle = opts.playheadColor;
    ctx.beginPath();
    ctx.moveTo(px - 5, 0);
    ctx.lineTo(px + 5, 0);
    ctx.lineTo(px, 6);
    ctx.fill();
  }

  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/* ================= Waveform 波形渲染 ================= */

function renderWaveform(buffer, canvasId) {
  let canvas = document.getElementById(canvasId);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = canvasId;
    canvas.style.width = '100%';
    canvas.style.height = '120px';
    canvas.style.display = 'block';
    document.body.appendChild(canvas);
  }
  const w = canvas.clientWidth || 800;
  const h = canvas.clientHeight || 120;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'transparent';
  ctx.fillRect(0, 0, w, h);

  const ch = buffer.numberOfChannels || 1;
  const data = buffer.getChannelData ? buffer.getChannelData(0) : (Array.isArray(buffer) ? buffer : []);
  if (!data.length) return canvas;

  const step = Math.ceil(data.length / w);
  const amp = h / 2;
  const centerY = h / 2;

  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5b4dff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    const start = x * step;
    const end = Math.min(start + step, data.length);
    let min = Infinity, max = -Infinity;
    for (let i = start; i < end; i++) {
      const v = data[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min === Infinity) { min = 0; max = 0; }
    ctx.moveTo(x, centerY + min * amp);
    ctx.lineTo(x, centerY + max * amp);
  }
  ctx.stroke();

  // 中心线
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(w, centerY);
  ctx.stroke();

  return canvas;
}

/* ================= Analyzer 频谱 & 语谱图 ================= */

function renderSpectrum(spectrum, canvasId) {
  let canvas = document.getElementById(canvasId);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = canvasId;
    canvas.style.width = '100%';
    canvas.style.height = '120px';
    document.body.appendChild(canvas);
  }
  const w = canvas.clientWidth || 800;
  const h = canvas.clientHeight || 120;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const barCount = spectrum.length || 64;
  const barW = w / barCount;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5b4dff';

  for (let i = 0; i < barCount; i++) {
    const value = spectrum[i] || 0;
    const height = Math.max(2, value * h);
    const hue = 240 + (i / barCount) * 120;
    ctx.fillStyle = `hsla(${hue}, 80%, 60%, 0.85)`;
    ctx.fillRect(i * barW, h - height, barW - 1, height);
  }
  return canvas;
}

function renderSpectrogram(data, canvasId) {
  let canvas = document.getElementById(canvasId);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = canvasId;
    canvas.style.width = '100%';
    canvas.style.height = '160px';
    document.body.appendChild(canvas);
  }
  const w = canvas.clientWidth || 800;
  const h = canvas.clientHeight || 160;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // data: 二维数组 [time][freq]
  const timeSteps = data.length || 1;
  const freqs = (data[0] && data[0].length) || 64;
  const cellW = w / timeSteps;
  const cellH = h / freqs;

  for (let t = 0; t < timeSteps; t++) {
    const frame = data[t] || [];
    for (let f = 0; f < freqs; f++) {
      const val = frame[f] || 0;
      const intensity = Math.min(1, val);
      const hue = 240 - intensity * 240;
      const lightness = intensity * 60;
      ctx.fillStyle = `hsla(${hue}, 90%, ${lightness}%, 1)`;
      ctx.fillRect(t * cellW, h - (f + 1) * cellH, cellW + 0.5, cellH + 0.5);
    }
  }
  return canvas;
}

/* ================= Metronome 节拍器 ================= */

class Metronome {
  constructor() {
    this.ctx = null;
    this.bpm = 120;
    this.nextNoteTime = 0;
    this.beatCount = 0;
    this.isRunning = false;
    this.lookahead = 25.0;
    this.scheduleAheadTime = 0.1;
    this.timerID = null;
    this.tickCallbacks = [];
  }

  initAudio() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  scheduleNote(beatNumber, time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    const isAccent = beatNumber % 4 === 0;
    osc.frequency.value = isAccent ? 1000 : 800;
    gain.gain.setValueAtTime(isAccent ? 0.5 : 0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.start(time);
    osc.stop(time + 0.05);

    this.tickCallbacks.forEach(cb => {
      try { cb(beatNumber, time, isAccent); } catch (e) {}
    });
  }

  scheduler() {
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.beatCount, this.nextNoteTime);
      this.beatCount++;
      this.nextNoteTime += 60.0 / this.bpm;
    }
  }

  start(bpm = 120) {
    this.initAudio();
    this.bpm = bpm;
    this.isRunning = true;
    this.beatCount = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.timerID = setInterval(() => this.scheduler(), this.lookahead);
    showToast('节拍器已启动 ' + bpm + ' BPM', 'info');
  }

  stop() {
    this.isRunning = false;
    if (this.timerID) clearInterval(this.timerID);
    this.timerID = null;
    showToast('节拍器已停止', 'info');
  }

  onTick(cb) {
    this.tickCallbacks.push(cb);
  }
}

const _metronome = new Metronome();

function startMetronome(bpm) {
  const bpmVal = bpm || parseInt(document.getElementById('bpm')?.value) || 120;
  _metronome.start(bpmVal);
}
function stopMetronome() { _metronome.stop(); }

let _tapTimes = [];
function tapTempo() {
  const now = Date.now();
  _tapTimes.push(now);
  if (_tapTimes.length > 8) _tapTimes.shift();
  if (_tapTimes.length >= 2) {
    const intervals = [];
    for (let i = 1; i < _tapTimes.length; i++) intervals.push(_tapTimes[i] - _tapTimes[i - 1]);
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const bpm = Math.round(60000 / avg);
    const bpmEl = document.getElementById('bpm');
    if (bpmEl) bpmEl.value = Math.max(40, Math.min(240, bpm));
    showToast('估算 BPM: ' + bpm, 'info');
  } else {
    showToast('再按几次以估算 BPM', 'info');
  }
}

/* ================= Tuner 调音器 ================= */

class Tuner {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.isRunning = false;
    this.rafId = null;
    this.centCallbacks = [];
  }

  async start() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.source = this.ctx.createMediaStreamSource(stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.source.connect(this.analyser);
      this.isRunning = true;
      this._detectLoop();
      showToast('调音器已启动', 'info');
    } catch (e) {
      showToast('无法启动麦克风: ' + e.message, 'error');
    }
  }

  stop() {
    this.isRunning = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.source) { try { this.source.disconnect(); } catch (e) {} }
    if (this.ctx) { try { this.ctx.close(); } catch (e) {} }
    this.ctx = null;
    this.source = null;
    this.analyser = null;
    showToast('调音器已停止', 'info');
  }

  _detectLoop() {
    if (!this.isRunning) return;
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    const freq = this._autoCorrelate(buf, this.ctx.sampleRate);
    if (freq > 0) {
      const note = this._freqToNote(freq);
      this.centCallbacks.forEach(cb => {
        try { cb(note.name, note.cents, freq); } catch (e) {}
      });
    }
    this.rafId = requestAnimationFrame(() => this._detectLoop());
  }

  _autoCorrelate(buf, sampleRate) {
    let SIZE = buf.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;
    let r1 = 0, r2 = SIZE - 1;
    const thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    buf = buf.slice(r1, r2);
    SIZE = buf.length;
    const c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j < SIZE - i; j++) c[i] += buf[j] * buf[j + i];
    }
    let d = 0;
    while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) {
      if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    }
    let T0 = maxpos;
    const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);
    return sampleRate / T0;
  }

  _freqToNote(freq) {
    const A4 = 440;
    const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const semitones = 12 * Math.log2(freq / A4);
    const midi = Math.round(69 + semitones);
    const cents = Math.round((semitones - Math.round(semitones)) * 100);
    const name = noteNames[midi % 12] + (Math.floor(midi / 12) - 1);
    return { name, cents, midi, freq };
  }

  onUpdate(cb) { this.centCallbacks.push(cb); }
}

const _tuner = new Tuner();

function startTuner() { _tuner.start(); }
function stopTuner() { _tuner.stop(); }

/* ================= Theme 主题切换 ================= */

const ThemePresets = {
  light: {
    '--phone-bg': '#f5f5f0',
    '--text': '#1a1a1a',
    '--text2': '#555',
    '--text3': '#888',
    '--accent': '#5b4dff',
    '--accent2': '#ff6b9d',
    '--bubble-user': '#5b4dff',
    '--bubble-ai': '#f0f0f5',
    '--card-bg': '#fff',
    '--border': 'rgba(0,0,0,0.06)',
    '--pink-bg': '#f5f5f0',
    '--black-card': '#1a1a1a'
  },
  dark: {
    '--phone-bg': '#0f0f13',
    '--text': '#e8e8ec',
    '--text2': '#a0a0a8',
    '--text3': '#707078',
    '--accent': '#8b7dff',
    '--accent2': '#ff8bb5',
    '--bubble-user': '#8b7dff',
    '--bubble-ai': '#1e1e28',
    '--card-bg': '#1a1a22',
    '--border': 'rgba(255,255,255,0.08)',
    '--pink-bg': '#12121a',
    '--black-card': '#252530'
  },
  geek: {
    '--phone-bg': '#0a0a0a',
    '--text': '#00ff41',
    '--text2': '#00cc33',
    '--text3': '#009922',
    '--accent': '#00ff41',
    '--accent2': '#00ff88',
    '--bubble-user': '#00ff41',
    '--bubble-ai': '#0f1f0f',
    '--card-bg': '#0f0f0f',
    '--border': 'rgba(0,255,65,0.15)',
    '--pink-bg': '#080808',
    '--black-card': '#111111'
  },
  paper: {
    '--phone-bg': '#f0e8d8',
    '--text': '#3a3020',
    '--text2': '#6a6050',
    '--text3': '#9a9080',
    '--accent': '#8b4513',
    '--accent2': '#cd853f',
    '--bubble-user': '#8b4513',
    '--bubble-ai': '#e8e0d0',
    '--card-bg': '#faf6f0',
    '--border': 'rgba(60,40,20,0.08)',
    '--pink-bg': '#f0e8d8',
    '--black-card': '#3a3020'
  }
};

function applyTheme(themeName) {
  const preset = ThemePresets[themeName];
  if (!preset) {
    showToast('未知主题: ' + themeName, 'error');
    return;
  }
  const root = document.documentElement;
  Object.entries(preset).forEach(([k, v]) => root.style.setProperty(k, v));
  localStorage.setItem('qingluan_theme', themeName);
  animateThemeTransition();
  showToast('主题已切换: ' + themeName, 'success');
}

function animateThemeTransition() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;background:var(--accent);opacity:0;transition:opacity 0.3s;';
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '0.15'; });
  setTimeout(() => { overlay.style.opacity = '0'; }, 150);
  setTimeout(() => { overlay.remove(); }, 500);
}

function initTheme() {
  const saved = localStorage.getItem('qingluan_theme');
  if (saved && ThemePresets[saved]) applyTheme(saved);
}
initTheme();

/* ================= KeyboardShortcuts 快捷键 ================= */

const _shortcutRegistry = new Map();
let _shortcutsEnabled = true;
let _shortcutContext = 'global';
let _shortcutSequence = [];
let _shortcutSequenceTimer = null;

function registerShortcut(keyCombo, callback, options = {}) {
  const ctx = options.context || 'global';
  if (!_shortcutRegistry.has(ctx)) _shortcutRegistry.set(ctx, new Map());
  _shortcutRegistry.get(ctx).set(keyCombo.toLowerCase().trim(), { callback, options });
}

function unregisterShortcut(keyCombo, context = 'global') {
  const map = _shortcutRegistry.get(context);
  if (map) map.delete(keyCombo.toLowerCase().trim());
}

function enableShortcuts() { _shortcutsEnabled = true; }
function disableShortcuts() { _shortcutsEnabled = false; }
function setShortcutContext(ctx) { _shortcutContext = ctx; }

function _matchShortcut(e, combo) {
  const parts = combo.split('+').map(s => s.trim().toLowerCase());
  const key = parts.pop();
  const ctrl = parts.includes('ctrl') || parts.includes('control');
  const shift = parts.includes('shift');
  const alt = parts.includes('alt');
  const meta = parts.includes('meta') || parts.includes('cmd') || parts.includes('command');
  return (
    e.key.toLowerCase() === key &&
    e.ctrlKey === ctrl &&
    e.shiftKey === shift &&
    e.altKey === alt &&
    e.metaKey === meta
  );
}

document.addEventListener('keydown', (e) => {
  if (!_shortcutsEnabled) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) {
    // 允许在输入框中的特定快捷键
    if (!e.ctrlKey && !e.metaKey) return;
  }

  const contexts = ['global', _shortcutContext];
  for (const ctx of contexts) {
    const map = _shortcutRegistry.get(ctx);
    if (!map) continue;
    for (const [combo, item] of map) {
      if (_matchShortcut(e, combo)) {
        e.preventDefault();
        try { item.callback(e); } catch (err) { console.error('快捷键错误:', err); }
        return;
      }
    }
  }

  // 内置默认行为
  if (e.key === ' ' && tag !== 'input' && tag !== 'textarea') {
    e.preventDefault();
    togglePlayback && togglePlayback();
  }
  if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    const tabs = Array.from(document.querySelectorAll('.studio-tab'));
    const idx = parseInt(e.key) - 1;
    if (tabs[idx]) {
      tabs[idx].click();
      showToast('切换到: ' + tabs[idx].textContent, 'info');
    }
  }
});

// 注册默认快捷键
function _initDefaultShortcuts() {
  registerShortcut('ctrl+z', () => { if (window.actionHistory) window.actionHistory.undo(); });
  registerShortcut('ctrl+shift+z', () => { if (window.actionHistory) window.actionHistory.redo(); });
  registerShortcut('ctrl+s', (e) => { e.preventDefault(); saveProject(); showToast('保存项目', 'success'); });
  registerShortcut('ctrl+e', (e) => { e.preventDefault(); exportProject(); showToast('导出项目', 'success'); });
  registerShortcut('ctrl+o', (e) => { e.preventDefault(); showToast('请使用导入按钮打开文件', 'info'); });
  registerShortcut('ctrl+n', (e) => { e.preventDefault(); newSession(); });
  registerShortcut('ctrl+x', () => { showToast('剪切', 'info'); });
  registerShortcut('ctrl+c', () => { showToast('复制', 'info'); });
  registerShortcut('ctrl+v', () => { showToast('粘贴', 'info'); });
  registerShortcut('delete', () => { showToast('删除', 'info'); });
  registerShortcut('ctrl+b', () => { toggleDrawer(); });
  registerShortcut('ctrl+f', () => { showToast('搜索功能开发中', 'info'); });
  registerShortcut('escape', () => { closeAll(); });
  registerShortcut('ctrl+m', () => { startMetronome(); });
  registerShortcut('ctrl+t', () => { startTuner(); });
  registerShortcut('ctrl+r', () => { showToast('录音功能开发中', 'info'); });
  registerShortcut('ctrl+l', () => { showToast('循环功能开发中', 'info'); });
  registerShortcut('home', () => { showToast('回到开头', 'info'); });
  registerShortcut('end', () => { showToast('跳到结尾', 'info'); });
  registerShortcut('ctrl+arrowleft', () => { showToast('后退', 'info'); });
  registerShortcut('ctrl+arrowright', () => { showToast('前进', 'info'); });
  registerShortcut('tab', (e) => {
    const inputs = Array.from(document.querySelectorAll('input, select, textarea, button'));
    const idx = inputs.indexOf(document.activeElement);
    if (idx >= 0 && idx < inputs.length - 1) {
      e.preventDefault();
      inputs[idx + 1].focus();
    }
  });
  registerShortcut('shift+tab', (e) => {
    const inputs = Array.from(document.querySelectorAll('input, select, textarea, button'));
    const idx = inputs.indexOf(document.activeElement);
    if (idx > 0) {
      e.preventDefault();
      inputs[idx - 1].focus();
    }
  });
}
_initDefaultShortcuts();

/* ================= Undo/Redo 系统 ================= */

class ActionHistory {
  constructor(limit = 200) {
    this.stack = [];
    this.redoStack = [];
    this.limit = limit;
    this.listeners = [];
  }

  push(action) {
    if (!action || typeof action.do !== 'function') {
      console.warn('Action 必须有 do 方法');
      return;
    }
    action.do();
    this.stack.push(action);
    if (this.stack.length > this.limit) this.stack.shift();
    this.redoStack = [];
    this._notify();
  }

  undo() {
    const action = this.stack.pop();
    if (!action) { showToast('没有可撤销的操作', 'warning'); return false; }
    if (typeof action.undo === 'function') action.undo();
    this.redoStack.push(action);
    this._notify();
    showToast('已撤销', 'info');
    return true;
  }

  redo() {
    const action = this.redoStack.pop();
    if (!action) { showToast('没有可重做的操作', 'warning'); return false; }
    if (typeof action.do === 'function') action.do();
    this.stack.push(action);
    this._notify();
    showToast('已重做', 'info');
    return true;
  }

  canUndo() { return this.stack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }
  clear() { this.stack = []; this.redoStack = []; this._notify(); }

  onChange(cb) { this.listeners.push(cb); }
  _notify() {
    this.listeners.forEach(cb => {
      try { cb(this.canUndo(), this.canRedo()); } catch (e) {}
    });
  }

  // 便捷包装
  record(doFn, undoFn, meta = {}) {
    this.push({ do: doFn, undo: undoFn, meta });
  }

  snapshotState(getter, setter, label = '操作') {
    const before = JSON.stringify(getter());
    return {
      commit: () => {
        const after = JSON.stringify(getter());
        this.record(
          () => { /* already applied */ },
          () => { setter(JSON.parse(before)); },
          { label, before, after }
        );
      }
    };
  }
}

window.actionHistory = new ActionHistory();

/* ================= Toast 通知增强 ================= */

const _toastQueue = [];
let _toastProcessing = false;

function _processToastQueue() {
  if (_toastProcessing || !_toastQueue.length) return;
  _toastProcessing = true;
  const { message, type, duration } = _toastQueue.shift();
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(20px);padding:10px 18px;border-radius:24px;font-size:13px;color:#fff;background:rgba(30,30,30,0.88);backdrop-filter:blur(8px);opacity:0;transition:all 0.35s cubic-bezier(0.16,1,0.3,1);z-index:10000;pointer-events:none;white-space:nowrap;';
    document.body.appendChild(el);
  }

  const colors = {
    success: '#2ecc71',
    error: '#e74c3c',
    warning: '#f39c12',
    info: '#3498db'
  };
  el.style.background = colors[type] || 'rgba(30,30,30,0.88)';
  el.textContent = message;
  el.style.opacity = '1';
  el.style.transform = 'translateX(-50%) translateY(0)';

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => {
      _toastProcessing = false;
      _processToastQueue();
    }, 350);
  }, duration || 2000);
}

// 覆盖原有 showToast
showToast = function(message, type = 'info', duration) {
  _toastQueue.push({ message, type, duration });
  _processToastQueue();
};

/* ================= Drag and Drop 文件拖拽导入 ================= */

function initDragDrop() {
  const zones = [
    document.getElementById('chatList'),
    document.getElementById('studio'),
    document.body
  ];

  zones.forEach(zone => {
    if (!zone) return;
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files);
      if (!files.length) return;
      files.forEach(file => handleDroppedFile(file));
    });
  });

  // 添加拖拽高亮样式
  const style = document.createElement('style');
  style.textContent = `.drag-over { outline: 2px dashed var(--accent); outline-offset: -4px; background: rgba(91,77,255,0.04); }`;
  document.head.appendChild(style);
}

function handleDroppedFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const readers = {
    json: () => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const project = JSON.parse(e.target.result);
          restoreProject(project);
          showToast('项目导入: ' + file.name, 'success');
        } catch (err) { showToast('无效的 JSON 文件', 'error'); }
      };
      reader.readAsText(file);
    },
    wav: () => {
      showToast('WAV 文件已接收: ' + file.name, 'success');
    },
    midi: () => {
      showToast('MIDI 文件已接收: ' + file.name, 'success');
    },
    mp3: () => {
      showToast('MP3 文件已接收: ' + file.name, 'success');
    },
    txt: () => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const lr = document.getElementById('lyricResult');
        if (lr) lr.textContent = e.target.result;
        showToast('歌词导入成功', 'success');
      };
      reader.readAsText(file);
    }
  };
  (readers[ext] || readers.json)();
}

initDragDrop();

/* ================= Context Menu 右键菜单 ================= */

let _contextMenuEl = null;

function showContextMenu(x, y, items) {
  hideContextMenu();
  const menu = document.createElement('div');
  menu.className = 'qingluan-context-menu';
  menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;min-width:160px;background:var(--card-bg,#fff);border:1px solid var(--border,rgba(0,0,0,0.06));border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.12);z-index:10001;padding:6px 0;font-size:13px;overflow:hidden;`;

  items.forEach(item => {
    if (item === '---') {
      const sep = document.createElement('div');
      sep.style.cssText = 'height:1px;background:var(--border,rgba(0,0,0,0.06));margin:4px 8px;';
      menu.appendChild(sep);
      return;
    }
    const row = document.createElement('div');
    row.style.cssText = 'padding:8px 14px;cursor:pointer;display:flex;align-items:center;gap:8px;color:var(--text,#1a1a1a);transition:background 0.15s;';
    row.innerHTML = `<span style="opacity:0.7;font-size:15px;">${item.icon || ''}</span><span>${item.label}</span>`;
    row.addEventListener('mouseenter', () => row.style.background = 'rgba(91,77,255,0.06)');
    row.addEventListener('mouseleave', () => row.style.background = 'transparent');
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof item.action === 'function') item.action();
      hideContextMenu();
    });
    menu.appendChild(row);
  });

  document.body.appendChild(menu);
  _contextMenuEl = menu;

  // 边界检测
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';
}

function hideContextMenu() {
  if (_contextMenuEl) {
    _contextMenuEl.remove();
    _contextMenuEl = null;
  }
}

document.addEventListener('click', hideContextMenu);
document.addEventListener('scroll', hideContextMenu, true);

// 为工作室面板启用右键菜单
document.querySelectorAll('.studio-panel, .chat-list, .main').forEach(el => {
  if (!el) return;
  el.addEventListener('contextmenu', (e) => {
    if (e.target.closest('input, textarea, button, a')) return;
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, [
      { label: '撤销', icon: '↩', action: () => window.actionHistory.undo() },
      { label: '重做', icon: '↪', action: () => window.actionHistory.redo() },
      '---',
      { label: '保存项目', icon: '💾', action: () => saveProject() },
      { label: '导出项目', icon: '📤', action: () => exportProject() },
      '---',
      { label: '切换主题', icon: '🎨', action: () => applyTheme('dark') },
      { label: '节拍器', icon: '🥁', action: () => startMetronome() },
      { label: '调音器', icon: '🎸', action: () => startTuner() }
    ]);
  });
});

/* ================= Loading 动画 ================= */

let _loadingOverlay = null;
let _loadingCount = 0;

function showLoading(message = '加载中...') {
  _loadingCount++;
  if (_loadingOverlay) {
    const text = _loadingOverlay.querySelector('.loading-text');
    if (text) text.textContent = message;
    return;
  }
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:20000;background:rgba(0,0,0,0.35);backdrop-filter:blur(4px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;transition:opacity 0.3s;';
  overlay.innerHTML = `
    <div class="qingluan-spinner" style="width:48px;height:48px;border:3px solid rgba(255,255,255,0.2);border-top-color:var(--accent,#5b4dff);border-radius:50%;animation:qlSpin 0.8s linear infinite;"></div>
    <div class="loading-text" style="color:#fff;font-size:14px;font-weight:500;">${message}</div>
  `;
  document.body.appendChild(overlay);
  _loadingOverlay = overlay;

  if (!document.getElementById('qlSpinStyle')) {
    const s = document.createElement('style');
    s.id = 'qlSpinStyle';
    s.textContent = '@keyframes qlSpin { to { transform: rotate(360deg); } }';
    document.head.appendChild(s);
  }
}

function hideLoading() {
  _loadingCount = Math.max(0, _loadingCount - 1);
  if (_loadingCount <= 0 && _loadingOverlay) {
    _loadingOverlay.style.opacity = '0';
    setTimeout(() => {
      if (_loadingOverlay) { _loadingOverlay.remove(); _loadingOverlay = null; }
    }, 300);
  }
}

/* ================= Modal 对话框 ================= */

let _modalOverlay = null;

function showModal(title, content, buttons = []) {
  if (_modalOverlay) _modalOverlay.remove();
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:15000;background:rgba(0,0,0,0.45);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity 0.25s;';
  const box = document.createElement('div');
  box.style.cssText = 'background:var(--card-bg,#fff);border-radius:18px;max-width:380px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,0.2);transform:scale(0.92);transition:transform 0.3s cubic-bezier(0.16,1,0.3,1);';

  const header = document.createElement('div');
  header.style.cssText = 'font-size:16px;font-weight:700;margin-bottom:12px;color:var(--text,#1a1a1a);';
  header.textContent = title;
  box.appendChild(header);

  const body = document.createElement('div');
  body.style.cssText = 'font-size:13px;color:var(--text2,#555);line-height:1.6;margin-bottom:18px;';
  if (typeof content === 'string') body.innerHTML = content;
  else if (content instanceof HTMLElement) body.appendChild(content);
  box.appendChild(body);

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';
  buttons.forEach(btn => {
    const b = document.createElement('button');
    b.textContent = btn.label;
    const isPrimary = btn.primary !== false;
    b.style.cssText = isPrimary
      ? 'padding:8px 16px;border-radius:10px;border:none;background:var(--accent,#5b4dff);color:#fff;font-size:13px;cursor:pointer;font-weight:600;'
      : 'padding:8px 16px;border-radius:10px;border:1px solid var(--border,rgba(0,0,0,0.1));background:transparent;color:var(--text2,#555);font-size:13px;cursor:pointer;';
    b.addEventListener('click', () => {
      if (typeof btn.action === 'function') btn.action();
      if (btn.close !== false) closeModal();
    });
    footer.appendChild(b);
  });
  if (!buttons.length) {
    const ok = document.createElement('button');
    ok.textContent = '确定';
    ok.style.cssText = 'padding:8px 16px;border-radius:10px;border:none;background:var(--accent,#5b4dff);color:#fff;font-size:13px;cursor:pointer;font-weight:600;';
    ok.addEventListener('click', closeModal);
    footer.appendChild(ok);
  }
  box.appendChild(footer);

  overlay.appendChild(box);
  document.body.appendChild(overlay);
  _modalOverlay = overlay;

  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    box.style.transform = 'scale(1)';
  });

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
}

function closeModal() {
  if (!_modalOverlay) return;
  _modalOverlay.style.opacity = '0';
  const box = _modalOverlay.querySelector('div');
  if (box) box.style.transform = 'scale(0.92)';
  setTimeout(() => { if (_modalOverlay) { _modalOverlay.remove(); _modalOverlay = null; } }, 250);
}

/* ================= Tooltip 系统 ================= */

function initTooltips() {
  let tooltipEl = null;

  function showTip(target, text) {
    if (tooltipEl) tooltipEl.remove();
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'qingluan-tooltip';
    tooltipEl.textContent = text;
    tooltipEl.style.cssText = 'position:fixed;z-index:12000;padding:6px 10px;border-radius:8px;background:rgba(30,30,30,0.9);color:#fff;font-size:11px;pointer-events:none;opacity:0;transform:translateY(4px);transition:all 0.2s;white-space:nowrap;';
    document.body.appendChild(tooltipEl);
    const rect = target.getBoundingClientRect();
    const tRect = tooltipEl.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tRect.width / 2;
    let top = rect.top - tRect.height - 8;
    if (left < 8) left = 8;
    if (left + tRect.width > window.innerWidth - 8) left = window.innerWidth - tRect.width - 8;
    if (top < 8) top = rect.bottom + 8;
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
    requestAnimationFrame(() => { tooltipEl.style.opacity = '1'; tooltipEl.style.transform = 'translateY(0)'; });
  }

  function hideTip() {
    if (tooltipEl) { tooltipEl.style.opacity = '0'; setTimeout(() => { if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; } }, 200); }
  }

  document.querySelectorAll('[data-tooltip]').forEach(el => {
    el.addEventListener('mouseenter', () => showTip(el, el.dataset.tooltip));
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('focus', () => showTip(el, el.dataset.tooltip));
    el.addEventListener('blur', hideTip);
  });

  // MutationObserver 监听动态添加的 tooltip
  const mo = new MutationObserver(() => {
    document.querySelectorAll('[data-tooltip]').forEach(el => {
      if (el._tooltipBound) return;
      el._tooltipBound = true;
      el.addEventListener('mouseenter', () => showTip(el, el.dataset.tooltip));
      el.addEventListener('mouseleave', hideTip);
    });
  });
  mo.observe(document.body, { childList: true, subtree: true });
}
initTooltips();

/* ================= Scroll 动画 ================= */

function animateScrollTo(element, targetY, duration = 500) {
  const el = typeof element === 'string' ? document.getElementById(element) : element;
  if (!el) return;
  const startY = el.scrollTop;
  const diff = targetY - startY;
  const startTime = performance.now();

  function step(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    el.scrollTop = startY + diff * eased;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function scrollIntoViewSmooth(target, container) {
  const t = typeof target === 'string' ? document.getElementById(target) : target;
  const c = typeof container === 'string' ? document.getElementById(container) : container;
  if (!t || !c) return;
  const tRect = t.getBoundingClientRect();
  const cRect = c.getBoundingClientRect();
  const targetY = c.scrollTop + tRect.top - cRect.top - cRect.height / 2 + tRect.height / 2;
  animateScrollTo(c, targetY, 400);
}

/* ================= Number Counter 动画 ================= */

function animateNumber(element, from, to, duration = 800) {
  const el = typeof element === 'string' ? document.getElementById(element) : element;
  if (!el) return;
  const startTime = performance.now();
  const isFloat = !Number.isInteger(to) || !Number.isInteger(from);

  function step(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = from + (to - from) * eased;
    el.textContent = isFloat ? val.toFixed(2) : Math.round(val).toString();
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ================= 辅助工具函数 ================= */

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

function throttle(fn, ms = 200) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) { last = now; fn.apply(this, args); }
  };
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function lerp(a, b, t) { return a + (b - a) * t; }

function randomId(prefix = 'ql') { return prefix + '_' + Math.random().toString(36).slice(2, 9); }

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = e => reject(e);
    reader.readAsText(file);
  });
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = e => reject(e);
    reader.readAsArrayBuffer(file);
  });
}

/* ================= 音频可视化辅助 ================= */

function createAnalyserNode(audioCtx, source) {
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;
  if (source) source.connect(analyser);
  return analyser;
}

function getFrequencyData(analyser) {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  return data;
}

function getWaveformData(analyser) {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(data);
  return data;
}

function drawMiniSpectrum(analyser, canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  function draw() {
    requestAnimationFrame(draw);
    const data = getFrequencyData(analyser);
    ctx.clearRect(0, 0, w, h);
    const barW = w / data.length;
    for (let i = 0; i < data.length; i++) {
      const height = (data[i] / 255) * h;
      ctx.fillStyle = `hsl(${200 + i / data.length * 60}, 80%, 60%)`;
      ctx.fillRect(i * barW, h - height, barW, height);
    }
  }
  draw();
}

/* ================= 播放控制占位（与现有系统兼容） ================= */

let _isPlaying = false;
function togglePlayback() {
  _isPlaying = !_isPlaying;
  showToast(_isPlaying ? '开始播放' : '暂停播放', 'info');
}

function closeAll() {
  hideContextMenu();
  closeModal();
  hideLoading();
  const drawer = document.getElementById('drawer');
  const studio = document.getElementById('studio');
  const overlay = document.getElementById('overlay');
  if (drawer) drawer.classList.remove('open');
  if (studio) studio.classList.remove('open');
  if (overlay) overlay.classList.remove('show');
}

/* ================= 初始化扩展模块 ================= */

function initQingluanExtensions() {
  // 为现有按钮添加 data-tooltip（如果不存在）
  const tipMap = [
    { sel: '.nav-back', text: '打开抽屉' },
    { sel: '.nav-menu', text: '工作室设置' },
    { sel: '.input-voice', text: '语音输入' },
    { sel: '.input-send', text: '发送消息' }
  ];
  tipMap.forEach(({ sel, text }) => {
    const el = document.querySelector(sel);
    if (el && !el.dataset.tooltip) el.dataset.tooltip = text;
  });

  // 注册全局快捷键帮助
  registerShortcut('?', () => {
    const items = [
      'Space — 播放/暂停',
      'Ctrl+Z — 撤销',
      'Ctrl+Shift+Z — 重做',
      'Ctrl+S — 保存',
      'Ctrl+E — 导出',
      'Ctrl+O — 打开',
      'Ctrl+N — 新建',
      'Ctrl+B — 切换抽屉',
      'Ctrl+F — 搜索',
      'Ctrl+M — 节拍器',
      'Ctrl+T — 调音器',
      'Ctrl+R — 录音',
      'Ctrl+L — 循环',
      'Esc — 关闭面板',
      'Home — 回到开头',
      'End — 跳到结尾',
      '1-9 — 切换工作室标签'
    ];
    showModal('快捷键帮助', `<div style="display:grid;gap:6px;">${items.map(i => `<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--border,rgba(0,0,0,0.06));">${i}</div>`).join('')}</div>`, [{ label: '关闭', primary: false }]);
  });

  // 监听系统主题变化
  if (window.matchMedia) {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    mql.addEventListener?.('change', (e) => {
      if (!localStorage.getItem('qingluan_theme')) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  console.log('[青鸾 DAW] 扩展模块已加载 v1.0');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initQingluanExtensions);
} else {
  initQingluanExtensions();
}

/* ============================================================
   青鸾 DAW — 深度扩展模块第二部分（追加约2600行）
   包含：PianoRoll编辑器、MIDI编辑器、轨道管理器、混音器UI、
   状态管理器、事件总线、Canvas特效、音频工具、实用类库
   ============================================================ */

/* ================= PianoRoll 交互编辑器 ================= */

class PianoRollEditor {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.id = canvasId;
    }
    this.ctx = this.canvas.getContext('2d');
    this.opts = {
      minNote: 36, maxNote: 96, pixelsPerBeat: 40, rowHeight: 16,
      keyWidth: 48, noteColor: 'rgba(91,77,255,0.85)',
      selectedColor: 'rgba(255,107,157,0.9)', gridColor: 'rgba(0,0,0,0.06)',
      ...options
    };
    this.notes = [];
    this.selectedNotes = new Set();
    this.playhead = 0;
    this.isPlaying = false;
    this.zoomX = 1;
    this.zoomY = 1;
    this.scrollX = 0;
    this.scrollY = 0;
    this.tool = 'pen'; // pen, select, erase
    this.isDragging = false;
    this.dragStart = null;
    this.dragMode = null; // move, resize, select
    this.hoverNote = null;
    this.ghostNote = null;
    this.history = [];
    this.redoStack = [];
    this.listeners = {};

    this._initEvents();
    this._resize();
  }

  _initEvents() {
    const c = this.canvas;
    c.addEventListener('mousedown', this._onMouseDown.bind(this));
    c.addEventListener('mousemove', this._onMouseMove.bind(this));
    c.addEventListener('mouseup', this._onMouseUp.bind(this));
    c.addEventListener('mouseleave', this._onMouseUp.bind(this));
    c.addEventListener('wheel', this._onWheel.bind(this), { passive: false });
    c.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('resize', debounce(() => this._resize(), 200));
  }

  _resize() {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    const w = rect ? rect.width : 800;
    const h = rect ? rect.height : 400;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = w;
    this.height = h;
    this.render();
  }

  _noteToY(pitch) {
    const range = this.opts.maxNote - this.opts.minNote;
    return (this.opts.maxNote - pitch) * this.opts.rowHeight * this.zoomY + this.scrollY;
  }

  _yToNote(y) {
    const range = this.opts.maxNote - this.opts.minNote;
    const relY = y - this.scrollY;
    const row = Math.round(relY / (this.opts.rowHeight * this.zoomY));
    return this.opts.maxNote - row;
  }

  _beatToX(beat) {
    return this.opts.keyWidth + beat * this.opts.pixelsPerBeat * this.zoomX + this.scrollX;
  }

  _xToBeat(x) {
    return (x - this.opts.keyWidth - this.scrollX) / (this.opts.pixelsPerBeat * this.zoomX);
  }

  _getNoteAt(x, y) {
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const n = this.notes[i];
      const nx = this._beatToX(n.offset);
      const ny = this._noteToY(n.pitch);
      const nw = Math.max(4, n.duration * this.opts.pixelsPerBeat * this.zoomX);
      const nh = this.opts.rowHeight * this.zoomY;
      if (x >= nx && x <= nx + nw && y >= ny && y <= ny + nh) {
        const isEdge = x > nx + nw - 6;
        return { note: n, index: i, isEdge };
      }
    }
    return null;
  }

  _onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.isDragging = true;
    this.dragStart = { x, y };

    if (this.tool === 'pen') {
      const hit = this._getNoteAt(x, y);
      if (hit) {
        if (!this.selectedNotes.has(hit.note)) {
          this.selectedNotes.clear();
          this.selectedNotes.add(hit.note);
        }
        this.dragMode = hit.isEdge ? 'resize' : 'move';
        this.dragNoteStart = { ...hit.note };
      } else {
        const pitch = this._yToNote(y);
        const beat = this._xToBeat(x);
        const snap = this.opts.snap || 0.25;
        const snappedBeat = Math.floor(beat / snap) * snap;
        const newNote = { pitch, offset: snappedBeat, duration: 1, velocity: 80, id: randomId('note') };
        this.notes.push(newNote);
        this.selectedNotes.clear();
        this.selectedNotes.add(newNote);
        this.dragMode = 'resize';
        this.dragNoteStart = { ...newNote };
        this._pushHistory('add', [newNote]);
        this.emit('noteAdded', newNote);
      }
    } else if (this.tool === 'select') {
      const hit = this._getNoteAt(x, y);
      if (hit) {
        if (e.shiftKey) {
          if (this.selectedNotes.has(hit.note)) this.selectedNotes.delete(hit.note);
          else this.selectedNotes.add(hit.note);
        } else {
          if (!this.selectedNotes.has(hit.note)) {
            this.selectedNotes.clear();
            this.selectedNotes.add(hit.note);
          }
        }
        this.dragMode = 'move';
        this.dragNoteStart = { ...hit.note };
      } else {
        this.selectedNotes.clear();
        this.dragMode = 'select';
        this.selectBox = { x, y, w: 0, h: 0 };
      }
    } else if (this.tool === 'erase') {
      const hit = this._getNoteAt(x, y);
      if (hit) {
        this._removeNote(hit.note);
        this.emit('noteRemoved', hit.note);
      }
    }
    this.render();
  }

  _onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (!this.isDragging) {
      const hit = this._getNoteAt(x, y);
      this.hoverNote = hit ? hit.note : null;
      this.canvas.style.cursor = hit ? (hit.isEdge ? 'ew-resize' : 'pointer') : 'crosshair';
      if (this.tool === 'pen' && !hit) {
        const pitch = this._yToNote(y);
        const beat = this._xToBeat(x);
        const snap = this.opts.snap || 0.25;
        this.ghostNote = { pitch, offset: Math.floor(beat / snap) * snap, duration: 1 };
      } else {
        this.ghostNote = null;
      }
      this.render();
      return;
    }

    if (this.dragMode === 'move' && this.selectedNotes.size > 0) {
      const dxBeat = this._xToBeat(x) - this._xToBeat(this.dragStart.x);
      const dyPitch = this._yToNote(y) - this._yToNote(this.dragStart.y);
      this.selectedNotes.forEach(note => {
        note.offset = this.dragNoteStart.offset + dxBeat;
        note.pitch = this.dragNoteStart.pitch + dyPitch;
      });
    } else if (this.dragMode === 'resize') {
      const note = Array.from(this.selectedNotes)[0];
      if (note) {
        const newDur = this._xToBeat(x) - note.offset;
        note.duration = Math.max(0.125, newDur);
      }
    } else if (this.dragMode === 'select') {
      this.selectBox.w = x - this.selectBox.x;
      this.selectBox.h = y - this.selectBox.y;
      const bx = Math.min(this.selectBox.x, this.selectBox.x + this.selectBox.w);
      const by = Math.min(this.selectBox.y, this.selectBox.y + this.selectBox.h);
      const bw = Math.abs(this.selectBox.w);
      const bh = Math.abs(this.selectBox.h);
      this.selectedNotes.clear();
      this.notes.forEach(n => {
        const nx = this._beatToX(n.offset);
        const ny = this._noteToY(n.pitch);
        const nw = Math.max(4, n.duration * this.opts.pixelsPerBeat * this.zoomX);
        const nh = this.opts.rowHeight * this.zoomY;
        if (nx < bx + bw && nx + nw > bx && ny < by + bh && ny + nh > by) {
          this.selectedNotes.add(n);
        }
      });
    }
    this.render();
  }

  _onMouseUp(e) {
    if (!this.isDragging) return;
    if (this.dragMode === 'move' || this.dragMode === 'resize') {
      this._pushHistory('edit', Array.from(this.selectedNotes));
    }
    this.isDragging = false;
    this.dragStart = null;
    this.dragMode = null;
    this.dragNoteStart = null;
    this.selectBox = null;
    this.render();
  }

  _onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey) {
      this.zoomX = clamp(this.zoomX - e.deltaY * 0.001, 0.2, 4);
    } else if (e.shiftKey) {
      this.scrollX -= e.deltaY;
    } else {
      this.scrollY -= e.deltaY;
    }
    this.render();
  }

  _removeNote(note) {
    const idx = this.notes.indexOf(note);
    if (idx >= 0) {
      this.notes.splice(idx, 1);
      this.selectedNotes.delete(note);
      this._pushHistory('remove', [note]);
    }
  }

  _pushHistory(type, notes) {
    this.history.push({ type, notes: notes.map(n => ({ ...n })) });
    if (this.history.length > 100) this.history.shift();
    this.redoStack = [];
  }

  undo() {
    const action = this.history.pop();
    if (!action) return;
    if (action.type === 'add') {
      action.notes.forEach(n => {
        const found = this.notes.find(x => x.id === n.id);
        if (found) this._removeNote(found);
      });
    } else if (action.type === 'remove') {
      action.notes.forEach(n => this.notes.push({ ...n }));
    } else if (action.type === 'edit') {
      // 简化undo，实际需要快照机制
    }
    this.redoStack.push(action);
    this.render();
  }

  setNotes(notes) {
    this.notes = notes.map((n, i) => ({ ...n, id: n.id || randomId('note') }));
    this.selectedNotes.clear();
    this.render();
  }

  getNotes() { return this.notes.map(n => ({ ...n })); }

  setPlayhead(beat) { this.playhead = beat; this.render(); }

  setTool(tool) { this.tool = tool; }

  deleteSelected() {
    if (this.selectedNotes.size === 0) return;
    this._pushHistory('remove', Array.from(this.selectedNotes));
    this.selectedNotes.forEach(n => {
      const idx = this.notes.indexOf(n);
      if (idx >= 0) this.notes.splice(idx, 1);
    });
    this.selectedNotes.clear();
    this.render();
  }

  copySelected() {
    if (this.selectedNotes.size === 0) return;
    this._clipboard = Array.from(this.selectedNotes).map(n => ({ ...n }));
  }

  paste() {
    if (!this._clipboard || !this._clipboard.length) return;
    const minOffset = Math.min(...this._clipboard.map(n => n.offset));
    this._clipboard.forEach(n => {
      const newNote = { ...n, id: randomId('note'), offset: n.offset - minOffset + this.playhead };
      this.notes.push(newNote);
    });
    this._pushHistory('add', this._clipboard.map(n => ({ ...n, id: randomId('note') })));
    this.render();
  }

  quantize(grid = 0.25) {
    this.notes.forEach(n => {
      n.offset = Math.round(n.offset / grid) * grid;
      n.duration = Math.max(grid, Math.round(n.duration / grid) * grid);
    });
    this.render();
  }

  render() {
    const { ctx, width: w, height: h } = this;
    const opts = this.opts;
    ctx.clearRect(0, 0, w, h);

    // 背景
    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, w, h);

    const keyW = opts.keyWidth;
    const rowH = opts.rowHeight * this.zoomY;
    const beatW = opts.pixelsPerBeat * this.zoomX;
    const noteRange = opts.maxNote - opts.minNote;

    // 钢琴键
    const blackKeys = new Set([1, 3, 6, 8, 10]);
    for (let n = opts.maxNote; n >= opts.minNote; n--) {
      const row = opts.maxNote - n;
      const y = row * rowH + this.scrollY;
      if (y < -rowH || y > h) continue;
      const semi = n % 12;
      const isBlack = blackKeys.has(semi);
      ctx.fillStyle = isBlack ? opts.blackKeyColor || '#1a1a1a' : opts.whiteKeyColor || '#fff';
      ctx.fillRect(0, y, keyW * (isBlack ? 0.65 : 1), rowH);
      ctx.strokeStyle = opts.gridColor;
      ctx.strokeRect(0, y, keyW, rowH);
    }

    // 网格
    const totalBeats = Math.max(16, ...this.notes.map(n => n.offset + n.duration)) + 4;
    for (let b = 0; b <= totalBeats * 4; b++) {
      const x = keyW + (b / 4) * beatW + this.scrollX;
      if (x < keyW || x > w) continue;
      const isBar = b % 16 === 0;
      const isBeat = b % 4 === 0;
      ctx.strokeStyle = isBar ? 'rgba(0,0,0,0.2)' : (isBeat ? 'rgba(0,0,0,0.12)' : opts.gridColor);
      ctx.lineWidth = isBar ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let row = 0; row <= noteRange; row++) {
      const y = row * rowH + this.scrollY;
      if (y < 0 || y > h) continue;
      ctx.strokeStyle = opts.gridColor;
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(keyW, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 音符
    this.notes.forEach(note => {
      const x = this._beatToX(note.offset);
      const y = this._noteToY(note.pitch);
      const nw = Math.max(4, note.duration * beatW);
      const nh = rowH - 2;
      if (x + nw < keyW || x > w || y + nh < 0 || y > h) return;

      const isSelected = this.selectedNotes.has(note);
      const isHover = this.hoverNote === note;
      ctx.fillStyle = isSelected ? opts.selectedColor : (note.color || opts.noteColor);
      if (isHover && !isSelected) ctx.fillStyle = 'rgba(91,77,255,0.65)';
      roundRect(ctx, x, y + 1, nw, nh, 3);
      ctx.fill();
      if (isSelected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (nw > 20) {
        ctx.fillStyle = '#fff';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(note.name || note.pitch, x + nw / 2, y + nh / 2 + 1);
      }
    });

    // Ghost note
    if (this.ghostNote && this.tool === 'pen') {
      const x = this._beatToX(this.ghostNote.offset);
      const y = this._noteToY(this.ghostNote.pitch);
      const nw = this.ghostNote.duration * beatW;
      ctx.fillStyle = 'rgba(91,77,255,0.2)';
      roundRect(ctx, x, y + 1, nw, rowH - 2, 3);
      ctx.fill();
    }

    // 选择框
    if (this.selectBox) {
      const bx = Math.min(this.selectBox.x, this.selectBox.x + this.selectBox.w);
      const by = Math.min(this.selectBox.y, this.selectBox.y + this.selectBox.h);
      const bw = Math.abs(this.selectBox.w);
      const bh = Math.abs(this.selectBox.h);
      ctx.fillStyle = 'rgba(91,77,255,0.1)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = 'rgba(91,77,255,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, bh);
    }

    // 播放头
    const px = this._beatToX(this.playhead);
    ctx.strokeStyle = opts.playheadColor || '#ff6b9d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
    ctx.fillStyle = opts.playheadColor || '#ff6b9d';
    ctx.beginPath();
    ctx.moveTo(px - 5, 0);
    ctx.lineTo(px + 5, 0);
    ctx.lineTo(px, 6);
    ctx.fill();
  }

  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => { try { cb(data); } catch (e) {} });
  }
}

/* ================= MIDI 编辑器 ================= */

class MidiEditor {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.tracks = [];
    this.currentTrack = 0;
    this.pianoRoll = null;
    this.transport = { bpm: 120, timeSig: [4, 4], playing: false };
    this.listeners = {};
  }

  addTrack(name = '新轨道') {
    const track = {
      id: randomId('trk'),
      name,
      notes: [],
      muted: false,
      solo: false,
      volume: 0.8,
      pan: 0,
      instrument: 'piano',
      color: `hsl(${Math.random() * 360}, 70%, 60%)`
    };
    this.tracks.push(track);
    this.emit('trackAdded', track);
    return track;
  }

  removeTrack(id) {
    const idx = this.tracks.findIndex(t => t.id === id);
    if (idx >= 0) {
      const track = this.tracks[idx];
      this.tracks.splice(idx, 1);
      this.emit('trackRemoved', track);
    }
  }

  setTrackNotes(trackId, notes) {
    const track = this.tracks.find(t => t.id === trackId);
    if (track) {
      track.notes = notes;
      if (this.pianoRoll) this.pianoRoll.setNotes(notes);
    }
  }

  attachPianoRoll(pianoRoll) {
    this.pianoRoll = pianoRoll;
    pianoRoll.on('noteAdded', (note) => {
      const track = this.tracks[this.currentTrack];
      if (track) track.notes.push(note);
    });
    pianoRoll.on('noteRemoved', (note) => {
      const track = this.tracks[this.currentTrack];
      if (track) {
        const idx = track.notes.findIndex(n => n.id === note.id);
        if (idx >= 0) track.notes.splice(idx, 1);
      }
    });
  }

  exportMidi() {
    // 简化的 MIDI 导出数据结构
    return {
      format: 1,
      ticksPerQuarter: 480,
      tracks: this.tracks.map(t => ({
        name: t.name,
        notes: t.notes.map(n => ({
          pitch: n.pitch,
          velocity: n.velocity || 80,
          tick: Math.round(n.offset * 480),
          duration: Math.round(n.duration * 480)
        }))
      }))
    };
  }

  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => { try { cb(data); } catch (e) {} });
  }
}

/* ================= 轨道混音器 UI ================= */

class TrackMixer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = containerId;
      document.body.appendChild(this.container);
    }
    this.tracks = [];
    this.masterGain = 1;
    this.render();
  }

  addTrack(trackData) {
    this.tracks.push({ ...trackData, gain: 1, pan: 0, mute: false, solo: false });
    this.render();
  }

  removeTrack(id) {
    this.tracks = this.tracks.filter(t => t.id !== id);
    this.render();
  }

  updateTrack(id, props) {
    const track = this.tracks.find(t => t.id === id);
    if (track) Object.assign(track, props);
    this.render();
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = '';
    this.container.style.cssText = 'display:flex;gap:8px;padding:10px;background:var(--card-bg);border-radius:12px;overflow-x:auto;';

    this.tracks.forEach(track => {
      const strip = document.createElement('div');
      strip.style.cssText = 'width:60px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 4px;background:rgba(0,0,0,0.03);border-radius:8px;';

      const name = document.createElement('div');
      name.textContent = track.name;
      name.style.cssText = 'font-size:10px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;text-align:center;';

      const meter = document.createElement('div');
      meter.style.cssText = 'width:8px;height:80px;background:rgba(0,0,0,0.06);border-radius:4px;position:relative;overflow:hidden;';
      const fill = document.createElement('div');
      fill.style.cssText = `position:absolute;bottom:0;left:0;right:0;height:${Math.random() * 60 + 20}%;background:var(--accent);border-radius:4px;transition:height 0.1s;`;
      meter.appendChild(fill);

      const fader = document.createElement('input');
      fader.type = 'range';
      fader.min = '0';
      fader.max = '100';
      fader.value = String(track.gain * 100);
      fader.style.cssText = 'width:50px;height:4px;accent-color:var(--accent);';
      fader.addEventListener('input', (e) => {
        track.gain = parseInt(e.target.value) / 100;
      });

      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:4px;';
      const muteBtn = document.createElement('button');
      muteBtn.textContent = 'M';
      muteBtn.style.cssText = `width:20px;height:20px;border-radius:4px;border:none;font-size:9px;font-weight:700;cursor:pointer;background:${track.mute ? 'var(--error)' : 'rgba(0,0,0,0.06)'};color:${track.mute ? '#fff' : 'var(--text2)'};`;
      muteBtn.addEventListener('click', () => { track.mute = !track.mute; this.render(); });
      const soloBtn = document.createElement('button');
      soloBtn.textContent = 'S';
      soloBtn.style.cssText = `width:20px;height:20px;border-radius:4px;border:none;font-size:9px;font-weight:700;cursor:pointer;background:${track.solo ? 'var(--warning)' : 'rgba(0,0,0,0.06)'};color:${track.solo ? '#fff' : 'var(--text2)'};`;
      soloBtn.addEventListener('click', () => { track.solo = !track.solo; this.render(); });
      btnRow.appendChild(muteBtn);
      btnRow.appendChild(soloBtn);

      strip.appendChild(name);
      strip.appendChild(meter);
      strip.appendChild(fader);
      strip.appendChild(btnRow);
      this.container.appendChild(strip);
    });

    // Master strip
    const master = document.createElement('div');
    master.style.cssText = 'width:60px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 4px;background:rgba(91,77,255,0.06);border-radius:8px;border:1px solid var(--accent);';
    master.innerHTML = `
      <div style="font-size:10px;font-weight:700;color:var(--accent);text-align:center;">MASTER</div>
      <div style="width:8px;height:80px;background:rgba(0,0,0,0.06);border-radius:4px;position:relative;overflow:hidden;">
        <div style="position:absolute;bottom:0;left:0;right:0;height:75%;background:var(--accent);border-radius:4px;"></div>
      </div>
      <input type="range" min="0" max="100" value="80" style="width:50px;height:4px;accent-color:var(--accent);">
    `;
    this.container.appendChild(master);
  }
}

/* ================= 状态管理器 ================= */

class StateManager {
  constructor(initialState = {}) {
    this.state = { ...initialState };
    this.listeners = new Map();
    this.batchDepth = 0;
    this.pendingKeys = new Set();
  }

  get(key) {
    return key ? this.state[key] : { ...this.state };
  }

  set(key, value) {
    const oldValue = this.state[key];
    if (oldValue === value) return;
    this.state[key] = value;
    if (this.batchDepth > 0) {
      this.pendingKeys.add(key);
    } else {
      this._notify(key, value, oldValue);
    }
  }

  batch(fn) {
    this.batchDepth++;
    try {
      fn();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0) {
        this.pendingKeys.forEach(key => this._notify(key, this.state[key]));
        this.pendingKeys.clear();
      }
    }
  }

  subscribe(key, callback) {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key).add(callback);
    return () => this.listeners.get(key).delete(callback);
  }

  _notify(key, value, oldValue) {
    const cbs = this.listeners.get(key);
    if (cbs) cbs.forEach(cb => { try { cb(value, oldValue, key); } catch (e) {} });
  }
}

/* ================= 事件总线 ================= */

class EventBus {
  constructor() {
    this.events = new Map();
  }

  on(event, callback, options = {}) {
    if (!this.events.has(event)) this.events.set(event, []);
    this.events.get(event).push({ callback, once: options.once || false, priority: options.priority || 0 });
    this.events.get(event).sort((a, b) => b.priority - a.priority);
    return () => this.off(event, callback);
  }

  once(event, callback, options = {}) {
    return this.on(event, callback, { ...options, once: true });
  }

  off(event, callback) {
    if (!this.events.has(event)) return;
    const list = this.events.get(event).filter(l => l.callback !== callback);
    this.events.set(event, list);
  }

  emit(event, data) {
    if (!this.events.has(event)) return;
    const list = this.events.get(event);
    list.forEach(l => {
      try { l.callback(data, event); } catch (e) {}
    });
    this.events.set(event, list.filter(l => !l.once));
  }

  clear(event) {
    if (event) this.events.delete(event);
    else this.events.clear();
  }
}

/* ================= 音频引擎包装器 ================= */

class QingluanAudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.analyser = null;
    this.sources = new Map();
    this.isPlaying = false;
  }

  async init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.masterGain.gain.value = 0.8;
  }

  async playBuffer(buffer, when = 0) {
    await this.init();
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.masterGain);
    source.start(this.ctx.currentTime + when);
    const id = randomId('src');
    this.sources.set(id, source);
    source.onended = () => this.sources.delete(id);
    return id;
  }

  stopSource(id) {
    const src = this.sources.get(id);
    if (src) { try { src.stop(); } catch (e) {} this.sources.delete(id); }
  }

  stopAll() {
    this.sources.forEach(src => { try { src.stop(); } catch (e) {} });
    this.sources.clear();
  }

  setMasterVolume(val) {
    if (this.masterGain) this.masterGain.gain.setTargetAtTime(clamp(val, 0, 1), this.ctx.currentTime, 0.02);
  }

  getAnalyserData() {
    if (!this.analyser) return new Uint8Array(0);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  createOscillator(freq, type = 'sine') {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(this.masterGain);
    return { osc, gain };
  }

  suspend() { if (this.ctx) this.ctx.suspend(); }
  resume() { if (this.ctx) this.ctx.resume(); }
  close() { if (this.ctx) { this.stopAll(); this.ctx.close(); this.ctx = null; } }
}

/* ================= 频谱分析器实时绘制器 ================= */

class SpectrumVisualizer {
  constructor(canvasId, audioEngine, options = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.engine = audioEngine;
    this.opts = { barCount: 64, smoothing: 0.8, ...options };
    this.running = false;
    this.rafId = null;
  }

  start() {
    this.running = true;
    this._draw();
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  _draw() {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(() => this._draw());
    if (!this.engine || !this.engine.analyser) return;

    const data = this.engine.getAnalyserData();
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);

    const barW = w / this.opts.barCount;
    for (let i = 0; i < this.opts.barCount; i++) {
      const idx = Math.floor((i / this.opts.barCount) * data.length);
      const val = data[idx] / 255;
      const height = val * h;
      const hue = 200 + (i / this.opts.barCount) * 60;
      this.ctx.fillStyle = `hsla(${hue}, 80%, 60%, 0.9)`;
      this.ctx.fillRect(i * barW, h - height, barW - 1, height);
    }
  }
}

/* ================= 项目状态自动保存 ================= */

class AutoSaveManager {
  constructor(options = {}) {
    this.interval = options.interval || 30000;
    this.enabled = options.enabled !== false;
    this.timer = null;
    this.listeners = [];
  }

  start() {
    if (!this.enabled) return;
    this.stop();
    this.timer = setInterval(() => this._save(), this.interval);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  _save() {
    try {
      if (typeof currentProject !== 'undefined' && currentProject) {
        const data = JSON.stringify(currentProject);
        localStorage.setItem('qingluan_autosave', data);
        localStorage.setItem('qingluan_autosave_time', Date.now().toString());
        this.listeners.forEach(cb => { try { cb(); } catch (e) {} });
      }
    } catch (e) { console.warn('自动保存失败:', e); }
  }

  restore() {
    try {
      const data = localStorage.getItem('qingluan_autosave');
      const time = localStorage.getItem('qingluan_autosave_time');
      if (data) {
        const project = JSON.parse(data);
        if (typeof restoreProject === 'function') restoreProject(project);
        return { success: true, project, time: time ? new Date(parseInt(time)) : null };
      }
    } catch (e) { console.warn('恢复自动保存失败:', e); }
    return { success: false };
  }

  onSave(cb) { this.listeners.push(cb); }
}

const autoSaveManager = new AutoSaveManager();
autoSaveManager.start();

/* ================= 更多 Canvas 特效 ================= */

function drawCircularWaveform(canvasId, buffer, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const radius = options.radius || Math.min(cx, cy) * 0.4;
  const data = buffer.getChannelData ? buffer.getChannelData(0) : (Array.isArray(buffer) ? buffer : []);
  if (!data.length) return;

  ctx.clearRect(0, 0, w, h);
  const step = Math.ceil(data.length / 360);
  ctx.strokeStyle = options.color || 'var(--accent, #5b4dff)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 360; i++) {
    const idx = i * step;
    const val = data[idx] || 0;
    const r = radius + val * radius * 0.8;
    const rad = (i * Math.PI) / 180;
    const x = cx + Math.cos(rad) * r;
    const y = cy + Math.sin(rad) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawOscilloscope(canvasId, analyser, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !analyser) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const data = new Uint8Array(analyser.frequencyBinCount);

  function draw() {
    requestAnimationFrame(draw);
    analyser.getByteTimeDomainData(data);
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 2;
    ctx.strokeStyle = options.color || 'var(--accent, #5b4dff)';
    ctx.beginPath();
    const slice = w / data.length;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 128.0;
      const y = (v * h) / 2;
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(i * slice, y);
    }
    ctx.stroke();
  }
  draw();
}

function drawWaterfall(canvasId, analyser, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !analyser) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const history = [];
  const maxHistory = options.maxHistory || 60;

  function draw() {
    requestAnimationFrame(draw);
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    history.push(data);
    if (history.length > maxHistory) history.shift();

    ctx.clearRect(0, 0, w, h);
    const barW = w / data.length;
    for (let t = 0; t < history.length; t++) {
      const frame = history[t];
      const y = h - (t / maxHistory) * h;
      for (let i = 0; i < frame.length; i++) {
        const val = frame[i] / 255;
        const hue = 240 - val * 240;
        ctx.fillStyle = `hsla(${hue}, 90%, 50%, ${val * 0.8})`;
        ctx.fillRect(i * barW, y, barW, h / maxHistory + 1);
      }
    }
  }
  draw();
}

/* ================= 音频工具函数 ================= */

function generateSineWave(freq, duration, sampleRate = 44100) {
  const length = Math.floor(duration * sampleRate);
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    buffer[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return buffer;
}

function generateSquareWave(freq, duration, sampleRate = 44100) {
  const length = Math.floor(duration * sampleRate);
  const buffer = new Float32Array(length);
  const period = sampleRate / freq;
  for (let i = 0; i < length; i++) {
    buffer[i] = (i % period) < period / 2 ? 0.5 : -0.5;
  }
  return buffer;
}

function generateSawtoothWave(freq, duration, sampleRate = 44100) {
  const length = Math.floor(duration * sampleRate);
  const buffer = new Float32Array(length);
  const period = sampleRate / freq;
  for (let i = 0; i < length; i++) {
    buffer[i] = 2 * ((i % period) / period) - 1;
  }
  return buffer;
}

function generateTriangleWave(freq, duration, sampleRate = 44100) {
  const length = Math.floor(duration * sampleRate);
  const buffer = new Float32Array(length);
  const period = sampleRate / freq;
  for (let i = 0; i < length; i++) {
    const t = (i % period) / period;
    buffer[i] = t < 0.5 ? 4 * t - 1 : 3 - 4 * t;
  }
  return buffer;
}

function applyADSR(buffer, attack, decay, sustain, release, sampleRate = 44100) {
  const length = buffer.length;
  const aSamples = Math.floor(attack * sampleRate);
  const dSamples = Math.floor(decay * sampleRate);
  const rSamples = Math.floor(release * sampleRate);
  const sStart = aSamples + dSamples;
  const rStart = length - rSamples;

  for (let i = 0; i < length; i++) {
    let env = 0;
    if (i < aSamples) {
      env = i / aSamples;
    } else if (i < sStart) {
      env = 1 - (1 - sustain) * ((i - aSamples) / dSamples);
    } else if (i < rStart) {
      env = sustain;
    } else {
      env = sustain * (1 - (i - rStart) / rSamples);
    }
    buffer[i] *= Math.max(0, env);
  }
  return buffer;
}

function mixBuffers(buffers) {
  if (!buffers.length) return new Float32Array(0);
  const maxLen = Math.max(...buffers.map(b => b.length));
  const out = new Float32Array(maxLen);
  buffers.forEach(buf => {
    for (let i = 0; i < buf.length; i++) {
      out[i] += buf[i];
    }
  });
  // 防止削波
  const maxVal = Math.max(...out.map(Math.abs));
  if (maxVal > 1) {
    for (let i = 0; i < out.length; i++) out[i] /= maxVal;
  }
  return out;
}

function bufferToWavBlob(buffer, sampleRate = 44100) {
  const length = buffer.length;
  const wavBuffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(wavBuffer);
  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

/* ================= 实用数据结构 ================= */

class ObservableArray extends Array {
  constructor(...args) {
    super(...args);
    this.listeners = [];
  }

  onChange(cb) { this.listeners.push(cb); }

  _notify(type, items) {
    this.listeners.forEach(cb => { try { cb(type, items); } catch (e) {} });
  }

  push(...items) {
    const result = super.push(...items);
    this._notify('push', items);
    return result;
  }

  splice(start, deleteCount, ...items) {
    const removed = super.splice(start, deleteCount, ...items);
    this._notify('splice', { start, removed, added: items });
    return removed;
  }

  pop() {
    const item = super.pop();
    this._notify('pop', [item]);
    return item;
  }

  shift() {
    const item = super.shift();
    this._notify('shift', [item]);
    return item;
  }
}

class LRUCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) this.cache.delete(key);
    else if (this.cache.size >= this.maxSize) {
      const first = this.cache.keys().next().value;
      this.cache.delete(first);
    }
    this.cache.set(key, value);
  }

  has(key) { return this.cache.has(key); }
  delete(key) { return this.cache.delete(key); }
  clear() { this.cache.clear(); }
}

class PriorityQueue {
  constructor(compare = (a, b) => a - b) {
    this.compare = compare;
    this.heap = [];
  }

  push(item) {
    this.heap.push(item);
    this._siftUp(this.heap.length - 1);
  }

  pop() {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const end = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = end;
      this._siftDown(0);
    }
    return top;
  }

  peek() { return this.heap[0]; }
  get size() { return this.heap.length; }

  _siftUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.compare(this.heap[i], this.heap[parent]) >= 0) break;
      [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
      i = parent;
    }
  }

  _siftDown(i) {
    while (true) {
      let min = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < this.heap.length && this.compare(this.heap[left], this.heap[min]) < 0) min = left;
      if (right < this.heap.length && this.compare(this.heap[right], this.heap[min]) < 0) min = right;
      if (min === i) break;
      [this.heap[i], this.heap[min]] = [this.heap[min], this.heap[i]];
      i = min;
    }
  }
}

/* ================= 更多 UI 工具 ================= */

function createSlider(options = {}) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
  const label = document.createElement('span');
  label.textContent = options.label || '';
  label.style.cssText = 'font-size:12px;color:var(--text2);min-width:60px;';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(options.min ?? 0);
  input.max = String(options.max ?? 100);
  input.value = String(options.value ?? 50);
  input.step = String(options.step ?? 1);
  input.style.cssText = 'flex:1;accent-color:var(--accent);';
  const valLabel = document.createElement('span');
  valLabel.textContent = input.value;
  valLabel.style.cssText = 'font-size:11px;color:var(--text3);min-width:30px;text-align:right;';
  input.addEventListener('input', () => {
    valLabel.textContent = input.value;
    if (options.onChange) options.onChange(parseFloat(input.value));
  });
  wrap.appendChild(label);
  wrap.appendChild(input);
  wrap.appendChild(valLabel);
  return { element: wrap, input, valLabel };
}

function createToggle(options = {}) {
  const wrap = document.createElement('label');
  wrap.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = options.checked || false;
  input.style.cssText = 'width:16px;height:16px;accent-color:var(--accent);';
  const label = document.createElement('span');
  label.textContent = options.label || '';
  label.style.cssText = 'font-size:12px;color:var(--text2);';
  input.addEventListener('change', () => { if (options.onChange) options.onChange(input.checked); });
  wrap.appendChild(input);
  wrap.appendChild(label);
  return { element: wrap, input };
}

function createSelect(options = {}) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
  const label = document.createElement('span');
  label.textContent = options.label || '';
  label.style.cssText = 'font-size:12px;color:var(--text2);min-width:60px;';
  const select = document.createElement('select');
  select.style.cssText = 'flex:1;padding:6px 8px;border-radius:8px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-size:12px;';
  (options.options || []).forEach(opt => {
    const o = document.createElement('option');
    o.value = typeof opt === 'object' ? opt.value : opt;
    o.textContent = typeof opt === 'object' ? opt.label : opt;
    select.appendChild(o);
  });
  if (options.value) select.value = options.value;
  select.addEventListener('change', () => { if (options.onChange) options.onChange(select.value); });
  wrap.appendChild(label);
  wrap.appendChild(select);
  return { element: wrap, select };
}

function createButton(options = {}) {
  const btn = document.createElement('button');
  btn.textContent = options.label || '';
  btn.style.cssText = options.primary !== false
    ? 'padding:8px 16px;border-radius:10px;border:none;background:var(--accent);color:#fff;font-size:13px;cursor:pointer;font-weight:600;'
    : 'padding:8px 16px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--text2);font-size:13px;cursor:pointer;';
  if (options.onClick) btn.addEventListener('click', options.onClick);
  return btn;
}

/* ================= 全局暴露核心类 ================= */

window.PianoRollEditor = PianoRollEditor;
window.MidiEditor = MidiEditor;
window.TrackMixer = TrackMixer;
window.StateManager = StateManager;
window.EventBus = EventBus;
window.QingluanAudioEngine = QingluanAudioEngine;
window.SpectrumVisualizer = SpectrumVisualizer;
window.AutoSaveManager = AutoSaveManager;
window.ObservableArray = ObservableArray;
window.LRUCache = LRUCache;
window.PriorityQueue = PriorityQueue;

// 预初始化音频引擎单例
window.qingluanAudio = new QingluanAudioEngine();

console.log('[青鸾 DAW] 深度扩展模块已加载 v2.0');

/* ================= 更多 UI 组件工厂 ================= */

function createCard(options = {}) {
  const card = document.createElement('div');
  card.style.cssText = 'background:var(--card-bg);border-radius:var(--radius-md);border:1px solid var(--border);padding:16px;box-shadow:var(--shadow-sm);transition:box-shadow 0.2s;';
  if (options.hoverable) {
    card.addEventListener('mouseenter', () => card.style.boxShadow = 'var(--shadow-md)');
    card.addEventListener('mouseleave', () => card.style.boxShadow = 'var(--shadow-sm)');
  }
  if (options.title) {
    const title = document.createElement('div');
    title.textContent = options.title;
    title.style.cssText = 'font-size:14px;font-weight:700;margin-bottom:8px;color:var(--text);';
    card.appendChild(title);
  }
  if (options.content) {
    const content = document.createElement('div');
    content.innerHTML = options.content;
    content.style.cssText = 'font-size:13px;color:var(--text2);line-height:1.5;';
    card.appendChild(content);
  }
  return card;
}

function createTabs(tabs, onChange) {
  const container = document.createElement('div');
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:12px;';
  const body = document.createElement('div');
  let activeIndex = 0;

  function render() {
    header.innerHTML = '';
    tabs.forEach((tab, i) => {
      const btn = document.createElement('button');
      btn.textContent = tab.label;
      btn.style.cssText = i === activeIndex
        ? 'padding:8px 14px;background:transparent;border:none;border-bottom:2px solid var(--accent);color:var(--accent);font-size:13px;font-weight:600;cursor:pointer;'
        : 'padding:8px 14px;background:transparent;border:none;border-bottom:2px solid transparent;color:var(--text2);font-size:13px;cursor:pointer;';
      btn.addEventListener('click', () => {
        activeIndex = i;
        render();
        if (onChange) onChange(i, tab);
      });
      header.appendChild(btn);
    });
    body.innerHTML = '';
    if (tabs[activeIndex] && tabs[activeIndex].render) {
      body.appendChild(tabs[activeIndex].render());
    }
  }

  render();
  container.appendChild(header);
  container.appendChild(body);
  return { element: container, header, body, setActive: (i) => { activeIndex = i; render(); } };
}

function createProgressBar(options = {}) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'width:100%;height:6px;background:var(--progress-bg);border-radius:3px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'height:100%;background:var(--progress-fill);width:0%;transition:width 0.3s ease;';
  wrap.appendChild(fill);
  return {
    element: wrap,
    setValue: (v) => { fill.style.width = clamp(v, 0, 100) + '%'; },
    setColor: (c) => { fill.style.background = c; }
  };
}

function createColorPicker(options = {}) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
  const input = document.createElement('input');
  input.type = 'color';
  input.value = options.value || '#5b4dff';
  input.style.cssText = 'width:32px;height:32px;border:none;border-radius:8px;cursor:pointer;background:none;';
  const label = document.createElement('span');
  label.textContent = options.label || '';
  label.style.cssText = 'font-size:12px;color:var(--text2);';
  input.addEventListener('input', () => { if (options.onChange) options.onChange(input.value); });
  wrap.appendChild(label);
  wrap.appendChild(input);
  return { element: wrap, input };
}

/* ================= 音频导出工具 ================= */

class AudioExporter {
  constructor() {
    this.sampleRate = 44100;
    this.bitDepth = 16;
  }

  async exportWav(audioBuffer, filename = 'export.wav') {
    const blob = bufferToWavBlob(audioBuffer.getChannelData(0), this.sampleRate);
    downloadBlob(blob, filename);
    return { success: true, filename };
  }

  async exportProject(project, filename = 'project.json') {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    downloadBlob(blob, filename);
    return { success: true, filename };
  }

  async exportMidi(midiData, filename = 'project.mid') {
    // 简化 MIDI 文件头
    const bytes = [
      0x4D, 0x54, 0x68, 0x64, // MThd
      0x00, 0x00, 0x00, 0x06, // header length
      0x00, 0x01, // format 1
      0x00, midiData.tracks.length + 1, // tracks
      0x01, 0xE0, // 480 ticks per quarter
    ];
    // 这里简化为 JSON 导出，实际 MIDI 二进制需要更复杂的编码
    const blob = new Blob([JSON.stringify(midiData, null, 2)], { type: 'application/json' });
    downloadBlob(blob, filename.replace('.mid', '.json'));
    return { success: true, filename };
  }
}

const audioExporter = new AudioExporter();

/* ================= 音频录制器 ================= */

class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.chunks = [];
    this.stream = null;
    this.isRecording = false;
    this.listeners = [];
  }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.chunks = [];
      this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.chunks.push(e.data); };
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' });
        this.listeners.forEach(cb => { try { cb(blob); } catch (e) {} });
      };
      this.mediaRecorder.start();
      this.isRecording = true;
      showToast('录音开始', 'info');
    } catch (e) {
      showToast('无法开始录音: ' + e.message, 'error');
    }
  }

  stop() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.stream.getTracks().forEach(t => t.stop());
      this.isRecording = false;
      showToast('录音结束', 'info');
    }
  }

  onRecordComplete(cb) { this.listeners.push(cb); }
}

/* ================= 项目导入导出增强 ================= */

function exportProjectEnhanced() {
  const project = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    tracks: typeof midiEditor !== 'undefined' ? midiEditor.exportMidi().tracks : [],
    bpm: document.getElementById('bpm')?.value || 120,
    key: document.getElementById('key')?.value || 'C',
    theme: localStorage.getItem('qingluan_theme') || 'default',
    settings: {
      metronome: _metronome.isRunning,
      tuner: _tuner.isRunning
    }
  };
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'qingluan_project_' + Date.now() + '.json');
  showToast('项目导出成功', 'success');
}

function importProjectEnhanced(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const project = JSON.parse(e.target.result);
      if (project.tracks && typeof midiEditor !== 'undefined') {
        midiEditor.tracks = project.tracks.map(t => ({
          ...t,
          id: randomId('trk'),
          notes: t.notes.map(n => ({ ...n, id: randomId('note') }))
        }));
      }
      if (project.bpm) {
        const bpmEl = document.getElementById('bpm');
        if (bpmEl) bpmEl.value = project.bpm;
      }
      if (project.key) {
        const keyEl = document.getElementById('key');
        if (keyEl) keyEl.value = project.key;
      }
      if (project.theme) applyTheme(project.theme);
      showToast('项目导入成功', 'success');
    } catch (err) {
      showToast('项目导入失败: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

/* ================= 更多可视化 ================= */

function drawLissajous(canvasId, analyser, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !analyser) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const dataX = new Uint8Array(analyser.frequencyBinCount);
  const dataY = new Uint8Array(analyser.frequencyBinCount);

  function draw() {
    requestAnimationFrame(draw);
    analyser.getByteTimeDomainData(dataX);
    // 使用相位偏移模拟Y通道
    for (let i = 0; i < dataY.length; i++) {
      dataY[i] = dataX[(i + dataX.length / 4) % dataX.length];
    }
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = options.color || 'var(--accent, #5b4dff)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < dataX.length; i++) {
      const x = (dataX[i] / 255) * w;
      const y = (dataY[i] / 255) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  draw();
}

function drawFrequencyGrid(canvasId, analyser, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !analyser) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const data = new Uint8Array(analyser.frequencyBinCount);

  function draw() {
    requestAnimationFrame(draw);
    analyser.getByteFrequencyData(data);
    ctx.clearRect(0, 0, w, h);
    const cols = 16;
    const rows = 8;
    const cellW = w / cols;
    const cellH = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = Math.floor(((r * cols + c) / (cols * rows)) * data.length);
        const val = data[idx] / 255;
        const hue = 200 + val * 60;
        const size = val * Math.min(cellW, cellH) * 0.8;
        ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${0.3 + val * 0.7})`;
        ctx.beginPath();
        ctx.arc(c * cellW + cellW / 2, r * cellH + cellH / 2, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  draw();
}

/* ================= 浏览器兼容性处理 ================= */

function checkBrowserCompatibility() {
  const checks = {
    webAudio: !!(window.AudioContext || window.webkitAudioContext),
    canvas: !!document.createElement('canvas').getContext,
    localStorage: (() => { try { localStorage.setItem('__test__', '1'); localStorage.removeItem('__test__'); return true; } catch (e) { return false; } })(),
    es6: (() => { try { eval('const f = () => {};'); return true; } catch (e) { return false; } })(),
    touch: 'ontouchstart' in window,
    mediaDevices: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    midi: !!navigator.requestMIDIAccess,
    gamepad: 'getGamepads' in navigator,
    speech: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    fullscreen: !!document.documentElement.requestFullscreen
  };
  return checks;
}

function showCompatibilityReport() {
  const checks = checkBrowserCompatibility();
  const items = Object.entries(checks).map(([name, ok]) => `
    <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid var(--border);">
      <span style="color:var(--text2);">${name}</span>
      <span style="color:${ok ? 'var(--success)' : 'var(--error)'};font-weight:600;">${ok ? '支持' : '不支持'}</span>
    </div>
  `).join('');
  showModal('浏览器兼容性报告', `<div style="max-height:60vh;overflow:auto;">${items}</div>`, [{ label: '关闭', primary: false }]);
}

/* ================= 性能监控 ================= */

class PerformanceMonitor {
  constructor() {
    this.fps = 0;
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.rafId = null;
    this.listeners = [];
  }

  start() {
    this.rafId = requestAnimationFrame(() => this._tick());
  }

  stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  _tick() {
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastTime = now;
      this.listeners.forEach(cb => { try { cb(this.fps); } catch (e) {} });
    }
    this.rafId = requestAnimationFrame(() => this._tick());
  }

  onFps(cb) { this.listeners.push(cb); }
}

const perfMonitor = new PerformanceMonitor();

/* ================= 内存使用提示 ================= */

function showMemoryUsage() {
  if (performance.memory) {
    const used = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
    const total = (performance.memory.totalJSHeapSize / 1048576).toFixed(1);
    showToast(`内存使用: ${used} MB / ${total} MB`, 'info');
  } else {
    showToast('当前浏览器不支持内存监控', 'warning');
  }
}

/* ================= 调试工具 ================= */

class QingluanDebugger {
  constructor() {
    this.enabled = location.hash.includes('debug');
    this.logs = [];
  }

  log(...args) {
    if (!this.enabled) return;
    this.logs.push({ time: new Date().toISOString(), args });
    console.log('[青鸾]', ...args);
  }

  showOverlay() {
    if (!this.enabled) return;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;bottom:60px;right:12px;z-index:30000;background:rgba(0,0,0,0.85);color:#0f0;padding:10px 14px;border-radius:10px;font-family:monospace;font-size:11px;max-width:280px;max-height:200px;overflow:auto;';
    overlay.innerHTML = `
      <div style="font-weight:bold;margin-bottom:6px;">DEBUG</div>
      <div>FPS: <span id="debug-fps">-</span></div>
      <div>Theme: ${localStorage.getItem('qingluan_theme') || 'default'}</div>
      <div>Audio: ${window.qingluanAudio?.ctx ? 'initialized' : 'none'}</div>
      <div>Notes: ${typeof midiEditor !== 'undefined' ? midiEditor.tracks.reduce((s, t) => s + t.notes.length, 0) : 0}</div>
    `;
    document.body.appendChild(overlay);
    perfMonitor.onFps(fps => {
      const el = document.getElementById('debug-fps');
      if (el) el.textContent = fps;
    });
    perfMonitor.start();
  }
}

const qingluanDebugger = new QingluanDebugger();

/* ================= 全局快捷键增强绑定 ================= */

function initExtendedShortcuts() {
  registerShortcut('ctrl+shift+d', () => { qingluanDebugger.showOverlay(); });
  registerShortcut('ctrl+shift+m', () => { showMemoryUsage(); });
  registerShortcut('ctrl+shift+c', () => { showCompatibilityReport(); });
  registerShortcut('ctrl+shift+e', () => { exportProjectEnhanced(); });
  registerShortcut('ctrl+shift+i', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => { if (e.target.files[0]) importProjectEnhanced(e.target.files[0]); };
    input.click();
  });
  registerShortcut('f5', (e) => { e.preventDefault(); location.reload(); });
  registerShortcut('ctrl+shift+1', () => applyTheme('default'));
  registerShortcut('ctrl+shift+2', () => applyTheme('dark'));
  registerShortcut('ctrl+shift+3', () => applyTheme('geek'));
  registerShortcut('ctrl+shift+4', () => applyTheme('paper'));
  registerShortcut('ctrl+shift+5', () => applyTheme('midnight'));
  registerShortcut('ctrl+shift+6', () => applyTheme('sakura'));
  registerShortcut('ctrl+shift+7', () => applyTheme('forest'));
  registerShortcut('ctrl+shift+8', () => applyTheme('cyberpunk'));
}
initExtendedShortcuts();

/* ================= 服务Worker注册（离线支持占位） ================= */

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      console.log('[青鸾] Service Worker 未注册');
    });
  }
}

/* ================= 初始化完成日志 ================= */

console.log('[青鸾 DAW] 全部扩展模块已就绪');
console.log('[青鸾] 快捷键: ? 查看帮助, Ctrl+Shift+D 调试面板');

/* ================= 音阶与和弦生成器 ================= */

const ScalePatterns = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
};

const ChordPatterns = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
  dominant7: [0, 4, 7, 10],
  diminished7: [0, 3, 6, 9],
  halfDiminished7: [0, 3, 6, 10],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  sixth: [0, 4, 7, 9],
  m6: [0, 3, 7, 9]
};

const NoteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiToNote(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const name = NoteNames[midi % 12];
  return { name, octave, full: name + octave, midi };
}

function noteToMidi(noteName) {
  const match = noteName.match(/^([A-Ga-g]#?b?)(-?\d+)$/);
  if (!match) return null;
  let name = match[1].toUpperCase();
  const octave = parseInt(match[2]);
  const idx = NoteNames.indexOf(name);
  if (idx < 0) return null;
  return (octave + 1) * 12 + idx;
}

function generateScale(rootMidi, scaleType, octaves = 1) {
  const pattern = ScalePatterns[scaleType];
  if (!pattern) return [];
  const notes = [];
  for (let o = 0; o < octaves; o++) {
    pattern.forEach(interval => {
      notes.push(rootMidi + interval + o * 12);
    });
  }
  return notes.map(midiToNote);
}

function generateChord(rootMidi, chordType, inversion = 0) {
  const pattern = ChordPatterns[chordType];
  if (!pattern) return [];
  const notes = pattern.map(interval => rootMidi + interval);
  for (let i = 0; i < inversion; i++) {
    notes.push(notes.shift() + 12);
  }
  return notes.map(midiToNote);
}

function getChordProgression(keyMidi, progression = [1, 5, 6, 4]) {
  const scale = ScalePatterns.major;
  return progression.map(degree => {
    const root = keyMidi + scale[(degree - 1) % 7];
    const isMinor = [2, 3, 6].includes(degree);
    return generateChord(root, isMinor ? 'minor' : 'major');
  });
}

/* ================= 项目模板系统 ================= */

const ProjectTemplates = {
  empty: {
    name: '空白项目',
    tracks: [],
    bpm: 120,
    key: 'C',
    timeSig: [4, 4]
  },
  popSong: {
    name: '流行歌曲模板',
    tracks: [
      { name: '主唱', instrument: 'vocal', notes: [] },
      { name: '钢琴', instrument: 'piano', notes: [] },
      { name: '贝斯', instrument: 'bass', notes: [] },
      { name: '鼓组', instrument: 'drums', notes: [] },
      { name: '吉他', instrument: 'guitar', notes: [] }
    ],
    bpm: 128,
    key: 'C',
    timeSig: [4, 4]
  },
  electronic: {
    name: '电子音乐模板',
    tracks: [
      { name: 'Lead Synth', instrument: 'synth', notes: [] },
      { name: 'Bass', instrument: 'bass', notes: [] },
      { name: 'Kick', instrument: 'kick', notes: [] },
      { name: 'Snare', instrument: 'snare', notes: [] },
      { name: 'HiHat', instrument: 'hihat', notes: [] },
      { name: 'Pad', instrument: 'pad', notes: [] }
    ],
    bpm: 140,
    key: 'A',
    timeSig: [4, 4]
  },
  orchestral: {
    name: '管弦乐模板',
    tracks: [
      { name: '小提琴', instrument: 'violin', notes: [] },
      { name: '中提琴', instrument: 'viola', notes: [] },
      { name: '大提琴', instrument: 'cello', notes: [] },
      { name: '低音提琴', instrument: 'bass', notes: [] },
      { name: '长笛', instrument: 'flute', notes: [] },
      { name: '双簧管', instrument: 'oboe', notes: [] },
      { name: '单簧管', instrument: 'clarinet', notes: [] },
      { name: '巴松', instrument: 'bassoon', notes: [] },
      { name: '圆号', instrument: 'horn', notes: [] },
      { name: '小号', instrument: 'trumpet', notes: [] },
      { name: '长号', instrument: 'trombone', notes: [] },
      { name: '定音鼓', instrument: 'timpani', notes: [] }
    ],
    bpm: 90,
    key: 'C',
    timeSig: [4, 4]
  },
  jazz: {
    name: '爵士乐模板',
    tracks: [
      { name: '钢琴', instrument: 'piano', notes: [] },
      { name: '贝斯', instrument: 'upright_bass', notes: [] },
      { name: '鼓组', instrument: 'drums', notes: [] },
      { name: '萨克斯', instrument: 'saxophone', notes: [] },
      { name: '小号', instrument: 'trumpet', notes: [] }
    ],
    bpm: 120,
    key: 'Bb',
    timeSig: [4, 4]
  },
  ambient: {
    name: '氛围音乐模板',
    tracks: [
      { name: 'Pad 1', instrument: 'pad', notes: [] },
      { name: 'Pad 2', instrument: 'pad', notes: [] },
      { name: 'Texture', instrument: 'texture', notes: [] },
      { name: 'Bass Drone', instrument: 'bass', notes: [] },
      { name: 'Arp', instrument: 'arp', notes: [] }
    ],
    bpm: 80,
    key: 'D',
    timeSig: [4, 4]
  }
};

function loadProjectTemplate(templateId) {
  const template = ProjectTemplates[templateId];
  if (!template) { showToast('未知模板: ' + templateId, 'error'); return null; }
  const project = JSON.parse(JSON.stringify(template));
  project.id = randomId('proj');
  project.createdAt = new Date().toISOString();
  project.tracks.forEach(t => { t.id = randomId('trk'); t.notes = []; });
  showToast('已加载模板: ' + project.name, 'success');
  return project;
}

function showTemplatePicker() {
  const items = Object.entries(ProjectTemplates).map(([id, t]) => `
    <div class="template-item" data-id="${id}" style="padding:12px;border:1px solid var(--border);border-radius:12px;cursor:pointer;transition:all 0.2s;margin-bottom:8px;">
      <div style="font-weight:700;font-size:14px;color:var(--text);">${t.name}</div>
      <div style="font-size:12px;color:var(--text3);margin-top:4px;">${t.tracks.length} 轨道 · ${t.bpm} BPM · ${t.key} 大调</div>
    </div>
  `).join('');
  showModal('选择项目模板', `<div id="template-list">${items}</div>`, [{ label: '取消', primary: false }]);
  document.querySelectorAll('.template-item').forEach(el => {
    el.addEventListener('mouseenter', () => { el.style.borderColor = 'var(--accent)'; el.style.background = 'rgba(91,77,255,0.04)'; });
    el.addEventListener('mouseleave', () => { el.style.borderColor = 'var(--border)'; el.style.background = 'transparent'; });
    el.addEventListener('click', () => {
      loadProjectTemplate(el.dataset.id);
      closeModal();
    });
  });
}

/* ================= 批量处理工具 ================= */

function batchProcess(items, processor, options = {}) {
  const { concurrency = 4, onProgress, onComplete, onError } = options;
  let index = 0;
  let completed = 0;
  let errors = 0;
  const results = [];

  function next() {
    if (index >= items.length) {
      if (completed + errors >= items.length) {
        if (onComplete) onComplete(results, errors);
      }
      return;
    }
    const currentIndex = index++;
    const item = items[currentIndex];
    Promise.resolve()
      .then(() => processor(item, currentIndex))
      .then(result => {
        results[currentIndex] = { success: true, result };
        completed++;
        if (onProgress) onProgress(completed, items.length);
        next();
      })
      .catch(err => {
        results[currentIndex] = { success: false, error: err };
        errors++;
        completed++;
        if (onError) onError(err, item, currentIndex);
        if (onProgress) onProgress(completed, items.length);
        next();
      });
  }

  for (let i = 0; i < Math.min(concurrency, items.length); i++) next();
  return results;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function retry(fn, maxAttempts = 3, delay = 500) {
  return new Promise((resolve, reject) => {
    function attempt(n) {
      fn().then(resolve).catch(err => {
        if (n >= maxAttempts) reject(err);
        else setTimeout(() => attempt(n + 1), delay);
      });
    }
    attempt(1);
  });
}

/* ================= 音频分析工具 ================= */

function detectPitch(buffer, sampleRate = 44100) {
  const len = buffer.length;
  let bestOffset = -1;
  let bestCorr = -Infinity;
  const maxOffset = Math.min(len / 2, sampleRate / 40);
  const minOffset = Math.floor(sampleRate / 800);

  for (let offset = minOffset; offset < maxOffset; offset++) {
    let corr = 0;
    for (let i = 0; i < len - offset; i++) {
      corr += buffer[i] * buffer[i + offset];
    }
    if (corr > bestCorr) { bestCorr = corr; bestOffset = offset; }
  }

  if (bestOffset <= 0) return null;
  const freq = sampleRate / bestOffset;
  return { frequency: freq, note: midiToNote(Math.round(69 + 12 * Math.log2(freq / 440))) };
}

function calculateRMS(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

function calculatePeak(buffer) {
  let peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    const abs = Math.abs(buffer[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}

function normalizeBuffer(buffer, targetPeak = 0.95) {
  const peak = calculatePeak(buffer);
  if (peak === 0) return buffer;
  const gain = targetPeak / peak;
  for (let i = 0; i < buffer.length; i++) buffer[i] *= gain;
  return buffer;
}

function reverseBuffer(buffer) {
  const out = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) out[i] = buffer[buffer.length - 1 - i];
  return out;
}

function trimSilence(buffer, threshold = 0.01) {
  let start = 0;
  let end = buffer.length - 1;
  while (start < buffer.length && Math.abs(buffer[start]) < threshold) start++;
  while (end > start && Math.abs(buffer[end]) < threshold) end--;
  return buffer.slice(start, end + 1);
}

/* ================= 更多实用函数 ================= */

function groupBy(array, key) {
  return array.reduce((result, item) => {
    const group = typeof key === 'function' ? key(item) : item[key];
    if (!result[group]) result[group] = [];
    result[group].push(item);
    return result;
  }, {});
}

function sortBy(array, key, ascending = true) {
  return [...array].sort((a, b) => {
    const av = typeof key === 'function' ? key(a) : a[key];
    const bv = typeof key === 'function' ? key(b) : b[key];
    if (av < bv) return ascending ? -1 : 1;
    if (av > bv) return ascending ? 1 : -1;
    return 0;
  });
}

function uniqueBy(array, key) {
  const seen = new Set();
  return array.filter(item => {
    const val = typeof key === 'function' ? key(item) : item[key];
    if (seen.has(val)) return false;
    seen.add(val);
    return true;
  });
}

function chunk(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) result.push(array.slice(i, i + size));
  return result;
}

function flatten(array, depth = 1) {
  return array.flat(depth);
}

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj);
  if (obj instanceof Array) return obj.map(deepClone);
  if (obj instanceof Object) {
    const copy = {};
    Object.keys(obj).forEach(key => { copy[key] = deepClone(obj[key]); });
    return copy;
  }
  return obj;
}

function deepMerge(target, source) {
  const result = { ...target };
  Object.keys(source).forEach(key => {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  });
  return result;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

function parseQueryString(query = location.search) {
  const params = new URLSearchParams(query);
  const result = {};
  for (const [key, value] of params) result[key] = value;
  return result;
}

function buildQueryString(params) {
  return Object.entries(params).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
}

function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast('已复制到剪贴板', 'success'));
  } else {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    showToast('已复制到剪贴板', 'success');
  }
}

function measureTextWidth(text, font = '13px sans-serif') {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  return ctx.measureText(text).width;
}

/* ================= 初始化全局事件 ================= */

document.addEventListener('DOMContentLoaded', () => {
  // 为所有 studio-panel 添加 data-reveal 属性以实现滚动揭示
  document.querySelectorAll('.studio-panel').forEach(panel => {
    if (!panel.dataset.reveal) panel.dataset.reveal = 'fade-up';
  });

  // 初始化滚动揭示（如果 QingluanAnimations 已加载）
  if (window.QingluanAnimations && window.QingluanAnimations.scrollReveal) {
    window.QingluanAnimations.scrollReveal();
  }

  // 监听在线/离线状态
  window.addEventListener('online', () => showToast('网络已连接', 'success'));
  window.addEventListener('offline', () => showToast('网络已断开', 'warning'));

  // 防止意外关闭（当有未保存内容时）
  window.addEventListener('beforeunload', (e) => {
    if (window.actionHistory && window.actionHistory.canUndo()) {
      e.preventDefault();
      e.returnValue = '您有未保存的更改，确定要离开吗？';
    }
  });

  // 暴露更多工具到全局
  window.generateScale = generateScale;
  window.generateChord = generateChord;
  window.getChordProgression = getChordProgression;
  window.loadProjectTemplate = loadProjectTemplate;
  window.showTemplatePicker = showTemplatePicker;
  window.audioExporter = audioExporter;
  window.deepClone = deepClone;
  window.deepMerge = deepMerge;
  window.copyToClipboard = copyToClipboard;
});

/* ================= 最终日志 ================= */

console.log('[青鸾 DAW] v2.0 全部模块加载完成');
console.log(`[青鸾] 可用功能: PianoRoll, Waveform, Spectrum, Metronome, Tuner, Theme, Shortcuts, Undo/Redo, DragDrop, ContextMenu, Modal, Tooltip, Animations, MIDI Editor, Mixer, Audio Engine, Visualizer, AutoSave, StateManager, EventBus, Scale/Chord Generator, Project Templates, Batch Processing`);

/* ================= 离线音频处理工作线程包装 ================= */

class OfflineAudioProcessor {
  constructor(sampleRate = 44100, channels = 2, duration = 60) {
    this.sampleRate = sampleRate;
    this.channels = channels;
    this.duration = duration;
    this.ctx = null;
  }

  async init() {
    const length = this.sampleRate * this.duration;
    this.ctx = new OfflineAudioContext(this.channels, length, this.sampleRate);
  }

  async render(sourceFn) {
    if (!this.ctx) await this.init();
    sourceFn(this.ctx);
    return this.ctx.startRendering();
  }

  async exportWav(filename = 'render.wav') {
    const buffer = await this.render();
    const blob = bufferToWavBlob(buffer.getChannelData(0), this.sampleRate);
    downloadBlob(blob, filename);
  }
}

/* ================= 琶音器 ================= */

class Arpeggiator {
  constructor() {
    this.pattern = 'up';
    this.octaves = 1;
    this.rate = 0.25;
    this.isRunning = false;
    this.notes = [];
    this.currentIndex = 0;
    this.timer = null;
  }

  setNotes(notes) {
    this.notes = notes;
    this.currentIndex = 0;
  }

  setPattern(pattern) {
    this.pattern = pattern;
  }

  start(onNote) {
    if (this.isRunning || !this.notes.length) return;
    this.isRunning = true;
    const interval = (60 / (_metronome.bpm || 120)) * this.rate * 1000;
    this.timer = setInterval(() => {
      const note = this._getNextNote();
      if (note && onNote) onNote(note);
    }, interval);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) clearInterval(this.timer);
  }

  _getNextNote() {
    const len = this.notes.length;
    if (!len) return null;
    let idx;
    switch (this.pattern) {
      case 'up': idx = this.currentIndex % len; break;
      case 'down': idx = (len - 1) - (this.currentIndex % len); break;
      case 'updown':
        const cycle = len * 2 - 2;
        const pos = this.currentIndex % cycle;
        idx = pos < len ? pos : cycle - pos;
        break;
      case 'random': idx = Math.floor(Math.random() * len); break;
      default: idx = this.currentIndex % len;
    }
    this.currentIndex++;
    return this.notes[idx];
  }
}

/* ================= 步进音序器 ================= */

class StepSequencer {
  constructor(steps = 16, tracks = 4) {
    this.steps = steps;
    this.tracks = tracks;
    this.grid = Array.from({ length: tracks }, () => new Array(steps).fill(false));
    this.currentStep = 0;
    this.isPlaying = false;
    this.bpm = 120;
    this.timer = null;
    this.listeners = [];
  }

  toggle(track, step) {
    if (track >= 0 && track < this.tracks && step >= 0 && step < this.steps) {
      this.grid[track][step] = !this.grid[track][step];
    }
  }

  clear() {
    this.grid = Array.from({ length: this.tracks }, () => new Array(this.steps).fill(false));
    this.emit('clear');
  }

  randomize(density = 0.3) {
    this.grid = this.grid.map(track => track.map(() => Math.random() < density));
    this.emit('randomize');
  }

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    const interval = (60 / this.bpm) * 250;
    this.timer = setInterval(() => {
      this._tick();
    }, interval);
  }

  stop() {
    this.isPlaying = false;
    if (this.timer) clearInterval(this.timer);
    this.currentStep = 0;
  }

  _tick() {
    for (let t = 0; t < this.tracks; t++) {
      if (this.grid[t][this.currentStep]) {
        this.emit('trigger', { track: t, step: this.currentStep });
      }
    }
    this.emit('step', this.currentStep);
    this.currentStep = (this.currentStep + 1) % this.steps;
  }

  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => { try { cb(data); } catch (e) {} });
  }
}

/* ================= 简单合成器 ================= */

class SimpleSynth {
  constructor(audioCtx) {
    this.ctx = audioCtx;
    this.oscillator = null;
    this.gainNode = null;
    this.filter = null;
  }

  play(freq, duration, type = 'sine') {
    const now = this.ctx.currentTime;
    this.oscillator = this.ctx.createOscillator();
    this.gainNode = this.ctx.createGain();
    this.filter = this.ctx.createBiquadFilter();

    this.oscillator.type = type;
    this.oscillator.frequency.setValueAtTime(freq, now);

    this.filter.type = 'lowpass';
    this.filter.frequency.setValueAtTime(2000, now);

    this.gainNode.gain.setValueAtTime(0.3, now);
    this.gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    this.oscillator.connect(this.filter);
    this.filter.connect(this.gainNode);
    this.gainNode.connect(this.ctx.destination);

    this.oscillator.start(now);
    this.oscillator.stop(now + duration);
  }

  playMidi(midi, duration, type = 'sine') {
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    this.play(freq, duration, type);
  }
}

/* ================= 音频播放列表 ================= */

class PlayQueue {
  constructor() {
    this.items = [];
    this.currentIndex = -1;
    this.repeat = 'none'; // none, all, one
    this.shuffle = false;
    this.history = [];
  }

  add(item) { this.items.push(item); }
  remove(index) { this.items.splice(index, 1); }
  clear() { this.items = []; this.currentIndex = -1; }

  next() {
    if (this.shuffle) {
      const remaining = this.items.map((_, i) => i).filter(i => i !== this.currentIndex);
      if (!remaining.length) return null;
      this.currentIndex = remaining[Math.floor(Math.random() * remaining.length)];
    } else {
      this.currentIndex++;
      if (this.currentIndex >= this.items.length) {
        if (this.repeat === 'all') this.currentIndex = 0;
        else return null;
      }
    }
    return this.items[this.currentIndex];
  }

  previous() {
    this.currentIndex = Math.max(0, this.currentIndex - 1);
    return this.items[this.currentIndex];
  }
}

/* ================= 全局暴露 ================= */

window.OfflineAudioProcessor = OfflineAudioProcessor;
window.Arpeggiator = Arpeggiator;
window.StepSequencer = StepSequencer;
window.SimpleSynth = SimpleSynth;
window.PlayQueue = PlayQueue;

/* ================= 最终完成 ================= */

/* ================= 额外工具函数库 ================= */

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(x).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function interpolateColor(color1, color2, factor) {
  const c1 = hexToRgb(color1) || { r: 0, g: 0, b: 0 };
  const c2 = hexToRgb(color2) || { r: 255, g: 255, b: 255 };
  return rgbToHex(
    c1.r + (c2.r - c1.r) * factor,
    c1.g + (c2.g - c1.g) * factor,
    c1.b + (c2.b - c1.b) * factor
  );
}

function randomColor() {
  return rgbToHex(Math.random() * 255, Math.random() * 255, Math.random() * 255);
}

function isDarkColor(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness < 128;
}

function getContrastColor(hex) {
  return isDarkColor(hex) ? '#ffffff' : '#1a1a1a';
}

function parseTimeString(str) {
  const parts = str.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parseFloat(str) || 0;
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sampleArray(array, count) {
  return shuffleArray(array).slice(0, count);
}

function mapRange(value, inMin, inMax, outMin, outMax) {
  return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin));
}

function snapToGrid(value, grid) {
  return Math.round(value / grid) * grid;
}

function wrap(value, min, max) {
  const range = max - min;
  return min + ((((value - min) % range) + range) % range);
}

function isEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(key => isEqual(a[key], b[key]));
}

function memoize(fn, keyFn) {
  const cache = new Map();
  return (...args) => {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

function once(fn) {
  let called = false;
  let result;
  return (...args) => {
    if (called) return result;
    called = true;
    result = fn(...args);
    return result;
  };
}

function poll(fn, interval = 1000) {
  const timer = setInterval(fn, interval);
  return () => clearInterval(timer);
}

function observeElement(element, callback, options = {}) {
  const el = typeof element === 'string' ? document.getElementById(element) : element;
  if (!el) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => callback(entry.isIntersecting, entry));
  }, options);
  observer.observe(el);
  return () => observer.disconnect();
}

function preloadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function preloadAudio(src) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.oncanplaythrough = () => resolve(audio);
    audio.onerror = reject;
    audio.src = src;
  });
}

/* ================= 最终完成 ================= */

console.log('[青鸾 DAW] 系统完全就绪，等待用户指令');

