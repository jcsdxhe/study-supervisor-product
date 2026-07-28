# 发行检查清单

## 代码与数据

- [ ] Git 工作区清楚，版本号在 `VERSION`、`package.json`、`package-lock.json` 一致。
- [ ] 不存在 `.env`、真实密钥、用户 JSON、题图、录音、截图、日志、浏览器 profile。
- [ ] `npm.cmd ci` 与 `npm.cmd run check` 通过。
- [ ] Edge/Chrome 完成计划、批注、PDF、语音、摄像头权限的视觉冒烟测试。
- [ ] keyless 状态可启动；所有 AI 操作明确禁用或返回可理解错误。
- [ ] 若发布云版：缺少任一云秘密时拒绝启动；未登录 AI API 为 401；恶意 Origin 为 403；Cookie 包含 HttpOnly/Secure/SameSite；镜像上下文不含 `.env` 或用户数据。

## 隐私与安全

- [ ] 浏览器源码/localStorage/日志没有 API Key。
- [ ] 媒体设备只在用户操作后启用，结束/后台/关闭时停止。
- [ ] 所有模型结构化输出经过白名单和范围验证，不执行返回代码。
- [ ] 发行包不包含个人 IndexedDB/localStorage 数据。

## 商业材料

- [ ] README、安装说明、隐私说明、免责声明、LICENSE、NOTICE、CHANGELOG 已更新。
- [ ] 不宣传“原生实时语音”“准确监控手机”“保证提分”等未实现能力。
- [ ] 若展示延迟或效果，标明测试环境、日期和非保证性质。
- [ ] 法律文本经适用地区的专业人士审核后再正式销售。

## 产物

- [ ] 运行 `npm.cmd run package:local`。
- [ ] 从生成目录再次运行 `node tests/check.js`。
- [ ] 从无 `.env` 的干净副本启动并检查 `/api/kimi/status`。
- [ ] 生成 ZIP 校验和并记录在 `releases/SHA256SUMS.txt`。
