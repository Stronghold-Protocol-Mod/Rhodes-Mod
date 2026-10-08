# 罗德岛 MOD · 卫戍协议：盟约

《卫戍协议：盟约 · Stronghold Protocol》的**非官方数据 MOD**：在官方 **0.2.1** 之上追加「罗德岛」阵营 —— **7 名干员 · 1 个盟约 · 2 件装备**，装完即用，随时可开可关。

![version](https://img.shields.io/badge/version-1.0.0-2ea44f)
![base](https://img.shields.io/badge/base%20game-0.2.1-blue)
![license](https://img.shields.io/badge/code%20license-GPL--3.0--or--later-blue)
![node](https://img.shields.io/badge/node-22%20%7C%2024-339933)

## 声明

> [!IMPORTANT]
> - 本 MOD 是玩家自制的**非官方同人作品**，与上海鹰角网络科技有限公司（Hypergryph）、Yostar 及其关联方**没有任何关系**，未获其授权或认可。
> - 本 MOD 是基于 [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol) 的第三方二次创作，**与上游项目的作者无隶属关系**，也未获其背书。
> - 《明日方舟》及「卫戍协议」相关的名称、角色、美术、音乐、音效、文本与数据等素材，版权归原权利人所有。这些素材**不适用**本项目的 GPL-3.0 许可证；GPL 只覆盖本 MOD 自己编写的代码。
> - 仅供学习交流与个人非商业使用。**严禁任何形式的盈利**，包括但不限于：售卖本项目或整合包、付费下载或付费分发、收费服务器或收费代开、广告 / 打赏 / 会员等变现方式，以及其他任何商业用途。
> - 本仓库**不包含**上游项目的源码：上游的文件以**补丁**与**结构差量**的形式携带，安装时打在你自己那份官方安装上。`payload/public/assets/` 下随附的 27 个素材（约 1.9 MB）为《明日方舟》原作资源，**同样不适用 GPL**，此处仅为便于安装，请勿用于本项目以外的用途或单独再分发。完整条款见 [NOTICE.md](NOTICE.md)。
> - 权利人如认为本项目侵犯其权益，请通过 Issue 联系，我们会**立即删除**相关内容。
> - 本 MOD 按「现状」提供，**不提供任何担保**，使用风险自负。

## 目录

- [声明](#声明) · [简介](#简介)
- [干员介绍](#干员介绍) · [盟约效果](#盟约效果)
- [安装](#安装) · [开关](#开关) · [卸载](#卸载)
- [许可证](#许可证) · [致谢与数据来源](#致谢与数据来源) · [贡献](#贡献)

## 简介

本 MOD 在官方「卫戍协议：盟约」的**数据层**上追加了一个完整的「罗德岛」阵营：它不重写游戏逻辑，只把 7 名干员、1 个盟约、2 件装备按官方数据表的格式投影进游戏，再由一小段**常驻但惰性**的 JS 让它们生效。**MOD 关闭时游戏就是原版** —— 6 个数据文件会切回与官方 0.2.1 逐字节相同的快照。

组成一览：

- **7 名干员 / 14 条记录**（每名含普通与精锐两档）：暴行、可露希尔、阿米娅（医疗）、Mon3tr、阿斯卡纶、凯尔希·思衡托、逻各斯。
- **1 个盟约「罗德岛」**（`rhodesShip`）：阈值 3 / 6，共 11 名成员（7 名本 MOD + 4 名被追加盟约的官方干员）。
- **2 件装备 × 普通 / 精锐**：罗德岛急救包（T3）、罗德岛徽章（T6）。
- **开关引擎**：`GET /mod/state` 读状态、`POST /mod/toggle` 切换，标题界面另有一个可点的状态徽标。
- **27 个独占美术素材**（约 1.9 MB）：7 名干员里有 5 名是官方赛季自带干员，素材官方包里已有，因此只需随附剩下 2 名的头像 / 立绘 / Spine。

<!-- 如果想补充「为什么做这个 MOD / 数值思路 / 更新计划 / 联系方式」，加在这一行下面 -->

### 对官方文件的改动

MOD 自身文件放在 `payload/`，原样复制进游戏目录；对官方文件的改动以补丁与差量携带（**不搬运源码**）：

| 形式 | 数量 | 说明 |
| --- | --- | --- |
| `patches/*.diff` | 18 个文件 / 34 个 hunk / +485 −16 | 全是**加挂点**性质：注册一个开关、转发几条路由、在标题界面挂一个徽标 |
| `patches/data__assets.json.merge` | 1 | `assets.json` 是单行压缩 JSON，文本 diff 会退化成整文件替换，故用**结构差量**合入 |

关掉 MOD 后这些代码不会生效。

<details>
<summary>被改动的 18 个官方文件</summary>

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

</details>

### 仓库结构

```
install.bat / install.sh      一键安装（双击 / 把游戏文件夹拖上来）
payload/                      MOD 自有文件，原样复制进游戏目录
  ├─ docs/MOD-RHODES.md        MOD 详细文档（随 MOD 一并装入游戏）
  ├─ mod/                      开关清单 + ON/OFF 数据快照
  ├─ public/                   徽标 UI + 27 个独占美术素材
  └─ server/                   MOD 服务端逻辑（盟约、开关、路由）
patches/                      对官方文件的补丁（18 个 .diff）与 assets 结构差量（.merge）
tools/
  ├─ install.mjs               安装器（--check / --off / --restore / --force / --game）
  ├─ mod-toggle.mjs            开关 CLI（on / off / status）
  ├─ game-root.mjs             定位游戏目录
  ├─ diff.mjs                  纯 JS 的 unified diff 生成 / 应用
  └─ manifest.json             全部文件的哈希与补丁元数据
```

## 干员介绍

7 名干员，数值、技能、天赋与模组**全部取自官方客户端数据表**（`character_table` / `skill_table` / `range_table` / `uniequip_table` 等），与官方赛季导出干员的方式一致；只有赛季本来就会指定的字段（档位、价格、商店顺序、精英化阶段等级、盟约）由本 MOD 决定。

| 干员 | 档位 | 职业 | 稀有度 | 价格 | 特色 |
| --- | :-: | --- | :-: | :-: | --- |
| 暴行 | T1 | WARRIOR · 强攻手 | 5★ | 2 | 近战强攻；天赋「山谷」在周围有高地时攻防 +5% |
| 阿米娅（医疗） | T3 | MEDIC · 咒愈师 | 5★ | 3 | 天赋「诚挚期许」全体最大生命 +8%、技能期间全体每秒回血；技能偏向群体治疗 |
| 可露希尔 | T3 | PIONEER · 战术家 | 6★ | 3 | 战术点召唤「指挥中心」；携带时部署费用下限 −3，且【罗德岛】干员攻击力 +4% |
| Mon3tr | T4 | MEDIC · 链愈师 | 6★ | 3 | 链式治疗（治疗会在友军间跳跃）；可部署「重构体」，其周围友军攻击力 +15% |
| 阿斯卡纶 | T5 | SPECIAL · 伏击客 | 6★ | 4 | 减速 + 持续法术伤害的伏击客；天赋「噬光残影」按站位提升攻速 |
| 凯尔希·思衡托 | T6 | MEDIC · 守望者 | 6★ | 4 | 带「生命修复单元」；友方进入攻击范围即获 1 层护盾与持续回血，对【罗德岛】干员效果翻倍 |
| 逻各斯 | T6 | CASTER · 中坚术师 | 6★ | 4 | 中坚术师；天赋「语汇演化」有几率追加法术伤害并停顿，「剜魂具辞」削减目标法抗 |

每条干员记录都带一个**层数（layer）特质**，是「罗德岛」盟约层数在战斗中的来源之一：阿米娅·医疗靠治疗、阿斯卡纶靠击倒、凯尔希·思衡托 / Mon3tr 靠释放技能、暴行靠被招募。

盟约的 11 名成员里，另外 4 名是**官方干员** —— 本 MOD 把「罗德岛」盟约追加给了它们，其余数据一概不动：

| 干员 | 档位 | 职业 | 稀有度 |
| --- | :-: | --- | :-: |
| 调香师 | T2 | MEDIC · 群愈师 | 4★ |
| 泥岩 | T4 | TANK · 不屈者 | 6★ |
| 隐德来希 | T5 | WARRIOR · 收割者 | 6★ |
| 迷迭香 | T6 | SNIPER · 投掷手 | 6★ |

## 盟约效果

**「罗德岛」`rhodesShip`** —— 阈值 **3 / 6**，成员数按**场上的不同干员**计算。实现在 `server/sim/content/bonds/rhodes.js`。

**在场 3 名**：成员**受到**的治疗与生命回复效果 **×(1 + 0.30 + 0.008 × 层数)**。

**在场 6 名**，额外获得三条效果：

1. **溢出治疗转屏障** —— 落在成员身上的治疗，**溢出**部分转为该成员自己的**屏障**（上限为其最大生命，**永不衰减**）。
2. **屏障引爆** —— 有屏障的成员**因敌人攻击**被削掉屏障时，向**周围 8 格**（半径 1.5 格）内的敌人造成 **(1000 + 10 × 层数)** 点**真实伤害**，每名成员 1 秒内至多一次。
3. **治疗者放宽目标** —— 罗德岛的医疗干员在范围内无人需要治疗时，可治疗范围内**任意可治疗友军**（随机，含满血；禁疗单位除外）。

**层数来源**：本盟约**不在战斗中自行叠层**；层数来自休整期来源，以及上面提到的干员**层数特质**。

> 屏障只为进攻服务 —— 它不阻挡、不挡致死伤害，也不提供额外保命效果。完整实现约定、与砾「屏障」的差异、以及逐条设计记录，见随 MOD 装入游戏的 [`payload/docs/MOD-RHODES.md`](payload/docs/MOD-RHODES.md)。

## 安装

|  |  |
| --- | --- |
| **适配版本** | 官方 **0.2.1**（`package.json` → `"stronghold-protocol-alliance"` / `"0.2.1"`） |
| **前置要求** | 已装好并能正常启动的官方游戏本体；**Node.js 22 或 24 LTS**（游戏本身也依赖它） |
| **体积** | 下载的 ZIP 约 1.9 MB，解压后约 7.4 MB（其中 MOD 独占美术素材 27 个 / 约 1.9 MB） |
| **平台** | Windows（`install.bat`）· macOS / Linux（`install.sh`） |

> 官方 0.2.1 之外的其他版本**未必能直接装**：安装器会逐个文件比对 `baseSha256`，对不上就会**报错并停止**，不会把游戏改坏。届时等 MOD 跟进即可。

### 步骤

1. 下载本仓库（`Code` → `Download ZIP`，或 `git clone`），解压到一个**不会被误删**的目录。
2. 双击 **`install.bat`**。

就这样，安装器会自己找到游戏目录。找不着的时候有两条退路：

- 把**游戏文件夹直接拖到 `install.bat` 上**松手；
- 命令行里指定：`install.bat "D:\你的路径\Stronghold-Protocol"`。

macOS / Linux 用 `./install.sh`，参数一样。

### 安装器做了什么

按顺序三件事，每一步对不上就停下报错：

1. 把 MOD 的 **52 个自有文件**放进游戏目录（已是最新的会跳过）；
2. 给你那份官方源码打 **18 个文件的补丁**，并把 `data/assets.json` 按**结构差量**合入（逐文件校验 SHA-256，结果哈希对不上就回滚）；
3. 把 MOD **打开**。

装之前，会被改动的官方文件会先备份到 `<游戏目录>/.rhodes-mod-backup/<时间戳>/`。

装完正常启动游戏（`npm start`，或你平时用的启动方式）即可，标题界面上会多一个 MOD 状态徽标。

安装器还支持几个开关：`--check`（只校验不写入）、`--off`（装完保持关闭）、`--restore`（从备份还原官方文件）、`--force`（跳过版本校验）。

## 开关

MOD 是**数据驱动**的：那套 JavaScript 永远随游戏加载，但**只有数据存在时才工作**。开关做的事情，就是在 6 个数据文件（`chess` / `bonds` / `effects` / `garrisons` / `tokens` / `items`）的「ON 快照」和「OFF 快照」之间切换 —— **OFF 快照与官方 0.2.1 原件逐字节相同**，所以关掉之后游戏就是原版，不是「近似原版」。

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

## 卸载

```bat
npm run mod:rhodes:strip
```

游戏就回到原版了。想彻底清理，再删掉这些 MOD 新增的文件 / 目录：

- `mod/`（开关清单与 ON/OFF 快照）
- `server/mod/`、`server/sim/content/bonds/rhodes.js`、`server/sim/content/kits/mod.js`、`server/sim/content/kits/ops/mod-rhodes-*.js`（6 个）
- `public/js/ui/modBadge.js`、`public/assets/` 下 MOD 新增的素材（27 个，见 `tools/manifest.json` 的 `assets`）
- `docs/MOD-RHODES.md`、`tools/{install,mod-toggle,game-root,diff}.mjs`、`tools/manifest.json`
- `install.bat` / `install.sh`（如果你把仓库文件放在了游戏目录里）

那 18 个被打了补丁的官方文件，用 `.rhodes-mod-backup/<时间戳>/` 里的备份覆盖回去即可。
`tools/manifest.json` 记录了每个文件的 `baseSha256` / `resultSha256`，可以自行核对。

## 许可证

- **代码**：本 MOD 自己编写的代码与文档，以及随附的补丁 / 差量片段，以 **GPL-3.0-or-later** 发布（与上游一致，因为它是上游作品的衍生），全文见 [LICENSE](LICENSE)；另附一条 GPL 第 7 条的附加许可，允许与 pixi-spine 中的 Spine Runtimes 组合分发（见 [NOTICE.md](NOTICE.md)）。
- **游戏素材不在许可范围内**：《明日方舟》相关的美术、音乐、音效、文本与数据等版权归原权利人所有，不适用 GPL，使用限制见上方的[声明](#声明)和 [NOTICE.md](NOTICE.md)。
- **上游项目**：[sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol)，同为 GPL-3.0-or-later。

## 致谢与数据来源

- **上游项目**：[sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol) —— 本 MOD 完全寄生在它之上，没有这个项目就没有这个 MOD。
- **干员数据与素材**：从**用户本地的官方客户端**提取后投影成游戏数据（提取脚本 `tools/local-extract/build-rhodes-mod.mjs` 属开发树，不在本仓库），核对来源为 [PRTS Wiki](https://torappu.prts.wiki/)。
- **素材版权**：《明日方舟》及其全部角色、美术、Spine 模型、界面图、音乐音效、文本与数据，版权归上海鹰角网络科技有限公司及其授权方（Yostar 等）所有。
- **第三方许可**：上游 `NOTICE.md` 列出的全部贡献者与组件（PixiJS、pixi-spine、Preact、htm、three.js、ws、isHarryh/Ark-Unpacker 等）同样适用于本 MOD 运行所在的这份游戏。

## 贡献

欢迎提 Issue 反馈 bug、与官方规则不一致的地方或改进建议，也欢迎提交 Pull Request：

- **请不要提交任何游戏素材文件**（美术 / Spine / 音效等）。
- 提交的代码将以 GPL-3.0-or-later 发布。
- 本项目坚持非商业：请不要提交广告、付费、打赏等任何形式的变现功能。
- 改数据后请确保**开关往返幂等**（`strip → rebuild` 后与原 ON 数据逐字节相同），并同步更新 `tools/manifest.json` 里的哈希。

---

> 本 MOD 仓库：<https://github.com/Stronghold-Protocol-Mod/Rhodes-Mod>　·　上游项目：<https://github.com/sganggs/Stronghold-Protocol>
