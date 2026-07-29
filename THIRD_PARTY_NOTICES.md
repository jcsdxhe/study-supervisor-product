# 第三方开源项目与设计参考

本项目重视开源社区的贡献。以下项目为课堂、资料库、录屏与学习管理设计提供了重要参考。当前仓库没有直接打包或运行这些项目的完整代码；若未来引入具体源码或发布的 SDK，将在本文件记录精确版本、文件路径、修改内容并随发行包保留相应许可证。

## OpenMAIC

- 来源：https://github.com/THU-MAIC/OpenMAIC
- 核对版本：`v0.3.1` / 2026-07-29 获取的 `main`
- 许可证：MIT License，Copyright (c) 2026 THU-MAIC
- 参考范围：互动课堂的信息架构、教学场景、课件/测验/白板/仿真的组合方式、资料生成课堂与课堂导出思路。
- 本项目实现：使用本项目原有原生 JavaScript、IndexedDB、Kimi 结构化事件和本地白板重新实现；未复制 OpenMAIC 的 Next.js/React/LangGraph 运行时。

## Open TutorAI Community Edition

- 来源：https://github.com/Open-TutorAi/open-tutor-ai-CE
- 核对版本：2026-07-29 获取的 `main`
- 许可证：BSD 3-Clause License，Copyright (c) 2023-2025 Mohamed El hajji on behalf of R2D-dev
- 参考范围：用户以自己的教材、笔记和可信资料建立个性化导师的产品方向。
- 本项目实现：资料默认保存在独立 IndexedDB；只有用户主动开始 AI 课堂时才发送当前选中页面。

## Screenity

- 来源：https://github.com/alyssaxuu/screenity
- 许可证：GPL-3.0
- 参考范围：录屏控制、暂停/继续、本地回放和导出体验。
- 合规边界：当前仓库未复制或包含 Screenity 源码。GPL 代码不会直接并入本项目的专有发行代码，除非未来发行方案经过单独许可证评估。

## Open Recorder / OpenRec 类本地录屏项目

- 参考范围：本地项目库、明确权限、录制文件管理与导出。
- 本项目实现基于浏览器标准 `getDisplayMedia`、`MediaRecorder` 和 IndexedDB，不包含第三方录屏项目源码。

## 商标与无背书声明

以上名称属于各自权利人。本项目对相关项目的引用不表示这些作者、组织或项目对“向前 · 学习督导台”的认可、认证或赞助。
