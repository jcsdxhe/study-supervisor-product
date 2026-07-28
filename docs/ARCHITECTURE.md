# 架构说明

## 架构目标

- 基础学习管理在无账号、无网络、无 API Key 时可用；外部 AI 只做渐进增强。
- 用户学习数据默认留在浏览器本机，媒体和模型请求必须由用户显式触发。
- UI、状态、持久化、外部服务与模型协议校验保持边界，失败必须可见且可恢复。
- 不执行模型返回代码；AI 只能通过经过白名单、类型、长度、数量和坐标范围校验的结构化事件提出动作。

## 运行结构

```text
Edge / Chrome
  ├─ 学习计划、计时、成绩、复盘       → localStorage
  ├─ 证据、图片、PDF 页、白板批注      → IndexedDB
  ├─ 摄像头/麦克风/屏幕               → 用户点击后浏览器权限
  └─ AI 请求                          → 默认 127.0.0.1 Node 代理
                                       或同源 HTTPS 安全云代理（显式授权后）
                                          └─ Kimi API（仅用户主动请求）
```

## 主要文件

| 文件 | 职责 |
|---|---|
| `index.html`, `styles.css`, `app.js` | 页面骨架、计划、任务、计时、成绩、复盘和本地数据 |
| `daily-report.ts`, `daily-report.js`, `daily-report.css` | 动态学习目标、每日汇报、统一证据中心、Markdown 导出与模型无关分析器接口 |
| `supervision.js`, `supervision.css` | 专注签到、媒体权限、活动信号、提醒与历史 |
| `whiteboard.js`, `whiteboard.css` | 图片/PDF、多页画布、绘图、IndexedDB、导出 |
| `kimi.js` | 文字辅导、能力边界、自检、建议批注、语音转写入口 |
| `voice-class.js` | 全屏语音课堂、连续问答、TTS 队列、随讲事件应用 |
| `server.js` | 静态服务、环境变量、Kimi 代理、限额、SSE 和输出验证 |
| `package-release.ps1` | 生成不含私密数据的本地发行目录和 ZIP |

## 前后端分层

| 层次 | 组成 | 依赖边界 |
|---|---|---|
| 展示与交互 | `index.html`、各 CSS 文件 | 负责语义结构、响应式布局、权限入口与状态反馈 |
| 浏览器领域模块 | `app.js`、`daily-report.ts`、`supervision.js`、`whiteboard.js`、`kimi.js`、`voice-class.js` | 编排学习、日报、监督、白板和课堂行为，不读取服务端密钥 |
| 浏览器适配器 | localStorage、IndexedDB、Canvas、SpeechRecognition、speechSynthesis、MediaDevices | 封装持久化、绘图、语音和显式媒体权限 |
| 安全代理 | `server.js` | 默认提供本机静态资源与 Kimi 代理；云模式额外提供口令登录、签名 Cookie、来源校验、安全响应头和健康检查 |
| 外部服务 | Kimi Chat Completions | 仅接收用户主动发送的题图或最终文字，不直接访问 DOM 或本地数据 |

依赖方向保持为“展示 → 领域模块 → 浏览器/本机服务适配器”。外部服务只能返回待验证数据，不能直接控制页面、画布或持久化内容。

## 本地数据模型

| 存储 | 内容 | 生命周期与恢复 |
|---|---|---|
| `localStorage` | 计划、任务、计时、成绩、复盘、专注设置、个人资料，以及版本化的动态目标与日报 | 学习状态继续使用 `forward-study-v1`；个人资料使用独立的 `study-supervisor-profile-v1` 版本 `1`；日报使用 `forward-daily-report-v1` 版本 `1`；现有“数据”导出暂不包含个人资料、日报与附件 |
| `IndexedDB` | 统一证据中心附件、导入题图、PDF 栅格页、白板页面与批注历史 | `forward-evidence` 升级为版本 `2`，保留旧 `files` 记录并增加 `reportDate`、`goalId` 索引；发行包不携带实例数据 |
| 服务端内存 | Kimi 会话、一次性能力凭证、请求计数和语音课堂上下文 | Node 进程结束即清除，不作为用户数据备份 |
| `.env` | Kimi 密钥与本机限额配置 | 仅由本机 Node 进程读取，不进入浏览器存储、日志、导出或发行包 |

日报模块新增独立的版本化 localStorage 结构，并将既有证据库从版本 `1` 原位升级到 `2`。升级只添加索引，不删除或改写旧附件；旧记录缺少关联字段时按“未关联目标”显示。若日报 JSON 损坏，模块回退为空结构且不覆盖证据库。完整附件备份/恢复尚未实现，删除证据前必须二次确认。

任务和成绩的编辑/删除沿用既有 `forward-study-v1` 数组结构，没有数据迁移；旧记录原位兼容。个人管理采用独立 `study-supervisor-profile-v1`，损坏或未知版本会回退到默认资料而不覆盖学习状态。白板右键删除复用既有 IndexedDB 页面删除事务，不改变数据库版本；删除前必须确认，删除页面及其批注后不可撤销。

## 日报分析器扩展边界

`DailyReportAnalyzer` 是模型无关的 TypeScript 接口。提供方通过 `window.DailyReportAI.register()` 注册，只能在未来的显式用户操作中收到只读日报、目标和证据元数据；首版没有注册任何实现，也没有网络请求。后续接入 OpenAI、Claude、Kimi 或本地模型时，密钥仍须留在本机服务端环境变量，响应必须先经过结构、长度和数量校验，失败与取消必须可见且可恢复。

