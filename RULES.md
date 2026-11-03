# C 盘扫描规则详解（R1–R12）

> 配套脚本：`scan-c-drive.ps1`（主扫描）、`big-files.ps1`（单文件大户）、`make-actions.ps1`（去重并生成命令）
> 输出：`scan-result.json`（原始数据）、`REPORT.md`（报告）、`ACTIONS.md`（迁移命令）、`clean.ps1`（清理脚本）

---

## 0. 总体判定模型

### 0.1 扫描流程

| 步骤 | 内容 | 实现 |
| --- | --- | --- |
| S1 | 卷容量采集 | `Get-PSDrive`：已用/可用 |
| S2 | 顶层目录计量 | `C:\Windows`、`Program Files`、`Program Files (x86)`、`ProgramData`、`%USERPROFILE%` |
| S3 | 候选路径清单计量 | 62 条显式路径，覆盖 R1–R11 |
| S4 | AppData 二级发现 | `%LOCALAPPDATA%`、`%APPDATA%` 直接子目录中 > 300 MB 的 |
| S5 | 单文件大户 | Users / ProgramData / Program Files* 中 > 400 MB 的单个文件 |
| S6 | 分类、去重、排序 | 见 0.3 / 0.4 |

### 0.2 计量算法（Measure-Tree）

```
栈式深度优先遍历
对每个目录：
  1. 枚举文件 → 累计 Length，计数 Files
  2. 枚举子目录 → 入栈
跳过条件：
  - 目录/文件带 ReparsePoint 属性（junction / symlink / mount point）
    → 防止循环引用、防止跨盘重复计数
  - 无权限访问（捕获异常后跳过，不中断整体扫描）
```

**已知局限（重要）**

1. 不解析硬链接：NTFS 硬链接会被重复计数（WinSxS 有大量硬链接，因此 `WinSxS` 的 11.49 GB 是"表观大小"，实际占用更小）。
2. 不计压缩/去重（NTFS 压缩、ReFS 去重）后的真实占用。
3. 需要管理员权限才能读全 `C:\Windows` 部分子目录；非管理员扫描会偏低，但不影响结论方向。

### 0.3 分类定义

| 类别 | 含义 | 允许的自动动作 |
| --- | --- | --- |
| 清理 | 删除后可再生，不影响功能与登录态 | 可脚本执行（默认演练） |
| 转移 | 数据应换盘存放，原位置保留数据 | 应用内改路径 / 改环境变量 / 改 Known Folder |
| 链接 | 数据换盘但程序要求原路径存在 | robocopy /MOVE + `mklink /J` |
| 只读 | 系统组件仓库，仅报告 | 只允许 DISM / pnputil / 磁盘清理 |
| 评估 | 单文件或不明用途，需人工判断 | 无 |

### 0.4 去重与阈值

| 项 | 规则 |
| --- | --- |
| 父子去重 | 父目录已入选时，其子路径不再单独生成命令（避免先搬父再搬子） |
| 命令阈值 | 仅对 ≥ 50 MB 的项生成迁移命令 |
| 清理阈值 | 仅对 ≥ 1 MB 的项生成清理条目 |
| 大目录阈值 | AppData 二级目录 ≥ 300 MB 才进入"补充发现" |
| 单文件阈值 | ≥ 400 MB 才进入 R12 候选 |
| 排序 | 按 GB 降序 |

### 0.5 风险分级

| 级别 | 判定标准 | 典型后果 |
| --- | --- | --- |
| 低 | 纯缓存，可再生，无账号态 | 首次打开稍慢 |
| 中 | 需重登、重建索引、重下依赖，或迁移时应用在运行 | 需重新登录/重建索引 |
| 高 | 系统组件、卸载修复依赖、驱动仓库 | 系统更新失败、无法卸载/修复 |

---

## R1 临时与缓存目录

**判定条件**

- 路径白名单（已实现）：
  - `C:\Windows\Temp`、`C:\Windows\Prefetch`
  - `%LOCALAPPDATA%\Temp`
  - `%LOCALAPPDATA%\D3DSCache`、`%LOCALAPPDATA%\NVIDIA\DXCache`
  - `%LOCALAPPDATA%\Microsoft\Windows\INetCache`、`...\Windows\Explorer`（thumbcache）、`...\Microsoft\FontCache`
  - 浏览器缓存：`Chrome\User Data\Default\Cache`、`Code Cache`；`Edge\User Data\Default\Cache`
- 名称模式（用于扩展扫描，当前脚本未启用通配，仅作规则定义）：
  `Temp|Tmp|Cache|Caches|Code Cache|GPUCache|ShaderCache|GrShaderCache|DawnCache|CachedData|Crashpad|*.tmp`

**不匹配（排除）**

- 浏览器 `User Data` 根目录（含 Cookie/登录态）→ 归 R10
- `%TEMP%` 中正在被进程占用的文件（删除时自动跳过）
- 任何 OneDrive / 同步盘目录内缓存

**处理**：删除目录内容，保留目录本身。
**风险**：低。**体积经验值**：0.5–3 GB。

---

## R2 日志与崩溃转储

