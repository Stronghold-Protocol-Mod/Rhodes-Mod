# 罗德岛 MOD · 卫戍协议：盟约

> 🔧 **这一段请自己写。** 下面是给作者（你）留的说明占位区，替换成你自己的介绍即可：
> 为什么做这个 MOD、加了什么、数值思路、想看的效果、更新计划、联系方式……
> 写完之后把这一整块（含本提示）删掉。
>
> ```
> （在这里写 MOD 说明）
> ```

《卫戍协议：盟约 · Stronghold Protocol》的**非官方本地数据 MOD**，在官方数据之上追加「罗德岛」阵营。

本仓库**只包含 MOD 自己的文件**，不含上游项目的任何源码 —— 上游的文件以「补丁 + 结构差量」的形式携带，
安装时打在你自己那份官方安装上。所以这里既没有搬运作者的作品，也让 MOD 能跟着版本走。

---

## 装之前先看

|              |                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------- |
| **适配版本** | 官方 **0.2.1**（`package.json` → `"stronghold-protocol-alliance"` / `"0.2.1"`）           |
| **前置要求** | 已装好并能正常启动的官方游戏本体；**Node.js 22 或 24 LTS**（游戏本身也依赖它）            |
| **安装体积** | 约 7 MB（其中 MOD 独占美术素材 27 个 / 约 1.9 MB，其余是补丁与数据）                       |
| **平台**     | Windows（`install.bat`）· macOS / Linux（`install.sh`）                                    |

官方 0.2.1 之外的其他版本**未必能直接装**：安装器会逐个文件比对 `baseSha256`，
对不上就会**报错并停止**，不会把游戏改坏。届时等 MOD 跟进即可。

---

## 安装（Windows：双击即可）

1. 下载本仓库（`Code` → `Download ZIP`，或 `git clone`），解压到一个**不会被误删**的目录。
2. 双击 **`install.bat`**。

就这样。安装器会自己找到游戏目录。找不着的时候，有两条退路：

- 把**游戏文件夹直接拖到 `install.bat` 上**松手；
- 命令行里指定：`install.bat "D:\你的路径\Stronghold-Protocol"`。

macOS / Linux 用 `./install.sh`，参数一样。

### 安装器做了什么

按顺序三件事，每一步都对不上就停下报错：

1. 把 MOD 的 52 个自有文件放进游戏目录（已是最新的会跳过）；
2. 给你那份官方源码打 18 个文件的补丁，并把 `data/assets.json` 按**结构差量**合入
   （逐文件校验 SHA-256，结果哈希对不上就回滚）；
3. 把 MOD **打开**。

装之前，会被改动的作者源性文件会先备份到 `<游戏目录>/.rhodes-mod-backup/<时间戳>/`。

### 装完

正常启动游戏（`npm start`，或你平时用的启动方式）即可，标题界面上会多一个 MOD 状态徽标。

---

## 开关

MOD 是**数据驱动**的：那套 JavaScript 永远随游戏加载，但**只有数据存在时才工作**。
开关做的事情，就是在 6 个数据文件（`chess` / `bonds` / `effects` / `garrisons` / `tokens` / `items`）的
「ON 快照」和「OFF 快照」之间切换 —— **OFF 快照与官方 0.2.1 原件逐字节相同**，
所以关掉之后游戏就是原版，不是"近似原版"。

三种开关方式，随你顺手：

```bat
:: 命令行（在游戏目录里）
npm run mod:rhodes            :: 开
npm run mod:rhodes:strip      :: 关
npm run mod:rhodes:status     :: 看状态
```

- **游戏内**：标题界面的 MOD 徽标，点一下切换（仅本机回环地址可切，对局进行中禁止切换）。
- **HTTP**：`POST /mod/toggle?id=rhodes&on=1`（`0` 为关闭），`GET /mod/state` 读状态。

反复开关是幂等的 —— 开 → 关 → 开之后，数据文件与第一次开时**逐字节一致**。

---

## 卸载

```bat
npm run mod:rhodes:strip
```

游戏就回到原版了。想彻底清理，再删掉这些 MOD 新增的文件/目录：

- `mod/`（开关清单与 ON/OFF 快照）
- `server/mod/`、`server/sim/content/bonds/rhodes.js`、`server/sim/content/kits/mod.js`、
  `server/sim/content/kits/ops/mod-rhodes-*.js`（6 个）
