const STORAGE_KEY = 'forward-daily-report-v1';
const DB_NAME = 'forward-evidence';
const DB_VERSION = 2;
const FILE_STORE = 'files';
const COLORS = ['#2e7862', '#4c78a8', '#d89c42', '#8a65a8', '#c95a52', '#4f8b88'];
const STATUS_LABELS = {
    not_started: '未开始', in_progress: '进行中', completed: '已完成'
};
const analyzers = new Map();
window.DailyReportAI = {
    register(analyzer) {
        if (!analyzer?.id || !analyzer.displayName || typeof analyzer.analyze !== 'function') {
            throw new TypeError('日报分析器必须提供 id、displayName 和 analyze 方法');
        }
        if (analyzers.has(analyzer.id))
            throw new Error(`日报分析器 ${analyzer.id} 已注册`);
        analyzers.set(analyzer.id, analyzer);
    },
    get: id => analyzers.get(id),
    list: () => [...analyzers.values()].map(({ id, displayName }) => ({ id, displayName }))
};
function uid(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function todayKey() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
function emptyStore() {
    return { version: 1, goals: [], reports: {} };
}
function loadStore() {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.goals) || !parsed.reports)
            return emptyStore();
        return parsed;
    }
    catch {
        return emptyStore();
    }
}
function blankReport(date, goals) {
    return {
        date,
        entries: goals.filter(goal => !goal.isArchived).map(goal => ({ goalId: goal.id, task: '', status: 'not_started', minutes: 0, note: '' })),
        biggestGain: '', biggestMistake: '', tomorrowFocus: '', updatedAt: new Date().toISOString()
    };
}
function syncEntries(report, goals) {
    const entries = [...report.entries];
    for (const goal of goals.filter(item => !item.isArchived)) {
        if (!entries.some(entry => entry.goalId === goal.id))
            entries.push({ goalId: goal.id, task: '', status: 'not_started', minutes: 0, note: '' });
    }
    return { ...report, entries };
}
function saveStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}
function openEvidenceDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            const files = db.objectStoreNames.contains(FILE_STORE)
                ? request.transaction.objectStore(FILE_STORE)
                : db.createObjectStore(FILE_STORE, { keyPath: 'id', autoIncrement: true });
            if (!files.indexNames.contains('reportDate'))
                files.createIndex('reportDate', 'reportDate', { unique: false });
            if (!files.indexNames.contains('goalId'))
                files.createIndex('goalId', 'goalId', { unique: false });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
