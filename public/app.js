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
