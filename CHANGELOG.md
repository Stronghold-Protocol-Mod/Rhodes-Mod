# 更新日志

## 1.1.0

适配官方 **0.2.3**（0.2.1 → 0.2.3）。MOD 内容不变，工作是把整套补丁与差量重做到新的官方基线上。

### 变更

- **基线升级到 0.2.3**：18 个补丁全部重新生成，`data/assets.json` 的结构差量按 0.2.3 的清单重算。
  作者在 0.2.1 → 0.2.3 之间改了 **394 个文件、新增 142 个**（新增干员克莱门莎、黍与乌尔比安的新模组、大量战斗与界面修复），
  其中 mod 挂接点所在文件（`kits/index.js`、`lobby.js`、`tokens.js`、`garrisons/battle.js`、`items/battle.js`、
  `shared/protocol.js`、`public/js/{main,store,screens/title}.js`、`server/index.js` …）几乎都被改过，因此逐个重做而非套用。
- **数据增量移植**：`bonds` / `effects` / `garrisons` / `tokens` / `items` 五个文件的 mod 增量与 0.2.3 官方改动**不重叠**，
  直接移植；`chess.json` 里 4 名被追加盟约的官方干员（调香师 / 泥岩 / 隐德来希 / 迷迭香）与 0.2.3 改动的是**不同字段**
  （mod 只追加 `bonds`，作者改的是 `talents` / `potDown`），做逐字段三方合并。
- **OFF 快照重新冻结**：与官方 0.2.3 的 6 个数据文件**逐字节相同**，开关往返仍幂等。
- 版本号 `1.0.0` → `1.1.0`；README 中的适配版本、补丁表与徽章同步更新。

### 验证

在**纯净的官方 0.2.3** 上：52/52 载荷、17/17 补丁结果（`package.json` 刻意不同）、
`data/assets.json` + 6 个数据文件与本地 mod 树逐字节一致；服务端启动正常、`GET /mod/state` 报 ON、
开关 ON→OFF→ON 往返后数据逐字节幂等、OFF 态与官方 0.2.3 逐字节一致。

## 1.0.0

首个公开版本，适配官方 **0.2.1**。

### 新增

- **7 名罗德岛干员**，共 14 条 `chess` 记录（普通 + 精锐）
  - 暴行 `char_230_savage`（T1 WARRIOR 强攻手）
  - 可露希尔 `char_4228_closur`（T3 PIONEER 战术家）
  - 阿米娅·医疗 `char_1037_amiya3`（T3 MEDIC 咒愈师）
  - Mon3tr `char_4179_monstr`（T4 MEDIC 链愈师）
  - 阿斯卡纶 `char_4132_ascln`（T5 SPECIAL 伏击客）
  - 凯尔希·思衡托 `char_1052_kalts2`（T6 MEDIC 守望者）
  - 逻各斯 `char_4133_logos`（T6 CASTER 中坚术师）
- **盟约「罗德岛」`rhodesShip`**：阈值 3 / 6，共 11 名成员（4 名官方 + 7 名本 MOD）。
  效果 `bondeffect_rhodes` 实现在 `server/sim/content/bonds/rhodes.js`。
  - **3 名**：成员**受到**的治疗与生命回复 ×(1 + 0.30 + 0.008 × 层数)。
  - **6 名**：治疗**溢出**部分转化为该成员自身的屏障（不衰减）；屏障吸收敌方伤害时，
    向周围 8 格引爆真实伤害，每名成员 1 秒内至多一次；同时罗德岛医疗干员可治疗攻击范围内的任意友军。
- **装备 2 件 × 普通/精锐**：罗德岛急救包（T3）、罗德岛徽章（T6）。
- **开关引擎**：`server/mod/` 提供开关的读写、`GET /mod/state` 与 `POST /mod/toggle`；
  `public/js/ui/modBadge.js` 在标题界面显示并切换状态。
- **一键安装器** `tools/install.mjs` + `install.bat` / `install.sh`：
  自动定位游戏目录（也支持把游戏文件夹拖到 bat 上），逐文件 SHA-256 校验，改动前自动备份，
  支持 `--check` / `--off` / `--restore` / `--force`。

### 设计说明

- 干员的数值、技能、天赋、模组全部取自官方客户端表，与赛季导出干员的方式一致；
  只有赛季本来会指定的字段（档位、价格、商店顺序、精英化阶段等级、盟约）由本 MOD 决定。
- 开关是**纯数据切换**：在 6 个数据文件（`chess` / `bonds` / `effects` / `garrisons` / `tokens` / `items`）的
  ON/OFF 快照间替换。OFF 快照与官方 0.2.1 原件**逐字节相同**。
- MOD 的 JS 常驻加载但**惰性**：只有 `data/bonds.json` 里存在 `rhodesShip` 标记时才生效。

详见 [`payload/docs/MOD-RHODES.md`](payload/docs/MOD-RHODES.md)。