## AI 请求边界

```text
用户确认发送
  → 浏览器生成当前画布/选区与最终问题文字
  → 默认 127.0.0.1 Node 代理，或已解锁的同源 HTTPS 云代理
  → 代理校验认证、来源、大小、模型、限额和会话
  → Kimi Chat Completions
  → 服务端解析并校验 JSON / JSONL / SSE
  → 浏览器显示回答；批注事件经用户确认或课堂授权后进入白板 action
```

密钥永不下发浏览器。网络错误、超时、限额、协议错误和能力门拦截都必须返回明确状态；不得用未校验文本直接改动白板。

## 语音课堂协议

1. `/api/kimi/voice/start` 接收当前题图一次，得到题目转写、知识点和归一化区域 anchors。
2. `/api/kimi/voice/turn` 只接收后续最终问题文字，并流式解析 JSONL：
   - `say`：适合朗读的一至两句话；
   - `mark`：引用 anchor，在原题图上画 highlight/circle/rect/arrow；
   - `board`：将公式或推导写到板书页。
3. 浏览器将 `say` 送入 speechSynthesis，将画布事件交给 `LocalWhiteboard`。提示协议要求 `mark`、`board`、`plot` 或 `motion` 先于解释它的 `say`；客户端把当时的页面 ID 写入朗读队列，并在句子真正开始朗读时切换页面。
4. `board` 事件只接受有序文字与颜色，忽略模型坐标；`LocalWhiteboard.applyTeachingBoard` 负责换行、行高、游标和自动续页，确保新增板书矩形互不重叠。
5. 课堂页面浏览器只保存本次前端会话中的页面引用和预览，实际原题、板书与教学图仍复用 IndexedDB 白板页。用户点击缩略图后进入手动回看状态，后续事件只更新页面列表而不抢屏；恢复自动跟随后才切到最新讲解页。此变更不新增持久化结构或迁移。
6. 模型输出先经服务端类型、颜色、数量和长度约束；网页不执行模型代码。

语音识别和提交是两个状态：SpeechRecognition 可连续产生临时/最终片段，但默认只更新可编辑输入框；用户确认后才调用 `/voice/turn`。可选自动提交使用 2.2 秒本地防抖。老师朗读、模型请求和页面后台状态都会停止识别；麦克风屏蔽是默认状态，“打断老师”只取消 SSE/朗读，不会隐式打开麦克风。

## 可安装 Web App 边界

`manifest.webmanifest`、`pwa.js` 与 `sw.js` 提供渐进式安装和基础离线壳。Service Worker 仅处理同源 GET 静态资源，显式绕过 `/api/`、POST 和跨源请求；因此不会持久化 Kimi 会话、题图请求或回答。PWA 不改变 localStorage/IndexedDB 数据模型。

Node 服务默认仍只监听 `127.0.0.1`。仅当 `ALLOW_CLOUD_PROXY=true` 且 Kimi Key、访问口令、签名密钥和 HTTPS Origin 全部有效时才监听 `0.0.0.0`。云模式的访问口令不进入 Cookie；服务签发 1–72 小时的 HMAC 会话 Cookie，默认 12 小时。学习数据模型没有变化，云端不新增数据库。

云模式静态网页可以公开加载，但所有 Kimi API 在认证前返回 401。登录和 API POST 必须来自部署 Origin；错误登录按转发来源窗口限速。容器构建采用白名单 COPY 与白名单 `.dockerignore`，不把 `.env`、测试产物或用户文件发送进镜像上下文。

## 建议的数学绘图扩展

以下是尚未实现的扩展设计，不属于 1.4.0 已交付能力。计划新增经过 JSON Schema 校验的 `plot` 事件，不允许返回或执行 JavaScript：

```json
{
  "type": "function_plot",
  "expressions": [{"source": "exp(x*x)*sin(x)", "color": "#2979ff"}],
  "domain": [-2, 2],
  "range": [-4, 4],
  "features": ["zeros", "extrema"],
  "annotations": [{"kind": "point", "x": 0, "label": "驻点"}]
}
```

本机解析器必须使用白名单函数、AST 和计算预算；禁止 `eval`、`Function`、属性访问、网络请求或任意代码。渲染器建议优先 JSXGraph 或受控 Canvas/SVG，Plotly 可用于统计图和三维图。绘图应成为白板 action，支持撤销、重做、导出和逐步显现。

扩展验收至少覆盖：非法表达式拒绝、节点/采样/时间预算、奇点与非有限值、坐标范围裁剪、确定性渲染、撤销重做、导出以及 headed Edge/Chromium 视觉回归。引入第三方绘图库前还需评估许可证、包体积、维护状态和离线发行影响。

## 通用扩展方式

- 新学习模块：隔离状态、规则与渲染；为持久化键定义版本，并覆盖导入、导出、迁移和损坏恢复。
- 新白板工具：实现统一 action 的创建、渲染、撤销、重做、序列化和导出，不绕过历史栈直接修改画布。
- 新 AI 事件：先定义 JSON Schema、白名单、数量/长度/坐标预算和拒绝策略，再实现服务端验证与前端渲染。
- 新模型供应商：保持浏览器协议稳定，在 Node 侧增加 provider adapter；密钥继续只来自服务端环境变量。
- 新浏览器能力：采用渐进增强，必须覆盖不支持、权限拒绝、权限撤销和中途失败时的基础回退。
- 新依赖：先评估必要性、许可证、维护状态、体积、离线可用性和发行影响，再纳入构建与安全检查。