- `public/js/ui/modBadge.js`、`public/assets/` 下 MOD 新增的素材（27 个，见 `tools/manifest.json` 的 `assets`）
- `docs/MOD-RHODES.md`、`tools/{install,mod-toggle,game-root,diff}.mjs`、`tools/manifest.json`
- `install.bat` / `install.sh`（如果你把仓库文件放在了游戏目录里）

那 18 个被打了补丁的作者文件，用 `.rhodes-mod-backup/<时间戳>/` 里的备份覆盖回去即可。
`tools/manifest.json` 记录了每个文件的 `baseSha256` / `resultSha256`，可以自行核对。

---

## 这个 MOD 改了什么

### 新增（MOD 自有文件，装完即可见）

|                                 |                                                                         |
| ------------------------------- | ----------------------------------------------------------------------- |
| **7 名干员 / 14 条记录**         | 暴行 · 可露希尔 · 阿米娅·医疗 · Mon3tr · 阿斯卡纶 · 凯尔希·思衡托 · 逻各斯 |
| **盟约 `rhodesShip`「罗德岛」**  | 阈值 **3 / 6**，共 11 名成员（4 名官方 + 7 名 MOD）                       |
| **盟约效果 `bondeffect_rhodes`** | `server/sim/content/bonds/rhodes.js`                                     |
| **装备 2 件 × 普通/精锐**        | 罗德岛急救包（T3）· 罗德岛徽章（T6）                                      |
| **开关引擎 + 徽标 UI**           | `server/mod/`、`public/js/ui/modBadge.js`                                |

干员数值全部取自官方客户端表（`character_table` / `skill_table` / `range_table` / `uniequip_table` 等），
与「卫戍协议」赛季导出干员的方式一致 —— 只有赛季本来会指定的字段（档位、价格、商店顺序、精英化阶段等级、盟约）由 MOD 决定。

盟约行为、触发条件与逐条数值，见 **[`payload/docs/MOD-RHODES.md`](payload/docs/MOD-RHODES.md)**（该文档随 MOD 一并装入游戏）。

### 改动（对官方文件的补丁，共 18 个文件 / 34 个 hunk / +485 −16）

```
package.json
shared/protocol.js
server/index.js
server/http/routes.js
server/http/websocket.js
server/lobby.js
server/match/player/diy.js
server/sim/content/bonds.js
server/sim/content/tokens.js
server/sim/content/garrisons/battle.js
server/sim/content/garrisons/meta.js
server/sim/content/items/battle.js
server/sim/content/kits/index.js
public/js/main.js
public/js/store.js
public/js/screens/title.js
public/css/screens/title.css
public/i18n/en.json
```

外加 `data/assets.json` 一个**结构差量**（新增素材清单，含 2 名干员、3 个召唤物与若干图标），
装机时按结构合入并由安装器重算 `hash` —— 因为它是单行压缩 JSON，做文本 diff 会退化成整文件替换。

改动都是**加挂点**性质：注册一个开关、转发几条路由、在标题界面挂一个徽标。
关掉 MOD 后这些代码不会生效。

---

## 目录结构

```
install.bat / install.sh      一键安装
payload/                      MOD 自有文件，原样复制进游戏目录
  ├─ docs/MOD-RHODES.md        MOD 详细文档
  ├─ mod/                      开关清单 + ON/OFF 数据快照
  ├─ public/                   徽标 UI + 27 个独占美术素材
  └─ server/                   MOD 服务端逻辑（盟约、开关、路由）
patches/                      对官方文件的补丁（18 个 .diff）与 assets 结构差量（.merge）
tools/
  ├─ install.mjs               安装器（--check / --off / --restore / --force / --game）
  ├─ mod-toggle.mjs            开关 CLI（on / off / status）
  ├─ game-root.mjs             定位游戏目录
  ├─ diff.mjs                  纯 JS 的 unified diff 生成/应用
  └─ manifest.json             全部文件的哈希与补丁元数据
```

安装器还支持几个开关：`--check`（只校验不写入）、`--off`（装完保持关闭）、
`--restore`（从备份还原作者文件）、`--force`（跳过版本校验）。

---

## 许可与致谢

MOD 自身的代码以 **GPL-3.0-or-later** 发布 —— 与上游一致，因为它是上游作品的衍生。
`《明日方舟》` 及「卫戍协议」相关的名称、角色、美术、Spine、文本与游戏数据，
版权归上海鹰角网络科技有限公司及其授权方所有。

详见 **[NOTICE.md](NOTICE.md)** 与 **[LICENSE](LICENSE)**。
