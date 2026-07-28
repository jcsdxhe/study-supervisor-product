# 安全云代理部署

## 边界

云版本把静态网页与 Kimi 代理部署在同一 HTTPS 源站。Kimi API Key、访问口令和 Cookie 签名密钥只存在于云服务运行时环境变量中，不进入 Docker 镜像、Git、网页源码、localStorage、IndexedDB、Service Worker 或导出文件。

学习计划、日报、题图、白板、录音和成绩仍由浏览器本地保存。只有用户主动点击讲题或开始课堂后，当前题图/选区和确认后的文字才经过云代理转发给 Kimi；服务端只在内存中保留限额、一次性凭证和课堂上下文，进程重启即清除。

## Render Blueprint 部署

1. 将干净、无 `.env` 和私人数据的仓库推送到一个私有 GitHub 仓库。
2. 在 Render 创建 Blueprint，并选择仓库根目录的 `render.yaml`。
3. 在 Render Dashboard 填写两个 `sync: false` 的秘密：
   - `MOONSHOT_API_KEY`：Kimi API Key；
   - `APP_ACCESS_TOKEN`：至少 24 个字符的独立访问口令，不要与 Kimi Key 或其他账号密码相同。
4. `SESSION_SIGNING_SECRET` 由 Render 自动生成。`RENDER_EXTERNAL_URL` 由 Render 自动提供，服务用它校验浏览器 Origin；使用自定义域名时另设 `PUBLIC_ORIGIN=https://你的域名`。
5. 首次手动部署，确认 `/api/health` 返回 `{"ok":true,"mode":"cloud"}`，打开网页后应显示“安全云代理已锁定”。输入访问口令后才能读取 Kimi 状态。
6. 验收后再决定是否开启自动部署。不要把 `.env` 上传或使用 Docker build argument 传递秘密。

Render 官方 Docker 部署会从仓库 Dockerfile 构建镜像，运行环境变量应在服务侧配置。`render.yaml` 将真实秘密标记为 `sync: false`，签名密钥使用 `generateValue`。当前语音课堂依赖进程内会话，因此使用持续运行的 Web Service，而不是无状态函数。

## 必须验证

- 缺少任一云模式秘密时服务拒绝启动；
- 未登录请求 `/api/kimi/status` 返回 401；
- 错误口令不设置 Cookie，连续失败受限流；
- 正确口令只设置 `HttpOnly; Secure; SameSite=Strict` Cookie；
- 非同源 POST 返回 403；
- Service Worker 不缓存 `/api/`；
- 发布包、镜像上下文和 Git 中没有 `.env`、题图、录音、截图或学习数据。

## 当前部署

- 私有仓库：`https://github.com/jcsdxhe/study-supervisor-product`
- Render Free Web Service：`https://study-supervisor-product.onrender.com`
- 2026-07-28 公网验收：主页与 `/api/health` 返回 200，健康接口返回 `{"ok":true,"mode":"cloud"}`，HSTS 与 CSP 生效，未登录访问 `/api/kimi/status` 返回 401。
- 未执行真实 Kimi 请求，因此本次公网安全验收没有消耗模型余额。Free 实例闲置后会休眠，首次访问可能出现冷启动延迟。
