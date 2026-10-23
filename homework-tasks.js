(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HomeworkTasks = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';

  function boundedText(value, limit) {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text && text.length <= limit ? text : null;
  }

  function readSource(value) {
    if (!value || value.version !== 1 || value.type !== 'classroom-homework') return null;
    const sessionId = boundedText(value.sessionId, 100);
    const homeworkId = boundedText(value.homeworkId, 30);
    const question = boundedText(value.question, 1800);
    return sessionId && homeworkId && question
      ? {version: 1, type: 'classroom-homework', sessionId, homeworkId, question}
      : null;
  }

  function sourceFor(sessionId, homework) {
    const source = readSource({version: 1, type: 'classroom-homework', sessionId,
      homeworkId: homework?.id, question: homework?.question});
    if (!source) throw new Error('课后题来源无效，请重新打开课堂后再试');
    return source;
  }

  function find(tasks, source) {
    const wanted = readSource(source);
    if (!wanted || !Array.isArray(tasks)) return null;
    return tasks.find(task => {
      const existing = readSource(task?.source);
      // Include the question because a regenerated review can reuse a question ID.
      return existing && existing.sessionId === wanted.sessionId &&
        existing.homeworkId === wanted.homeworkId && existing.question === wanted.question;
    }) || null;
  }

  function plan(tasks, sessionId, homework, day) {
    if (!Array.isArray(tasks) || !Number.isInteger(day) || day < 0 || day > 6) {
      throw new Error('任务数据无效，请先恢复有效的本地备份');
    }
    const source = sourceFor(sessionId, homework);
    const existing = find(tasks, source);
    if (existing) return {added: false, task: existing};
    let id = 0;
    for (const task of tasks) {
      if (Number.isSafeInteger(task?.id) && task.id > id) id = task.id;
    }
    if (!Number.isSafeInteger(id + 1)) throw new Error('任务编号已超出范围');
    const label = boundedText(homework.type, 80) || '课堂练习';
    return {added: true, task: {
      id: id + 1, title: `课后练习：${label}`.slice(0, 80),
      detail: source.question.slice(0, 300), time: '待安排',
      p: homework.difficulty === '挑战' ? 'A' : 'B', day, done: false, source
    }};
  }

  return {readSource, sourceFor, find, plan};
});