**判定条件**

- 目录：`%LOCALAPPDATA%\CrashDumps`、`C:\Windows\Minidump`、`C:\Windows\LiveKernelReports`、`C:\Windows\Logs`、`C:\ProgramData\Microsoft\Windows\WER`
- 文件：`MEMORY.DMP`、`*.dmp`、`*.mdmp`、`*.hdmp`、`*.etl`、`*.log`

**策略**

- 保留最近 7 天的日志（便于排障），更早的可删。
- `MEMORY.DMP` 可整文件删除（可达数 GB）。
- WER 只删 `ReportArchive`、`ReportQueue`，保留 `Report*` 配置。

**风险**：低。**例外**：企业环境若有日志采集代理，先确认再删。

---

## R3 包管理器与构建缓存

**判定条件（路径白名单）**

| 工具 | 路径 | 官方清理命令 |
| --- | --- | --- |
| pip | `%LOCALAPPDATA%\pip\cache` | `pip cache purge` |
| npm | `%APPDATA%\npm-cache`、`%LOCALAPPDATA%\npm-cache` | `npm cache clean --force` |
| pnpm | `%LOCALAPPDATA%\pnpm-store` | `pnpm store prune` |
| yarn | `%LOCALAPPDATA%\Yarn\Cache` | `yarn cache clean` |
| Gradle | `%USERPROFILE%\.gradle\caches` | 删旧版本号目录 |
| NuGet | `%USERPROFILE%\.nuget\packages` | `dotnet nuget locals all --clear` |
| Maven | `%USERPROFILE%\.m2\repository` | 建议迁移+链接（重下耗时） |
| WinGet | `%LOCALAPPDATA%\Microsoft\WinGet` | 清理下载缓存 |

**排除**

- 项目内 `node_modules`（业务依赖，删了要重装）
- `venv` / `site-packages`（运行环境，不是缓存）
- `%USERPROFILE%\.cargo\registry` 之外的 Rust 工具链（归 R10）

**风险**：低（Maven/NuGet 为中，重下耗时）。

---

## R4 系统更新与升级残留

**判定条件**

- `C:\Windows\SoftwareDistribution\Download`（更新下载缓存）
- `C:\Windows.old`、`C:\$WINDOWS.~BT`、`C:\$GetCurrent`（升级备份）
- `C:\Windows\Panther`（安装日志）
- `C:\ProgramData\Microsoft\Windows\DeliveryOptimization`（传递优化缓存）

**前置条件**

- `SoftwareDistribution\Download` 需先 `net stop wuauserv`（或直接依赖删除失败跳过）
- `Windows.old` 存在时间 < 10 天时 Windows 可能禁止删除；用"磁盘清理 → 以前的 Windows 安装"

**风险**：中（删 `Windows.old` 后无法回滚到旧版本）。

---

## R5 回收站与下载目录

**判定条件**

- `C:\$Recycle.Bin` → `Clear-RecycleBin`
- `%USERPROFILE%\Downloads`

**Downloads 不自动删除**，只做分类统计供人工判断：

- 安装包：`*.exe *.msi *.zip *.7z *.rar *.iso`
- 修改时间 > 30 天且体积 > 100 MB 的安装包优先清理
- 保留：文档、图片、代码压缩包、近期下载

**风险**：低（回收站）/ 中（Downloads）。

---

## R6 用户文档库

**判定条件**

- `Documents`、`Pictures`、`Videos`、`Music`（可选 `Desktop`）

**处理方式**：资源管理器 → 属性 → 位置 → 移动到目标盘。系统会改 Known Folder 注册项（`User Shell Folders`）并自动迁移，不需要 mklink。
**风险**：中（迁移期间不要运行占用文件的程序）。**Desktop 不建议迁移**（部分安装器写死路径）。

---

## R7 模型与数据集缓存

**判定条件**

- `%USERPROFILE%\.ollama\models`
- `%USERPROFILE%\.cache\huggingface`
- `%USERPROFILE%\.conda\envs`
- 可选：`%USERPROFILE%\.cache\torch`、`tensorflow`、`%LOCALAPPDATA%\Temp\*model*`

**处理**：设置环境变量而不是链接（更稳）：

```
OLLAMA_MODELS=F:\AI\ollama
HF_HOME=F:\AI\huggingface
TORCH_HOME=F:\AI\torch
```

**风险**：低（首次加载需重新下载）。

---

## R8 虚拟机 / 容器 / 子系统

**判定条件**

- WSL：`HKCU\Software\Microsoft\Windows\CurrentVersion\Lxss\*\BasePath` 指向的 `ext4.vhdx`（常在 `%LOCALAPPDATA%\Packages\<发行版>\LocalState`）
- Docker Desktop：`%LOCALAPPDATA%\Docker`、`%APPDATA%\Docker`、`C:\ProgramData\DockerDesktop`
- Android AVD：`%USERPROFILE%\.android\avd`
- Hyper-V / VMware / VirtualBox 磁盘
- `%LOCALAPPDATA%\Packages` 下大体积 `LocalState`

**处理**

