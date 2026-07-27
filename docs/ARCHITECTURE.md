# 架构说明

## 运行结构

```text
Edge / Chrome
  ├─ 学习计划、计时、成绩、复盘       → localStorage
  ├─ 证据、图片、PDF 页、白板批注      → IndexedDB
  ├─ 摄像头/麦克风/屏幕               → 用户点击后浏览器权限
  └─ AI 请求                          → 127.0.0.1 Node 代理
                                          └─ Kimi API（仅用户主动请求）
```

## 主要文件

| 文件 | 职责 |
|---|---|
| `index.html`, `styles.css`, `app.js` | 页面骨架、计划、任务、计时、成绩、复盘和本地数据 |
| `supervision.js`, `supervision.css` | 专注签到、媒体权限、活动信号、提醒与历史 |
| `whiteboard.js`, `whiteboard.css` | 图片/PDF、多页画布、绘图、IndexedDB、导出 |
| `kimi.js` | 文字辅导、能力边界、自检、建议批注、语音转写入口 |
| `voice-class.js` | 全屏语音课堂、连续问答、TTS 队列、随讲事件应用 |
| `server.js` | 静态服务、环境变量、Kimi 代理、限额、SSE 和输出验证 |
| `package-release.ps1` | 生成不含私密数据的本地发行目录和 ZIP |

## 语音课堂协议

1. `/api/kimi/voice/start` 接收当前题图一次，得到题目转写、知识点和归一化区域 anchors。
2. `/api/kimi/voice/turn` 只接收后续最终问题文字，并流式解析 JSONL：
   - `say`：适合朗读的一至两句话；
   - `mark`：引用 anchor，在原题图上画 highlight/circle/rect/arrow；
   - `board`：将公式或推导写到板书页。
3. 浏览器将 `say` 送入 speechSynthesis，将画布事件交给 `LocalWhiteboard`。
4. 模型输出先经服务端类型、颜色、坐标、数量和长度约束；网页不执行模型代码。

## 建议的数学绘图扩展

新增经过 JSON Schema 校验的 `plot` 事件，不允许返回或执行 JavaScript：

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
