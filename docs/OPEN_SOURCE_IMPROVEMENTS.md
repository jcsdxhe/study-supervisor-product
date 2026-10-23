# 保留原设计的开源参考与改进建议

核对日期：2026-10-23（Asia/Shanghai）。本次使用 GitHub 连接器读取官方仓库、README、许可证、提交记录及部分实现文件，并与本项目当前工作区对照。

状态：以下对照表与建议保留调研时的 1.7.1 基线，未安装候选项目或新增产品依赖，未运行候选项目进行体验验证。后续 1.7.2 小改进仅落实了课后任务的来源保留、持久化去重、返回原课堂和缺失/保存失败提示；其余建议仍待实施。实现采用本项目独立代码，没有复制上游源码。

## 1. 原有产品方向

继续发展“向前 · 学习督导台”：学习计划、专注督导、成绩与复盘、资料库、AI 语音课堂、题目白板、数学/物理可视化和本地课堂档案。沿用现有中文界面和 Windows 本地优先架构，基础学习管理无密钥可用。

用户明确要求保留原设计思路。此前提出的限定某一门课程、某类学生和研究实验路线不作为本次改进前提。留学申请可以展示这个产品持续演进的真实工程成果，产品自身仍服务原有学习场景。

## 2. 对照当前实现

调研时 `VERSION` 与 `package.json` 为 1.7.1，部分历史交接文档仍标注 1.7.0。下表是当时的静态代码对照；后续 1.7.2 已同步版本基线，具体已实现范围以上方状态说明与 CHANGELOG 为准。

| 模块 | 已有能力 | 值得补充的连接或能力 | 本地核对位置 |
| --- | --- | --- | --- |
| 计划与专注 | 每日任务、A/B 优先级、番茄钟、会话日志 | 会话关联具体任务、带完整日期、区分每日/本周时长、支持恢复与估时对照 | `app.js` 的 `renderToday`、`renderSessions`、`renderReview`、`startClock` |
| 日报与证据 | 独立目标、每日记录、附件、Markdown 导出 | 从任务和课堂导入记录时保留来源，减少重复填写；保留用户手工修改 | `daily-report.ts` |
| 课堂工作室 | 主题、目标、难度、时长、角色、场景配置；统一真实 AI 入口 | 将文字课堂方案推进为可执行章节，保存章节与讲解进度，支持插问后回到原位置 | `classroom-archive.js` 的课堂工作室与启动逻辑、`voice-class.js` |
| 课堂与任务 | 已有“课后作业 → 加入今日执行”按钮 | 保留课堂/作业来源 ID、持久化去重、选择执行日期、从任务返回原课堂 | `classroom-archive.js` 的 `bindHomeworkActions`、`app.js` 的 `classroom:add-homework` |
| 白板 | PDF/图片、多页、自由绘制、形状、文字、撤销重做、PNG 导出 | 选中已绘元素再移动/编辑、对象分组、图形模板、连接线关联；保留题图与教师/个人批注关系 | `whiteboard.js` 的 action、渲染及历史机制 |
| 课堂档案 | 文字、时间轴、页面引用、录屏、可选复盘/作业/答案 | 记录“上次停在哪里、下一步做什么”，支持用户核对后带入下一节课 | `classroom-archive.js`、`review-protocol.js` |

静态代码观察：当前 `startClock` 以每秒递减计数，仅在整轮完成时新增会话；会话存时分字符串而没有完整日期和任务 ID。`renderToday` 与 `renderReview` 都直接汇总全部会话。上述行为适合在任务计时关联阶段一起核对和修正；本次没有做运行时复现，不能把它们表述成已完成的修复。

## 3. 六个开源参考

维护情况为核对时默认分支最新提交，不以星数判断质量。日期按 Asia/Shanghai 转换。六个仓库当时均未归档；维护活跃不等于已经验证适合集成。