- WSL：`wsl --manage <发行版> --move F:\WSL\<发行版>`（或 export/import）
- Docker：Settings → Resources → Disk image location
- 其余：应用内改路径

**风险**：中（迁移中断可能损坏镜像，先备份 vhdx）。**注意**：`Packages` 整体搬迁风险高，脚本已将其排除出自动命令。

---

## R9 安装包与安装器缓存

**判定条件**

- `%LOCALAPPDATA%\Package Cache`、`C:\ProgramData\Package Cache`
- `*.msi`、`*.msp`、安装器自身下载缓存
- WinGet 下载目录

**为什么不直接删**：删除后 MSI 类程序无法"修复/卸载/更新"，VS 等大型套件尤其敏感。
**处理**：迁移 + `mklink /J`（保留可访问性，但不再占 C 盘）。
**风险**：中。

---

## R10 应用数据大户

**判定条件**

1. 位于 `%LOCALAPPDATA%` 或 `%APPDATA%`（可扩展 `%USERPROFILE%\.xxx`）
2. 体积 ≥ 300 MB
3. 不属于 R1–R4 已覆盖的缓存路径
4. 不是系统保护目录

**典型命中**：微信/QQ、Trae、VSCode 扩展、JetBrains 缓存、Playwright 浏览器、钉钉、浏览器配置、用户级 Programs。

**执行前提**

- 应用必须完全退出（含托盘/后台进程），否则文件被锁 → robocopy 报错、链接后数据不一致
- 目标盘需同文件系统特性（NTFS），否则 `mklink /J` 与 ACL 行为异常
- `mklink /J` 需管理员；迁移后校验 `Get-Item <路径> | Select LinkType,Target`

**回滚**

```bat
rmdir "C:\原路径"
robocopy "F:\MoveFromC\..." "C:\原路径" /E /MOVE
```

**风险**：中。

---

## R11 组件存储与驱动仓库（只读）

**判定条件**

- `C:\Windows\WinSxS`
- `C:\Windows\System32\DriverStore`
- `C:\Windows\Installer`

**为什么只读**

- WinSxS 用硬链接与系统文件共享数据，表观体积远大于实际占用；手删会导致更新/修复失败
- DriverStore 手删会导致设备无法启动
- `Windows\Installer` 存 MSI 缓存，删除后无法卸载/修复/更新

**允许的动作**

```bat
Dism /Online /Cleanup-Image /AnalyzeComponentStore
Dism /Online /Cleanup-Image /StartComponentCleanup /ResetBase
pnputil /enum-drivers            :: 人工确认后删除旧驱动包
```

**预期收益**：3–6 GB（取决于更新历史）。**风险**：高。

---

## R12 单文件大户

**判定条件**：单文件 ≥ 400 MB，扫描范围 `C:\Users`、`C:\ProgramData`、`C:\Program Files*`（`C:\Windows` 默认排除，避免把系统文件当候选）。

**分类判断**

| 类型 | 特征 | 建议 |
| --- | --- | --- |
| 虚拟磁盘 | `*.vhdx *.vhd *.vmdk` | 应用内迁移（R8） |
| 镜像 | `*.iso *.img` | 移到其他盘或删除 |
| 数据库/备份 | `*.bak *.mdf *.ldf *.pst` | 移到其他盘 |
| 模型权重 | `*.gguf *.safetensors *.ckpt *.bin` | 设置缓存目录到其他盘（R7） |
| 转储 | `*.dmp` | 删除（R2） |
| 页面/休眠文件 | `pagefile.sys`、`hiberfil.sys`、`swapfile.sys` | 用系统设置迁移/关闭，禁止直接删 |

本次实测仅命中 1 个 > 400 MB 文件（GoogleUpdater 的 crx 缓存 0.49 GB），说明 C 盘大头是"多而小"的文件，不是单文件。

---

## 安全边界（白名单 / 黑名单）

**永不自动处理**

- `C:\Windows\System32`、`C:\Windows\WinSxS`、`C:\Windows\Installer`、`C:\Windows\servicing`
- `C:\Program Files*` 下已安装程序目录
- `C:\EFI`、`C:\Recovery`、系统还原点、`System Volume Information`
- 加密目录（EFS）、受 ACL 保护目录
- 页面文件/休眠文件/注册表配置单元

**扫描期约束**

- 不跟随重解析点（junction/symlink/mount point）
- 不跨卷统计
- 无权限即跳过，不中断
- 只读扫描，不修改任何文件（清理/迁移需显式执行脚本）

---

## 本次实测使用的参数

| 参数 | 值 |
| --- | --- |
| 候选路径数 | 62 |
| 命中项 | 41 |
| 清理阈值 | ≥ 1 MB 进入 clean.ps1 |
| 迁移命令阈值 | ≥ 50 MB 且风险 ≠ 高 |
| 自动命令排除 | `%LOCALAPPDATA%\Packages`、`Downloads`、`SoftwareDistribution\Download` |
| AppData 补充发现阈值 | ≥ 300 MB |
| 单文件阈值 | ≥ 400 MB |
| 目标盘 | F:（可用 338.7 GB） |
