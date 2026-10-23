'use strict';
const assert = require('node:assert/strict');
const H = require('../homework-tasks');

const oldTask = {id: 7, title: '原有任务', day: 4, done: false};
const homework = {id: 'q1', type: '积分', question: '计算定积分，并写出步骤。', difficulty: '挑战'};
const original = [oldTask];
const first = H.plan(original, 'lesson-a', homework, 4);
assert.equal(first.added, true);
assert.equal(first.task.p, 'A');
assert.equal(first.task.day, 4);
assert.equal(first.task.source.sessionId, 'lesson-a');
assert.deepEqual(original, [oldTask], 'planning must not mutate data before persistence succeeds');

const restored = JSON.parse(JSON.stringify([...original, first.task]));
restored[1].title = '已编辑的作业标题';
restored[1].done = true;
restored[1].day = 1;
const duplicate = H.plan(restored, 'lesson-a', homework, 5);
assert.equal(duplicate.added, false, 'reload, completion, editing and rescheduling must preserve deduplication');
assert.equal(duplicate.task.title, '已编辑的作业标题');
assert.equal(duplicate.task.day, 1);
assert.equal(duplicate.task.done, true);
assert.equal(H.plan(restored, 'lesson-b', homework, 4).added, true, 'different lessons are independent');
assert.equal(H.plan(restored, 'lesson-a', {...homework, question: '解释微积分基本定理。'}, 4).added, true,
  'regenerated content must not be hidden when a model reuses q1');
assert.equal(H.plan(restored.filter(task => task.id !== first.task.id), 'lesson-a', homework, 4).added, true,
  'a deliberately deleted task can be added again');
assert.equal(H.find([oldTask], H.sourceFor('lesson-a', homework)), null, 'legacy tasks remain untouched');
assert.equal(H.readSource({...first.task.source, version: 99}), null);
assert.equal(H.readSource({...first.task.source, sessionId: {}}), null);
assert.equal(H.readSource({...first.task.source, type: 'external-link'}), null);
assert.throws(() => H.plan(original, '', homework, 4));
assert.throws(() => H.plan(original, 'lesson-a', {...homework, id: 'x'.repeat(31)}, 4));
assert.throws(() => H.plan(original, 'lesson-a', {...homework, question: 'x'.repeat(1801)}, 4));
assert.throws(() => H.plan(original, 'lesson-a', {...homework, question: ''}, 4));
assert.throws(() => H.plan(original, 'lesson-a', homework, 7));
console.log('✓ 课后任务持久化去重、来源关联、旧数据兼容与边界检查通过');
