# 磁盘体检 · DSH 插件

> 给 [DeepSeek Harness](https://github.com/deepseek-ai) 用的 C 盘体检插件：左侧边栏一个入口，点开是一份可视化报告，勾选后一键清理。

![icon](icon.svg)

---

## 这是什么

一个 DSH 插件（bundle），装上后：

- 左侧导航多出一个 **「磁盘体检」** 入口，和「插件」「自动化任务」并列
- 点开是一份报告：环形占用图、C 盘可用/总量、可清理合计
- 每一项都写明 **是什么、删了会怎样、完整路径、体积、是否需要管理员权限**
- 底部 **「一键清理所选」**，删完立刻从列表移除、顶部容量实时更新
- 右上角 **「重新扫描」** 带进度条（后端 Worker 扫描 + 前端平滑推进）

---

## 为什么会有这个项目

这不是一个"想做就做"的工具，是被一台真实的笔记本逼出来的。记录如下。

### 第一次清理（2026-11-02）

一台 2019 年的笔记本：i7-8550U / 16GB / 128GB SSD(C:) + 1TB HDD(D:)，Windows 10 22H2。

症状：**电脑非常卡**。

扫完发现 C 盘 118 GB 只剩 **10.7 GB（9.1%）**。逐层翻出来：

| 占用 | 体积 |
|---|---:|
| WSL 两个发行版 + Docker 虚拟磁盘 | 12.7 GB |
| 微信升级补丁残留 + 运行日志 | 3.7 GB |
| 夸克两个旧版本 | 2.5 GB |
| 飞书聊天缓存 | 2.4 GB |
| 旧版微信插件 | 1.7 GB |

还挖出更严重的东西：

- **`AppData\Roaming\PhotoViewer`（"ABC看图"）** —— `pop/` 目录里是两个弹窗程序，另有 `reward.exe`、`Collect.exe`、`Report.exe`。其中 `PhotoManager.exe` 已被 Defender 判定为 `Trojan:Win32/Kepavll`。
- **`vlupprqvhv`** —— 随机 10 位字符的服务名、独立 svchost 服务组、ServiceDll 指向一个已不存在的 DLL。典型恶意持久化残留，每次开机启动失败。
- **`duohuipingbao`（多惠屏保）** —— 10 个进程常驻，吃 500 MB 内存。
- **`winToolBox`** —— 不是"工具箱"，捆绑了 5 个开机自启服务。
- **`diskcleanup` 目录** —— 名字冒充系统组件，里面是 `pophistory.dat`、`imprddt_0` 这类弹窗统计。

清理后 C 盘回到 47 GB。

### 第二次清理（2026-11-21，18 天后）

用户反馈：**"从上次清理后，又快满了。"**

C 盘又只剩 26.6 GB，18 天掉了 **20.85 GB**。

但这次很奇怪 —— 把所有能看到的目录加起来只有 71 GB，而磁盘已用 92 GB。**21.5 GB 找不到。**

逐个探测 ACL 保护目录，最后用管理员权限跑 `vssadmin`：

```
已用卷影副本存储空间: 23.4 GB (19%)
```

**真相是系统还原点。** 三份卷影副本（9-17、11-07、11-15）静悄悄占了 23.4 GB —— 因为 Windows 系统保护的默认配额是**磁盘容量的 15%**，118 GB 的盘就是 17.7 GB 上限，而且实际能到 19%。

删掉后立刻回血 23.8 GB。同时暴露出另外两个"看不见"的大家伙：

| 目录 | 体积 |
|---|---:|
| `C:\Program Files\WindowsApps` | 13.87 GB |
| `C:\Windows\ServiceProfiles` | 6.84 GB |

### 从"手动清"到"做成工具"

两次清理都是手工跑命令、临时写脚本，每次都要重新分析一遍。所以干脆做成插件：

- 检测逻辑固化下来，不用每次重写
- 结果直接显示在 DSH 界面里（不用去找脚本、双击运行）
- 一键删除，不用记命令

---

## 开发过程中踩的坑（这部分可能是最有价值的）

全部是真实遇到并修复的，不是假设：

| # | 现象 | 根因 | 解法 |
|---|---|---|---|
| 1 | 页面整块报 `Failed to fetch` | 扫描跑在 Node **主线程**，13 秒完全阻塞；Desktop 版的浏览器请求走 Electron IPC 桥，桥的另一头就是被堵死的主线程 → 超时 | 把扫描移进 **Worker 线程**（`worker_threads`），主线程只负责响应请求 |
| 2 | 扫描中 `/report` 要 11 秒才回 | 同上 | 同上。修复后实测 **3 ms** |
| 3 | 点「删除」完全没反应，右下角一个白框 | 客户端用 `POST + application/json`，在 Desktop 的 `file://` 源下触发跨域预检，而路由只认 POST → 预检 405 → 请求根本没发出 | 删除接口支持 **GET 传参**，并补 `OPTIONS → 204` 与 `access-control-allow-origin: *` |
| 4 | 删完看着没变化 | 结果提示写在了**页面最底部**，用户不会滚下去 | 提示移到页面**最顶部**，绿/橙/红三色横幅 |
| 5 | 顶部可用空间不变 | 删完触发了一次 10 秒全量重扫，期间数据是旧的 | 直接用接口返回的新容量更新，后台再静默刷新 |
| 6 | 删掉的项还能再勾 | 没有本地状态 | 删成功的 id 记入 `gone`，立即移出列表 |
| 7 | 一个文件被占用，整项判失败 | 删除逻辑是"要么全成要么全败" | 逐文件删除，锁住的跳过，返回"部分文件被占用" |
| 8 | 顶部容量显示 **0 GB** | `fs.statfsSync` 在某些环境不可用，而我把 PowerShell 兜底删了 | 加回兜底并校验 `total > 0` |
| 9 | 缓存命中却读到坏数据 | 磁盘缓存没有版本号，结构变了仍被复用 | 加 `CACHE_VERSION`，旧缓存自动作废，容量为 0 的结果不缓存 |
| 10 | 点「重新扫描」像死机 | 按钮**没有加载态**，13 秒里界面一动不动 | 点击瞬间出提示 + 按钮变「扫描中…」+ 进度条 |
| 11 | 进度条从 39% 直接跳 100% | 服务端统计大目录时会阻塞，中间来不及上报 | Worker 线程上报真实进度 + 前端按已用时间**平滑补间** |
| 12 | 含中文的 `.ps1` 语法崩溃 | Windows PowerShell 5.1 读无 BOM 的 UTF-8 按 GBK 解码 | 含中文的 `.ps1` 一律存成 **UTF-8 with BOM** |
| 13 | 函数参数永远为 null | 参数名用了 PowerShell 保留变量 `$args` | 改名 `$argList` |
| 14 | `.cmd` 找不到 `.ps1` | 批处理里 `%~dp0` 后接中文文件名，按 GBK 解析失败 | 脚本文件名一律用 ASCII |

另外还遇到过：脚本被非管理员运行时静默退出、只留下一行日志，让人误以为"已经执行了" —— 后来改成**检测到非管理员自动 `Start-Process -Verb RunAs` 提权重启自己**。

---

## 功能

### 检测项（17 类，运行时自动发现）

| 分类 | 项目 |
|---|---|
| 临时文件 | 用户临时目录、Windows 临时目录、崩溃转储、Windows 错误报告 |
| 浏览器 | Chrome 网页/代码缓存、Edge 缓存、缩略图缓存、Edge 更新下载缓存 |
| 包缓存 | pnpm、npm |
| 旧版本 | Chrome 旧版本目录（自动发现）、DSH 旧版本目录（自动发现） |
| 应用残留 | DSH 更新包、微信升级补丁 |
| 系统 | Windows 更新下载缓存、Windows 日志 |

### 只展示、不可删的（附原因和正确做法）

- `WinSxS` 组件存储 —— 只能用 `DISM /Online /Cleanup-Image /StartComponentCleanup`
- `Windows\Installer` —— 删了程序无法卸载/修复
- `System32` —— 系统核心

### 交互

- 按分类筛选（临时/浏览器/包缓存/旧版本/系统/软件残留）
- 每项可展开「这是什么？」，看路径、说明、删除后果
- 全选本页 / 清空选择
- 删除后彩色横幅反馈，失败项逐条给出原因

---

## 安装

### 方式 A：插件市场索引（推荐）

1. 打开 DSH → **Plugins** → **Discover**
2. 添加索引地址（**国内可用**，走 jsDelivr CDN）：

```
https://cdn.jsdelivr.net/gh/zwtqc/dsh-disk-checkup@main/index.json
```

   想锁定版本就用 `@v1.0.0` 代替 `@main`：

   ```
   https://cdn.jsdelivr.net/gh/zwtqc/dsh-disk-checkup@v1.0.0/index.json
   ```

   > ⚠️ 不要用 `raw.githubusercontent.com` 的地址 —— 国内网络基本访问不到。

3. 搜索 `磁盘体检` 或 `disk`，点安装
4. 重启 DSH（或用 Plugins 页面提示的方式生效）

> 需要你的 DSH 启用了插件市场（Discover / `plugin-market`）。如果界面里没有 Discover，
> 用下面的方式 B 或 C。

### 方式 B：本地目录

```
Plugins → Add plugin → 选择本仓库目录
```

或者在 DSH 会话里让 Agent 执行：

```
install_bundle  target = <本仓库绝对路径>
```

### 方式 C：Git

```bash
dsh plugin add git+https://github.com/zwtqc/dsh-disk-checkup
```

> 装完在左侧导航会多出「磁盘体检」。如果没有，按 `Ctrl + F5` 强刷页面。

### 方式 D：GitHub 访问不了怎么办

国内网络下 `git clone github.com` 经常超时。实测结论：

| 域名 | 可用性 |
|---|---|
| `cdn.jsdelivr.net`（索引、图标、源码文件） | ✅ 可用 |
| `api.github.com` | ✅ 可用 |
| `raw.githubusercontent.com` | ❌ 基本超时 |
| `github.com` 的 git 协议（clone / push） | ⚠️ 时通时断 |

所以三件事是分开的：

- **看索引**：走 jsDelivr，没问题
- **看文档/图标**：走 jsDelivr，没问题
- **真正安装**（要 `git clone`）：可能失败

git clone 失败时的替代方案：

1. **让作者发布到 npm**，然后 `dsh plugin add dsh-disk-checkup`（走 npmmirror 镜像，国内稳定）
2. **在能上 GitHub 的网络里下载仓库**，拷到本机，用「方式 B」从本地目录安装
3. 把仓库**导入 Gitee 等镜像**，从镜像目录安装

---

## 使用

1. 点左侧「磁盘体检」
2. 点开感兴趣的项看「这是什么？」
3. 勾选 → 底部「一键清理所选」
4. 看顶部横幅结果

「需要管理员权限」的项在普通权限下**必然失败**并给出原因 —— 这是设计如此，不会假装成功。

---

## 什么绝对不能删（逐项审查过）

这个清单来自两次真实事故 + 对每个目录的实测，不是凭经验列的。

| 路径 | 为什么不能删 | 正确做法 |
|---|---|---|
| `C:\Windows\WinSxS` | 组件仓库，删了系统无法更新 | `DISM /Online /Cleanup-Image /StartComponentCleanup` |
| `C:\Windows\Installer` | 卸载/修复数据包 | 不要动 |
| `C:\Windows\System32` | 系统核心 | 不要动 |
| **`...\Google\Chrome\Application\<版本号>\`** | **根目录 chrome.exe 是 stub，清单写死依赖某个版本目录里的 `<版本号>.manifest`。删掉会让 Chrome 报「应用程序的并行配置不正确」而完全打不开** | 交给 Chrome 自己的更新器 |
| **`...\AppData\Local\pnpm`** | **不是纯缓存**：DSH 插件与各项目依赖从这里链接出去，整个删掉要全部重装，还可能让插件加载失败 | `pnpm store prune` |
| `...\@deepseek-aidsh-desktop-updater` | 里面可能是「已下载未安装」的下个版本 | 装完由更新器自己清 |
| `C:\Users\<你>\.dsh` | DSH 配置、插件、会话、记忆 | 不要动 |
| `C:\Windows\System32\DriverStore` | 已安装驱动的备份 | 磁盘清理 → 设备驱动程序包 |
| `C:\Program Files` / `(x86)` | 已安装程序本体 | 设置 → 应用 → 卸载 |
| 微信/QQ 聊天记录目录 | 聊天数据库不在缓存里 | 用软件自己的「清理缓存」 |

### 同一类风险的其他地方（不删就对了）

- 任何 `<软件>\update\` 里**正在下载/待应用**的补丁
- 任何 `new_*.exe` / `*.new-{GUID}` / `pending\` 目录 —— 那是**待替换的新版本**，不是垃圾
- 任何程序目录里的 `.manifest` / `.dll` / `.pak` 资源文件
- `node_modules`（删了要重装全部依赖，且可能让当前运行的插件失效）

### 一句话判据

> **「删了要重新下载」的才能删；「删了这个软件就跑不起来」的不能删。**
>
> 缓存（Cache / Code Cache / Temp / Logs / 崩溃转储 / 已装完的更新包）→ 删
> 安装目录、版本目录、待安装包、依赖 store、清单文件 → 不删
## 技术实现

```
catalog.js   目录清单 + 体积统计（纯 Node，主线程与 worker 共用）
scanner.js   Worker 线程：遍历磁盘、逐项 postMessage 上报进度
index.js     主线程：4 条 HTTP 路由 + 内存/磁盘双级缓存
client.js    Client 半边：侧边栏入口 + 主区域报告面板
```

### 路由

| 路由 | 作用 |
|---|---|
| `GET /dsh-disk-checkup/report` | 快照。命中缓存立刻返回；无缓存则跑一次 Worker 扫描 |
| `GET /dsh-disk-checkup/scan` | 启动带进度的扫描，立刻返回 `scanId`，不阻塞 |
| `GET /dsh-disk-checkup/progress?id=` | 查询进度，完成时附带完整报告 |
| `GET/POST /dsh-disk-checkup/clean?ids=a,b,c` | 执行删除 |

### 缓存策略

- 内存 + `%TEMP%\dsh-disk-checkup-cache.json` 双级
- 有效期 30 分钟
- **过期也先返回旧数据**，后台 Worker 重新扫描（stale-while-revalidate）
- 带 `CACHE_VERSION`，字段语义变了旧缓存自动作废
- 容量读取失败（`total = 0`）的结果不写缓存

### 为什么删文件是 GET 不是 POST

见上文第 3 条。Desktop 版的 renderer 在 `file://` 源下，`POST + application/json` 会触发跨域预检。为了兼容，删除接口用 GET 传参（仍然只接受**白名单内的固定 id**，不接受任意路径）。

### 日志

`%TEMP%\dsh-disk-checkup-requests.log`，记录每次 report / scan / clean 的入参与结果，排查"点了没反应"时很有用。

---

## 安全说明

- 删除目标来自**代码内写死的白名单**，接口只接受 `ids`，**无法通过请求删除任意路径**
- 所有 HTTP 路由仅监听本机（DSH 默认绑定 `127.0.0.1`），但**没有额外鉴权** —— 本机其它进程理论上可以调用这些路由，不过影响范围仍限于白名单内的缓存目录
- 不会碰：文档、桌面、聊天记录数据库、注册表、系统还原点
- **不会碰 Chrome 的版本目录**（见 1.0.1 变更说明），避免破坏 Chrome 的启动清单

---

## 已知限制

- 标「需要管理员权限」的项在普通权限下删不掉，需要以管理员身份运行 DSH
- 首次扫描约 10～13 秒（要遍历 GB 级缓存目录），之后 30 分钟内秒开
- 部分缓存文件被运行中的浏览器/资源管理器占用时只能删掉一部分，会如实上报「部分文件被占用」
- 仅在 Windows 上测试（Windows 10 22H2）

---

## 更新日志

### 1.0.2

**安全审查：移除 3 类「会弄坏软件」的清理项。**

| 移除项 | 原因 |
|---|---|
| `pnpm store`（853 MB） | 不是纯缓存，DSH 插件和项目依赖从这里链接，整个删掉可能让插件加载失败。改用 `pnpm store prune` |
| `DSH 旧版本目录 .new-{GUID}` | 与 Chrome 同类机制：那是**待替换的新版本**，不是垃圾 |
| `DSH 更新包 pending` | 可能是已下载未安装的下个版本，删了等于取消更新 |

同时把「不能删除」清单从 3 条扩到 10 条，逐条写明原因和正确做法（见上文表格）。

### 1.0.1

**修复一个会导致 Chrome 打不开的严重缺陷。**

1.0.0 会扫描 `Google\Chrome\Application\` 下的旧版本目录并删除（"Chrome 旧版本 x.y.z"）。
这在一种情况下会**弄坏 Chrome**：Chrome 更新时先把新 stub 存成 `new_chrome.exe`，
要等下次启动才替换；如果此时把旧版本目录删掉（尤其是删掉了里面的 `<版本号>.manifest`），
根目录的 `chrome.exe` 仍然指向那个旧版本，启动就会报
`应用程序的并行配置不正确 / Dependent Assembly <版本> could not be found`。

1.0.1 起**不再扫描或删除任何 Chrome 版本目录** —— 旧版本由 Chrome 自己的更新器负责清理。

> 如果你已经被这个问题影响：把 `Application\new_chrome.exe` 复制成 `chrome.exe`、
> `new_chrome_proxy.exe` 复制成 `chrome_proxy.exe`（先备份原文件），
> 即可完成那次没做完的更新替换。

### 1.0.0

- 首个公开版本：侧边栏面板、17 类检测项、一键清理、带进度的重新扫描
- 扫描移入 Worker 线程，修复 `Failed to fetch`
- GET 删除接口 + CORS，修复点击无反应
- 双级缓存 + 版本号，修复冷启动慢与读到坏缓存
- 删除改为逐文件处理，支持部分成功上报

---

## 许可

[MIT](LICENSE)