| 项目与官方来源 | 已核对的借鉴点 | 融入本项目的方式 | 适配判断 |
| --- | --- | --- | --- |
| [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) | 多场景课堂、讲解/讨论切换、播放进度快照、课堂导出 | 沿用现有课堂中心，补章节目录、插问后继续、进度恢复；后续提供本地课件导出 | 最贴近现有 AI 课堂。当前上游需要 Next.js/React、PostgreSQL 和常驻服务，优先参考机制，避免整体替换现有运行栈 |
| [Super Productivity](https://github.com/super-productivity/super-productivity) | 任务估时、实际计时、日程、专注模式、时间复盘 | 从任务一键开始专注，时长归属该任务，汇入当日日报，展示计划与记录差异 | 最贴近学习督导部分。借鉴数据关系和交互，保留本项目页面、原生 JavaScript 与本地数据 |
| [Excalidraw](https://github.com/excalidraw/excalidraw) | 可编辑图形、图形库、箭头绑定、开放文件格式 | 强化白板对象编辑与常用教学图形，不重复建设已有撤销重做 | 先参考交互和对象模型；直接引入 React 组件需另评估包体、历史兼容和 PDF/AI 事件桥接 |
| [Drawnix](https://github.com/plait-board/drawnix) | 思维导图、流程图、无限画布、Markdown 转导图、插件分层 | 在原白板内加入知识结构图和步骤流程图等可选教学图形 | 作为白板结构图方向参考，与 Excalidraw 互补；首轮不同时引入两套编辑器 |
| [DeepTutor](https://github.com/HKUDS/DeepTutor) | 学习日志把目标、上次会话摘要、下次重点和持续记录分开建模 | 在已有课堂档案上增加用户可检查、修改和删除的学习连续记录 | 借鉴少量领域模型；其 Python/Next.js、执行工具、账户及完整知识库不是本项目的引入前提 |
| [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | 根据复习反馈安排下次复习的调度工具 | 为用户主动加入复习的词汇、知识点或错题生成下次安排，进入原有今日任务 | 可选后续能力。当前 v6 文档要求 Node.js ≥24；现有便携发行的 Node.js 22 需要单独评估版本和浏览器构建兼容，不能直接套用最新版 |

直接核对的实现/说明：

- OpenMAIC：[播放状态与进度类型](https://github.com/THU-MAIC/OpenMAIC/blob/ee300e00c7affa672c08dd8307eedc0759daf86a/lib/playback/types.ts)。包含 `sceneIndex`、`actionIndex`、`sceneId`，以及 idle/playing/paused/live 模式与进度回调。
- OpenMAIC：[启动和课堂导出](https://github.com/THU-MAIC/OpenMAIC/blob/ee300e00c7affa672c08dd8307eedc0759daf86a/packages/docs/content/docs/getting-started.mdx)。离线 HTML、PPTX 和课堂备份能力可作导出流程参考。
- Super Productivity：[任务估时说明](https://github.com/super-productivity/super-productivity/blob/b3ccc4c01450384a8de1ad8d23842d0033c864ef/docs/wiki/4.08-Time-Estimates.md)、[任务模型](https://github.com/super-productivity/super-productivity/blob/b3ccc4c01450384a8de1ad8d23842d0033c864ef/src/app/features/tasks/task.model.ts)。重点是估时与实际记录分离、逐日时长、日期与定时任务的区分。
- Excalidraw：[功能与嵌入边界](https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/README.md)。
- Drawnix：[功能与插件架构](https://github.com/plait-board/drawnix/blob/b138ff867943ddff6c4c79560e10ab6ee3b5600e/README.md)。
- DeepTutor：[学习日志模型](https://github.com/HKUDS/DeepTutor/blob/a31d82624c27d75f4e771d4fcb78dce16470b383/deeptutor/services/learning_journal/models.py)。
- ts-fsrs：[调度用法与运行时要求](https://github.com/open-spaced-repetition/ts-fsrs/blob/afef743be42ea3c76a4755bb1303c3180df4efb6/README.md)。

## 4. 建议实施顺序与验收条件

以下均为候选范围。复杂度是基于代码与架构对照的相对判断，不是工期承诺。

### 第一轮：把学习督导各环节连起来（中等复杂度）

参考 Super Productivity 与 DeepTutor。在现有任务卡上增加“开始专注/进入课堂”，让会话、课堂、课后题和日报共享可追溯的来源关系。已有课后题加入今日执行功能继续沿用。

建议拆成两个可独立交付的步骤：

1. **任务与计时**：增加会话唯一 ID、完整时间、任务关联和可恢复状态；支持估时与记录时长对照。按本地日期计算今日/本周，旧的无日期会话保留为“日期未记录”，不猜测日期。
2. **课堂与复盘**：给已生成的课后任务保留课堂/作业 ID，允许选择日期并持久化去重；用户预览后将课堂摘要或任务记录带入日报，允许编辑，保留手填内容。

验收例子：同一任务的两段专注可分别保存且不重复累计；暂停时间不计入活动时长；后台计时、刷新、系统休眠与时钟变化都有明确行为；今日和本周不会混入日期不明的历史记录；刷新后再次添加同一作业不会重复创建；从任务可回到原课堂，原课堂已删除时显示可理解状态；无密钥仍能使用计划、计时和日报。

这些是计时记录，不能作为用户真实专注程度或学习效果的证明。日程数据涉及迁移，应先备份并保留旧记录。

### 第二轮：让原有 AI 课堂有明确进度（中高复杂度）

参考 OpenMAIC 的播放状态与进度快照。现有“目标—讲解/探究—互动检查—总结”的文字课堂方案，扩展成用户可查看、调整的章节。增加“当前章节、剩余章节、继续、重新讲这一段”等控制，问完问题后返回原章节。

验收例子：课堂展示当前章节；学生插问后能明确返回原进度；失败重试不重复追加板书；刷新可恢复已保存的章节和内容，继续 AI 对话时通过明确操作重建服务端会话；恢复不自动启动麦克风、摄像头或录屏；老师讲解与白板页继续使用现有同步机制。

继续采用受控结构化事件和本地确定性排版/动画。上游的任意 HTML/脚本生成与执行能力不作为本项目实现方案。

### 第三轮：提升原白板的编辑能力（中高复杂度）

参考 Excalidraw 与 Drawnix。先做已绘对象选择、移动、编辑、分组及常用教学图形；再评估箭头关联、流程图和知识导图。PDF 页、教师板书、个人批注仍按现有页面组织。

验收例子：移动/编辑一个对象可撤销重做；旧白板能继续打开；导出与实际画面一致；题图坐标与 AI 锚点不因对象编辑错位；失效的连接线和被删除的对象得到处理；AI 图形仍经过类型、长度、节点数量和坐标预算校验；桌面与触屏完成可视化验收。

### 后续增强：持续复习与本地课件导出

- **可选复习调度**：参考 ts-fsrs，只对用户主动加入复习的内容安排日期，保留反馈记录和手动改期，避免自动改写整周计划。先完成日期和任务模型，再选择兼容版本和离线构建方案。
- **本地学习包**：参考 OpenMAIC 导出体验，把一节课的文字、板书图片、受控动画参数与用户选择的总结导出。先做安全静态阅读和数据备份；媒体单独选入并展示体积。导入内容与生成文本必须校验/转义，不能借导出功能执行模型返回代码。
- **完整备份恢复**：与既有路线图衔接，覆盖计划、日报、白板、资料和可选录屏，并先验证旧数据恢复后再扩展持久化结构。

## 5. 许可证与版本记录

下表为核对提交的根许可证；依赖、素材、字体和单独子包仍需按实际采用范围核对。当前没有复制这些项目的实现源码。

| 项目 | 核对提交 | 默认分支最新提交日期（北京时间） | 根许可证 |
| --- | --- | --- | --- |
| OpenMAIC | `ee300e00c7affa672c08dd8307eedc0759daf86a` | 2026-10-23 | [MIT](https://github.com/THU-MAIC/OpenMAIC/blob/ee300e00c7affa672c08dd8307eedc0759daf86a/LICENSE) |
| Super Productivity | `b3ccc4c01450384a8de1ad8d23842d0033c864ef` | 2026-10-23 | [MIT](https://github.com/super-productivity/super-productivity/blob/b3ccc4c01450384a8de1ad8d23842d0033c864ef/LICENSE) |
| Excalidraw | `1d4dc2c0e6e476911d0760e9c3cf3694f2d43384` | 2026-10-21 | [MIT](https://github.com/excalidraw/excalidraw/blob/1d4dc2c0e6e476911d0760e9c3cf3694f2d43384/LICENSE) |
| Drawnix | `b138ff867943ddff6c4c79560e10ab6ee3b5600e` | 2026-09-07 | [MIT](https://github.com/plait-board/drawnix/blob/b138ff867943ddff6c4c79560e10ab6ee3b5600e/LICENSE) |
| DeepTutor | `a31d82624c27d75f4e771d4fcb78dce16470b383` | 2026-10-19 | [Apache-2.0](https://github.com/HKUDS/DeepTutor/blob/a31d82624c27d75f4e771d4fcb78dce16470b383/LICENSE) |
| ts-fsrs | `afef743be42ea3c76a4755bb1303c3180df4efb6` | 2026-10-22 | [MIT](https://github.com/open-spaced-repetition/ts-fsrs/blob/afef743be42ea3c76a4755bb1303c3180df4efb6/LICENSE) |

OpenMAIC 的 [v0.2.1 许可证](https://github.com/THU-MAIC/OpenMAIC/blob/v0.2.1/LICENSE)确为 AGPL-3.0；当前核对提交为 MIT。旧版本结论不能直接套用到当前版本，当前版本结论也不能反向覆盖旧版本。实际采用时记录准确提交、文件、改动和相应通知。

## 6. 如何体现项目价值

保留这个项目的完整学习流程，以自己的集成工作与验证记录作为成果：任务到课堂的来源追踪、可恢复计时、可中断恢复的教学进度、受控白板渲染、本地备份和可见失败恢复。记录借鉴来源、自己的设计取舍、测试证据与已知限制；不把上游算法或组件描述成自己的原创。

建议先完成第一轮，再推进第二轮。每轮按既有宪章执行需求与验收、数据迁移设计、实现、自动化检查、必要的浏览器验收和文档更新。涉及语音/白板/PDF 时执行有界面 Edge/Chromium 验收；真实 Kimi 调用只在必要时进行。

本次验证范围：官方来源与根许可证读取、固定提交、现有代码静态对照及文档差异检查。尚未验证候选项目运行表现、组件包体、性能、实际学习效果或集成后的许可全貌。

本项目现有 `npm.cmd run check` 已通过（构建、核心功能/隐私检查、安全云代理检查）。首次检查指出许可证说明仍需保留旧版商业许可边界；补充该边界后复查通过，没有修改或放宽测试。此次未调用真实 Kimi API。