function getEvidence() {
    return openEvidenceDB().then(db => new Promise((resolve, reject) => {
        const request = db.transaction(FILE_STORE).objectStore(FILE_STORE).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    }));
}
function putEvidence(records) {
    return openEvidenceDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(FILE_STORE, 'readwrite');
        for (const record of records)
            tx.objectStore(FILE_STORE).add(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    }));
}
function deleteEvidence(id) {
    return openEvidenceDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(FILE_STORE, 'readwrite');
        tx.objectStore(FILE_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    }));
}
function evidenceKind(file) {
    if (file.type.startsWith('image/'))
        return 'image';
    if (file.type.startsWith('video/'))
        return 'video';
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
        return 'pdf';
    return 'file';
}
function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function markdownFor(report, goals, evidence) {
    const goalMap = new Map(goals.map(goal => [goal.id, goal.name]));
    const lines = [`# 学习日报 · ${report.date}`, '', `> 本地生成于 ${new Date(report.updatedAt).toLocaleString('zh-CN')}`, ''];
    for (const entry of report.entries) {
        const goalName = goalMap.get(entry.goalId);
        if (!goalName)
            continue;
        lines.push(`## ${goalName}`, '', `- 今日任务：${entry.task || '未填写'}`, `- 完成情况：${STATUS_LABELS[entry.status]}`, `- 学习时长：${Math.max(0, entry.minutes || 0)} 分钟`, `- 备注：${entry.note || '无'}`, '');
    }
    lines.push('## 今日复盘', '', `- 最大收获：${report.biggestGain || '未填写'}`, `- 最大失误：${report.biggestMistake || '未填写'}`, `- 明天重点：${report.tomorrowFocus || '未填写'}`, '');
    const related = evidence.filter(item => item.reportDate === report.date);
    lines.push('## 学习证据', '');
    if (!related.length)
        lines.push('- 暂无证据');
    for (const item of related) {
        const target = item.goalId ? goalMap.get(item.goalId) || '未分类目标' : '通用';
        lines.push(item.kind === 'note' ? `- [${target}] 笔记：${item.note || item.name}` : `- [${target}] ${item.name}${item.note ? `：${item.note}` : ''}`);
    }
    lines.push('', '> 说明：附件仅保存在本机浏览器中，Markdown 只列出文件名与说明，不会嵌入或上传文件。');
    return lines.join('\n');
}
class DailyReportPage {
    constructor() {
        this.store = loadStore();
        this.date = todayKey();
        this.evidence = [];
    }
    async init() {
        this.installShell();
        this.root = document.querySelector('#daily-report');
        this.ensureReport();
        try {
            this.evidence = await getEvidence();
        }
        catch {
            this.notify('证据库暂时无法读取，请刷新后重试');
        }
        this.render();
        this.bindGlobalActions();
        window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
    installShell() {
        if (!document.querySelector('link[href="daily-report.css"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'daily-report.css';
            document.head.append(link);
        }
        const nav = document.querySelector('#nav');
        if (nav && !nav.querySelector('a[href="#daily-report"]')) {
            const anchor = document.createElement('a');
            anchor.href = '#daily-report';
            anchor.innerHTML = '<i>▤</i>每日汇报';
            nav.querySelector('a[href="#plan"]')?.before(anchor);
            anchor.onclick = () => document.querySelector('.sidebar')?.classList.remove('open');
        }
        if (!document.querySelector('#daily-report')) {
            const page = document.createElement('section');
            page.id = 'daily-report';
            page.className = 'page';
            document.querySelector('#plan')?.before(page);
        }
    }
    ensureReport() {
        const existing = this.store.reports[this.date] || blankReport(this.date, this.store.goals);
        return this.store.reports[this.date] = syncEntries(existing, this.store.goals);
    }
    render() {
        const report = this.ensureReport();
        const activeGoals = this.store.goals.filter(goal => !goal.isArchived);
        this.root.innerHTML = `
      <div class="section-title report-title"><div><span class="eyebrow">DAILY REPORT</span><h2>每日学习汇报</h2><p>动态记录目标、成果与本地学习证据</p></div><label class="report-date">汇报日期<input id="reportDate" type="date" value="${this.date}"></label></div>
      <div class="privacy-banner compact"><span>🔒</span><div><strong>本地优先</strong><p>日报与附件只保存在当前浏览器。首版不调用任何 AI；未来分析器必须由你主动选择并触发。</p></div></div>
      <div class="report-layout"><div class="report-main">
        <div class="card report-card"><div class="card-head"><div><span class="eyebrow">LEARNING GOALS</span><h3>今日目标</h3></div><button class="primary" id="addReportGoal">＋ 添加目标</button></div>
        <div id="reportGoalList" class="goal-entry-list">${activeGoals.length ? activeGoals.map(goal => this.goalCard(goal, report)).join('') : '<div class="report-empty"><strong>还没有学习目标</strong><p>添加“教资”“英语”或任何你正在推进的目标，之后每天都可以复用。</p></div>'}</div></div>
        <div class="card report-card"><div class="card-head"><div><span class="eyebrow">REFLECTION</span><h3>今日复盘</h3></div><span class="save-state" id="reportSaveState">已保存在本机</span></div><div class="reflection-grid">
          <label>今天最大收获<textarea data-report-field="biggestGain" placeholder="今天真正学会了什么？">${escapeHtml(report.biggestGain)}</textarea></label>
          <label>今天最大失误<textarea data-report-field="biggestMistake" placeholder="哪里浪费了时间或判断失误？">${escapeHtml(report.biggestMistake)}</textarea></label>
          <label>明天重点<textarea data-report-field="tomorrowFocus" placeholder="明天最值得优先推进的一件事">${escapeHtml(report.tomorrowFocus)}</textarea></label>
        </div></div>
      </div><aside class="report-side">
        <div class="card report-card evidence-center"><div class="card-head"><div><span class="eyebrow">EVIDENCE CENTER</span><h3>证据中心</h3></div><span class="evidence-count">${this.evidence.length} 项</span></div>
          <p class="report-help">统一保存图片、视频、PDF 与文字笔记，可关联日期和学习目标。</p>
          <label>本次上传关联目标<select id="evidenceUploadGoal"><option value="">不关联目标</option>${activeGoals.map(goal => `<option value="${goal.id}">${escapeHtml(goal.name)}</option>`).join('')}</select></label>
          <label class="evidence-upload"><input id="reportEvidenceFiles" type="file" multiple accept="image/*,video/*,application/pdf,.pdf"><span>＋ 上传图片 / 视频 / PDF</span></label>
          <button class="ghost full-width" id="addEvidenceNote">＋ 添加文字笔记</button>
          <div class="evidence-items">${this.renderEvidenceItems()}</div>
        </div>
        <div class="card report-card markdown-card"><div><span class="eyebrow">MARKDOWN EXPORT</span><h3>生成日报</h3><p class="report-help">生成前会自动保存当前输入。</p></div><button class="primary full-width" id="copyReportMarkdown">复制 Markdown</button><button class="ghost full-width" id="downloadReportMarkdown">下载 .md 文件</button><button class="text-button" id="previewReportMarkdown">预览日报</button></div>
      </aside></div>`;
        this.bindRenderedActions();
    }
    goalCard(goal, report) {
        const entry = report.entries.find(item => item.goalId === goal.id);
        return `<article class="goal-entry" data-goal-id="${goal.id}" style="--goal-color:${goal.color}"><div class="goal-entry-head"><div><span class="goal-dot"></span><strong>${escapeHtml(goal.name)}</strong></div><button class="text-button archive-goal" title="从今后的日报中移除">归档</button></div><div class="goal-fields">
      <label>今日任务<textarea data-entry-field="task" placeholder="例如：完成两章课程并整理错题">${escapeHtml(entry.task)}</textarea></label>
      <label>完成情况<select data-entry-field="status">${Object.entries(STATUS_LABELS).map(([value, label]) => `<option value="${value}" ${entry.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label>学习时长（分钟）<input data-entry-field="minutes" type="number" min="0" max="1440" value="${entry.minutes || 0}"></label>
      <label class="goal-note">备注<textarea data-entry-field="note" placeholder="成果、卡点或补充说明">${escapeHtml(entry.note)}</textarea></label>
    </div></article>`;
    }
    renderEvidenceItems() {
        const goalMap = new Map(this.store.goals.map(goal => [goal.id, goal.name]));
        const recent = [...this.evidence].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
        if (!recent.length)
            return '<div class="report-empty small">还没有证据</div>';
        return recent.map(item => `<div class="evidence-item"><span class="evidence-kind">${item.kind === 'image' ? '图' : item.kind === 'video' ? '影' : item.kind === 'pdf' ? 'PDF' : item.kind === 'note' ? '记' : '件'}</span><div><strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong><small>${item.reportDate || item.date.slice(0, 10)} · ${escapeHtml(item.goalId ? goalMap.get(item.goalId) || '已归档目标' : '未关联目标')}</small></div><button class="text-button delete-evidence" data-evidence-id="${item.id}" aria-label="删除 ${escapeHtml(item.name)}">删除</button></div>`).join('');
    }
    bindRenderedActions() {
        document.querySelector('#reportDate').onchange = event => {
            this.flushForm();
            this.date = event.target.value || todayKey();
            this.ensureReport();
            this.render();
        };
        document.querySelector('#addReportGoal').addEventListener('click', () => this.openGoalDialog());
        document.querySelectorAll('[data-entry-field], [data-report-field]').forEach(input => input.addEventListener('input', () => this.queueSave()));
        document.querySelectorAll('.archive-goal').forEach(button => button.onclick = () => {
            const id = button.closest('[data-goal-id]').dataset.goalId;
            const goal = this.store.goals.find(item => item.id === id);
            if (goal)
                goal.isArchived = true;
            this.flushForm();
            saveStore(this.store);
            this.render();
            this.notify('目标已归档，历史日报仍会保留');
        });
        document.querySelector('#reportEvidenceFiles').onchange = event => this.addFiles(event.target.files);
        document.querySelector('#addEvidenceNote').addEventListener('click', () => this.openNoteDialog());
        document.querySelectorAll('.delete-evidence').forEach(button => button.onclick = async () => {
            const id = Number(button.dataset.evidenceId);
            if (!id || !confirm('确定删除这项本地证据？此操作无法撤销。'))
                return;
            await deleteEvidence(id);
            this.evidence = this.evidence.filter(item => item.id !== id);
            this.render();
            this.notify('证据已从本机删除');
        });
        document.querySelector('#copyReportMarkdown').addEventListener('click', () => this.copyMarkdown());
        document.querySelector('#downloadReportMarkdown').addEventListener('click', () => this.downloadMarkdown());
        document.querySelector('#previewReportMarkdown').addEventListener('click', () => this.previewMarkdown());
    }
    bindGlobalActions() {
        window.addEventListener('beforeunload', () => this.flushForm());
    }
    queueSave() {
        const state = document.querySelector('#reportSaveState');
        if (state)
            state.textContent = '正在保存…';
        window.clearTimeout(this.saveTimer);
        this.saveTimer = window.setTimeout(() => { this.flushForm(); if (state)
            state.textContent = '已保存在本机'; }, 350);
    }
    flushForm() {
        if (!this.root?.isConnected)
            return;
        const report = this.ensureReport();
        this.root.querySelectorAll('[data-goal-id]').forEach(card => {
            const entry = report.entries.find(item => item.goalId === card.dataset.goalId);
            if (!entry)
                return;
            card.querySelectorAll('[data-entry-field]').forEach(input => {
                const key = input.dataset.entryField;
                if (key === 'minutes')
                    entry.minutes = Math.min(1440, Math.max(0, Number(input.value) || 0));
                else if (key === 'status')
                    entry.status = input.value;
                else if (key === 'task')
                    entry.task = input.value;
                else if (key === 'note')
                    entry.note = input.value;
            });
        });
        this.root.querySelectorAll('[data-report-field]').forEach(input => {
            const key = input.dataset.reportField;
            report[key] = input.value;
        });
        report.updatedAt = new Date().toISOString();
        saveStore(this.store);
    }
    openGoalDialog() {
        const dialog = document.querySelector('#modal');
        document.querySelector('#modalTitle').textContent = '添加学习目标';
        document.querySelector('#modalBody').innerHTML = `<div class="modal-fields"><label>目标名称<input id="newGoalName" maxlength="40" placeholder="例如：教资、英语、数学、编程项目"></label><label>识别颜色<div class="goal-color-list">${COLORS.map((color, index) => `<label style="--swatch:${color}"><input type="radio" name="goalColor" value="${color}" ${index === 0 ? 'checked' : ''}><span></span></label>`).join('')}</div></label><button type="button" class="primary" id="saveNewGoal">保存目标</button></div>`;
        dialog.showModal();
        document.querySelector('#saveNewGoal').addEventListener('click', () => {
            const name = document.querySelector('#newGoalName').value.trim();
            if (!name)
                return this.notify('请填写目标名称');
            if (this.store.goals.some(goal => !goal.isArchived && goal.name === name))
                return this.notify('这个目标已经存在');
            const color = document.querySelector('input[name="goalColor"]:checked').value;
            this.store.goals.push({ id: uid('goal'), name, color, isArchived: false, createdAt: new Date().toISOString() });
            this.ensureReport();
            saveStore(this.store);
            dialog.close();
            this.render();
            this.notify('学习目标已添加');
        });
    }
    openNoteDialog() {
        const goals = this.store.goals.filter(goal => !goal.isArchived);
        const dialog = document.querySelector('#modal');
        document.querySelector('#modalTitle').textContent = '添加证据笔记';
        document.querySelector('#modalBody').innerHTML = `<div class="modal-fields"><label>笔记内容<textarea id="evidenceNoteText" maxlength="2000" placeholder="记录要点、收获或需要复查的内容"></textarea></label><label>关联目标<select id="evidenceNoteGoal"><option value="">不关联目标</option>${goals.map(goal => `<option value="${goal.id}">${escapeHtml(goal.name)}</option>`).join('')}</select></label><button type="button" class="primary" id="saveEvidenceNote">保存笔记</button></div>`;
        dialog.showModal();
        document.querySelector('#saveEvidenceNote').addEventListener('click', async () => {
            const note = document.querySelector('#evidenceNoteText').value.trim();
            if (!note)
                return this.notify('请填写笔记内容');
            const goalId = document.querySelector('#evidenceNoteGoal').value || undefined;
            await putEvidence([{ name: note.slice(0, 30), type: 'text/plain', size: new Blob([note]).size, kind: 'note', note, goalId, reportDate: this.date, date: new Date().toISOString() }]);
            this.evidence = await getEvidence();
            dialog.close();
            this.render();
            this.notify('笔记已加入证据中心');
        });
    }
    async addFiles(list) {
        const files = [...(list || [])];
        if (!files.length)
            return;
        const maxBytes = 100 * 1024 * 1024;
        const accepted = files.filter(file => file.size <= maxBytes && (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')));
        if (accepted.length !== files.length)
            this.notify('已跳过不支持或超过 100MB 的文件');
        if (!accepted.length)
            return;
        const goalId = document.querySelector('#evidenceUploadGoal')?.value || undefined;
        await putEvidence(accepted.map(file => ({ name: file.name.slice(0, 240), type: file.type, size: file.size, kind: evidenceKind(file), goalId, reportDate: this.date, date: new Date().toISOString(), blob: file })));
        this.evidence = await getEvidence();
        this.render();
        this.notify(`已将 ${accepted.length} 项证据保存在本机`);
    }
    currentMarkdown() { this.flushForm(); return markdownFor(this.ensureReport(), this.store.goals, this.evidence); }
    async copyMarkdown() {
        const markdown = this.currentMarkdown();
        try {
            await navigator.clipboard.writeText(markdown);
            this.notify('Markdown 日报已复制');
        }
        catch {
            this.previewMarkdown();
            this.notify('浏览器未授权剪贴板，请从预览中手动复制');
        }
    }
    downloadMarkdown() {
        const url = URL.createObjectURL(new Blob([this.currentMarkdown()], { type: 'text/markdown;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `学习日报-${this.date}.md`;
        anchor.click();
        URL.revokeObjectURL(url);
        this.notify('Markdown 日报已导出');
    }
    previewMarkdown() {
        const dialog = document.querySelector('#modal');
        document.querySelector('#modalTitle').textContent = `日报预览 · ${this.date}`;
        document.querySelector('#modalBody').innerHTML = `<textarea class="markdown-preview" readonly>${escapeHtml(this.currentMarkdown())}</textarea>`;
        dialog.showModal();
    }
    notify(message) {
        const element = document.querySelector('#toast');
        if (!element)
            return;
        element.textContent = message;
        element.classList.add('show');
        window.setTimeout(() => element.classList.remove('show'), 2400);
    }
}
new DailyReportPage().init();
export {};
