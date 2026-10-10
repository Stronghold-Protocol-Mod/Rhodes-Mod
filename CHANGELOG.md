# 更新日志

## 1.5.0

阿米娅的三形态凑齐了：新增**升变任务**（术士 → 近卫 / 医疗），升变之后**商店只刷新升变后的形态**；开关框架随之升到 **v2**（`MOD_C2S` 自登记消息通道 + 两个中立视图透出）。

### 变更

- **阿米娅的升变**：
  - 商店从此**只刷术士阿米娅**（T2 中坚术师，价 3）；医疗（`char_1037_amiya3`）与近卫（`char_1001_amiya2`）形态是完整的 `isHidden` 记录（T5），完全在商店池之外。
  - 对局内**首次购入**术士阿米娅自动弹出任务面板（`public/js/ui/amiyaAscend.js`，罗德岛开关的 `client` 模块，自带样式），**二选一**锁定路线：〈继承之剑〉本人累计 **8000** 伤害 → 近卫；〈以伤害的方式拯救〉本人 **6000** 伤害 + 全队 **8000** 治疗 → 医疗。任务定义与纯函数在 `shared/amiyaQuest.js`（双端共用）。
  - `claim` **原地升变**（`transformChess`）：装备、召唤物、站位与复制池份数全部保留；中途失去术士则退回直接发放。
  - **商店形态联动**：升变后该玩家的商店只刷升变形态 —— 货架立刻换面（`server/match/match/amiya.js`），此后的商店刷新（`economy.js`）与奖励刷新（`acquire.js`）同理；形态的购买 / 合成 / 出售 / 淘汰记账借术士的共享池条目走 `poolOf` 门面（`diy.js`）；状态住在 `ps.poolSwap`（`PlayerState.js`）。**每名玩家独立**：别人的商店仍是术士，也没有人能不经任务买到升变形态。
  - 三形态价格硬性统一 3（买一次，升变免费）；精锐（`_b`）同样支持。
- **框架 v2**：
  - `shared/protocol.js` 新增 **`MOD_C2S`**：MOD 在**自己的模块里**注册客户端消息 schema（服务端 `server/match/match/amiya.js`、客户端面板各注册一份），作者所有的 `C2S` 表不再收录任何 MOD 的消息；`validateC2S` 与 `platform.js` 的意图门都会查这张注册表。
  - `server/match/player/views.js` 的两个透出（`stats.buys`、`effects[].data`）升为**框架补丁** —— 任何 MOD 的包都带同一份，弹幕 MOD 因此一处自己的作者文件补丁都不再需要。
  - 框架补丁 **11 → 13** 个；`FRAMEWORK.md`（给第二个 MOD 打包器的契约）同步重写。
- **素材**：新增近卫阿米娅全套（头像 ×2、立绘 ×2、Spine 前/后 ×6、技能图标 ×2）与术士阿米娅缺失的两个技能图标，共 21 个文件，全部取自 PRTS（`torappu` / `media.prts.wiki`）；`data/assets.json` 的 `char_1001_amiya2` 条目重建（技能 20 → 24 条）。独占素材 27 → **51** 个。
- 干员总数 7 → **9**（18 条记录）；盟约成员 11 → **13**；kit 文件 6 → **8** 个（新增 `mod-rhodes-amiya.js` / `mod-rhodes-amiya2.js`）；随 MOD 文档 `docs/MOD-RHODES.md` 新增「阿米娅的升变」整章。
- **kit 修正**（两态对拍抓出来的）：术士 / 近卫阿米娅的 kit 把默认技能放进了 `skills` 映射（约定是顶层 `skill`），且奇美拉 / 绝影没写 `targeting.rangeGrid` —— 技能运行期的攻击射程没有换成技能自己的网格（术士精锐 S3 实测 10 格 ≠ 官方 18 格）。两处都已修正；`questOf` 测试助手补 `?? null`（OFF 态首次全量跑到才暴露）。

### 验证

- golden 重冻结：`test/golden/mod/` 6 族 / **290 场景**（AI 与数据状态变化随之更新）。
- 测试：`test/match/mod_amiya.test.js` **9 通过 / 1 跳过**（新增商店联动全套断言：货架换面、400 次刷新不出术士、复制记账走术士池、归还恢复）；mod_rhodes + fuzz + mod_bot + mod_toggle + kits_mod_rhodes + golden **26 通过 / 3 跳过**。
- **两态全量对拍**（各 5978 个测试，比失败名集合）：**ON-only = 0 / OFF-only = 0** —— 两态的 173 个失败逐条同名（全部为已知环境类：无 python3 / Chrome、本机素材缺、EBUSY 等）。首轮对拍抓出术士 kit 的两个真问题（见上「kit 修正」），修正后复拍归零。
- **共存性证明**（`coexist.mjs`，框架 v2 口径）**7 步全绿**：弹幕包与罗德岛包共享**同一份 13 个框架补丁**，只装弹幕也能拿到 views.js 钩子；四种开关组合互不越界；两包框架指纹一致（`c8acf535fb4dc285…`），MOD 层补丁互不相交（罗德岛 12 个、弹幕 0 个）。
- **端到端安装校验**：干净官方 0.2.3 → `install.mjs` → 载荷 **87/87** 逐字节一致、补丁 **24/24 落地**（`package.json` 单独校验：玩家拿到的是中立脚本）、未改动官方文件 **1300/1300**。

### 打包

- `payload/` **58 → 87 个自有文件**：升变面板、任务容器、双端 schema、2 个新 kit、21 个素材与 `amiyaQuest.js` 等入列。
- 补丁 **18 → 25 个**（13 框架 + 12 本 MOD），**52 个 hunk / +636 −27**；`data__assets.json.merge` 结构差量随素材更新。
- 版本号 `1.4.0` → `1.5.0`；README 全面更新（干员表加两行、新增「阿米娅的升变」章节、素材 / 补丁 / 文件计数、徽章）。

## 1.4.0

把标题页那个「内容开关」从**罗德岛专用**改成一层**中立的框架**，让本 MOD 与**另一个数据 MOD**（比如弹幕 MOD）互不干扰：两个 MOD 可以各自单独安装、单独开关，也可以一起装、任意顺序装。**MOD 内容本身没有变化** —— 干员、盟约、数值、AI、7 个数据文件与那 27 个素材都与 1.3.0 逐字节相同。

### 为什么

在 1.3.0 之前，两个 MOD 会去覆盖**同一个** `mod/toggles.json`（开关登记表）：后装的那个会把前一个的条目挤掉，玩家的标题页上就出现一个**点不动的按钮**（1.3.0 已经踩过一次，当时是靠「给本 MOD 打包时只挑自己那一条」绕开的）。只要玩家想同时装两个 MOD，这个绕法就撑不住了。

### 变更

- **注册表改成「一个 MOD 一片」**：`mod/toggles.d/<id>.json`（本 MOD 是 `rhodes.json`）。两个 MOD 就是两个文件，谁后装都不会改写对方，任意安装顺序都落到同一份注册表。旧的单文件 `mod/toggles.json` 仍会被读取（0.1.x 装过的树），同一个 id 以分片为准。
- **开关机制抽成「框架层」**，代码里**不出现任何具体 MOD 的名字**：`server/mod/registry.js`（注册表格式的唯一实现）、`server/mod/toggle.js`（引擎）、`server/mod/api.js`（HTTP 接口）、`public/js/ui/modBadge.js`（徽标 + 客户端模块加载器）、`tools/mod-toggle.mjs`（玩家侧 CLI）。每个 MOD 的包都带这一层，且**逐字节相同**（`tools/manifest.json` 的 `framework.digest` 是它的指纹）——所以后装的那个会看到「已是最新」直接跳过。
- **客户端模块按注册表自挂载**：注册表条目可以写 `client: "js/ui/<x>.js"`，徽标会在该开关**开启**时 `import` 它并调用 `mount()`（返回值即卸载函数），**关闭**时卸载。于是 `public/js/main.js` 不再引用任何 MOD（本 MOD 没有客户端模块，也就不写这个字段）。
- **「MOD 重发的干员不进作者自选池」也变成通用框架规则**：`server/mod/kitted.js` 的 `modKitted(base, data)`，判据是「**当前生效的数据**里存在该干员的 `isMod` 记录」，而不是写死的 5 个名字。效果与 1.3.0 完全一致（阿米娅·医疗 仍可见 —— 作者自选池里没有她）。因此 `server/match/player/diy.js` 回到与官方 0.2.3 **逐字节相同**。
- **`server/sim/content/kits/mod.js` 只剩两个导出**（`MOD_BOND_ID` 与 `modActive`），自选规则搬去框架；`server/lobby.js` 改为调用框架的 `modKitted`。
- **玩家侧的开关命令统一成一条**（`tools/mod-toggle.mjs`）：`npm run mod -- on rhodes` / `npm run mod -- off rhodes` / `npm run mod:status`。有多个开关时**不指明 id 会拒绝执行**，而不是猜一个。安装器只切 `manifest.mod.id` 那**一个**开关 —— 装另一个 MOD 不会把罗德岛关掉。
- **文档**：随 MOD 装入游戏的 `docs/MOD-RHODES.md` 的「开关」章节补上**框架层契约**（分片格式、`client` 字段、框架 / 本 MOD 两层文件互不相交、`framework.digest` 的用法）；顺手修掉该文件里 459 处残留的 `\r` 与行尾空白。

### 验证

- **共存性证明**（本地一次性工作区）—— 在干净官方 0.2.3 上跑全套：
  1. **只装罗德岛** → 可用；
  2. 现场造一个**最小的第二个 MOD 包**：同一套框架 + 它自己的一片注册表 + 一份数据快照 + 客户端模块 + **它自己的一处作者文件补丁**；
  3. **在已装罗德岛的树上装它** → 框架文件`逐字节相同`因而全部「已是最新」跳过，罗德岛 7 个数据文件**一个字节都没动**；
  4. **注册表两片都在**，`status` 能读出两个开关，且不指明 id 切开关会被拒绝；
  5. **四种组合**（都关 / 只罗德岛 / 只第二个 MOD / 都开）逐一切换 → 切一个，另一个的数据**逐字节不动**；往返幂等；
  6. **干净官方 0.2.3 → 只装第二个 MOD** 也能跑（框架自带，不依赖罗德岛），它自己的补丁照样落地；
  7. 两份包印出的 `framework.digest` **完全相同**，且两份包 patch 的作者文件**互不相交**。
- **端到端安装校验**：在一份干净的官方 0.2.3 上跑 `install.mjs` → 载荷 **58/58**（其中框架 7/7）、补丁 **17/17 落地**（`package.json` 按预期跳过：装到玩家手里的是**中立**的 `mod` 脚本，不含开发树才有的 `local-extract` 命令）、**未改动的官方文件 1307/1307**。
- **测试**：`test/content/{mod_toggle,mod_danmaku,mod_rhodes}.test.js` **32 通过 / 2 跳过 / 0 失败**；客户端套件 776 项里 772 通过 / 3 跳过 / 1 失败（CSS 文字根，两态都失败，属既有环境项）；开发树 ON / OFF **全量两态对拍**（比失败名集合）**ON-only = 1 / OFF-only = 0**，那条 ON-only 是守着临时目录清理的沙箱假失败，两态其余失败逐条同名。详见开发树 `CHANGELOG.md`。

### 打包

- `payload/` **54 → 58 个自有文件**。新增的 4 个都是框架文件（`server/mod/{kitted,registry}.js`、`tools/{game-root,mod-toggle}.mjs` —— 后两个以前只在安装器自己手里，现在也装进游戏，于是玩家无需进 MOD 目录也能用 `npm run mod -- …`）；`mod/toggles.json` 换成 `mod/toggles.d/rhodes.json`。
- 补丁 **19 → 18 个**：`server/match/player/diy.js` 回到了官方原样，不再需要补丁（少了它，正好抵消 1.3.0 之后的全部漂移）。其中 **11 个是框架补丁**（每个 MOD 的包都一样的那些），**7 个是本 MOD 自己的**。
- 7 个数据文件、ON/OFF 冻结快照、`data/assets.json` 差量与 27 个素材**均无变化**——本版只动「开关机制」，不动 MOD 内容。
- 版本号 `1.3.0` → `1.4.0`；README 的徽章、补丁表、安装器说明、开关 / 卸载命令与改动清单同步更新。

## 1.3.0

让**罗德岛正式算作一个「核心盟约」**。此前它虽然已经带 `isCore: true`，但那是「引擎层面」的核心盟约（上名单、被调和 +1、算核心盟约层数、进核心/备用商店分池、UI 打「核心盟约」标签）；**唯一漏掉的是「模式名册」**——即 `config.json` 里每个模式 `activeBondIds` 的那份「本模式提供哪些盟约」清单，里面只有官方的 8 个势力盟约，没有罗德岛。本版把它补上；顺手把 AI 里早先「自己发明」的一套 `COMMIT_*` 特例收敛成通用了的核心盟约逻辑。

### 变更

- **模式名册补上罗德岛**（`data/config.json`）：所有 9 个模式的 `activeBondIds` 末尾追加 `rhodesShip`（`inactiveBondIds` 不动——MOD 只会**增加**一个盟约）。名册的数量随之从 23 → 24（两个 FUNNY 模式 13 → 14）。
  - 数据侧：`tools/local-extract/build-rhodes-mod.mjs` 新增 `addToModeRosters()`，`strip-rhodes-mod.mjs` 对应地在关闭时把 `rhodesShip` 从各名册里**摘除**（关闭态与官方 0.2.3 的 `config.json` 逐字节相同）。
  - 于是**开关文件由 6 个变成 7 个**：新增 `config`（`chess` / `bonds` / `effects` / `garrisons` / `tokens` / `items` / `config`）。`mod/toggles.json`、ON/OFF 冻结快照、开关引擎与相应测试同步更新。
- **AI 收敛到通用核心盟约路径**（`server/match/bot.js`）：删掉 1.2.0 里那套 MOD 专属的 `isCommit` / `COMMIT_MEMBER` / `COMMIT_DONE` / `COMMIT_BUY` 特例，改为一个统一的 **`isTopPayoffCore(bond)`** ——「是核心盟约**且**收益落在**最高档**（阈值有 2 档、真正质变在 6 名）」。
  - 逻辑上等价于 1.2.0 的 AI 行为（该凑 6 还是凑 6、该加权还是加权），但不再为罗德岛单开一段代码：评级/购买/上阵三处都走同一套「核心盟约 + 最高档收益」判断，只是增益值换成 `TOP_PAYOFF_MEMBER` / `TOP_PAYOFF_DONE` / `TOP_PAYOFF_BUY`。
  - **对原版仍为零影响**：`isTopPayoffCore` 同时要求 `isCore && isMod`，MOD 关闭时它恒为 `false`，AI 行为与原版逐字节一致。
- **审计**:把「核心盟约待遇」在 data / engine / UI / AI / tests / docs 六层逐项过了一遍 —— 除模式名册外，其余各层（`bondsMeta` 调和、`support` 的 `coreBondIds`、装备与商店分池、`matchInfo` / `bondStrip` / `loadout` / `detailPanel` 的 UI、`public/dev/game-mock.js`）**早已把罗德岛当核心盟约**，无需改动。审计结论记在开发树的 `CHANGELOG.md`。
- 新增测试：`test/content/mod_rhodes.test.js` 增加「罗德岛是核心盟约、且各模式名册都列有它」等断言（开启时 2 项），以及关闭态「任何模式名册都不提及罗德岛」（1 项）。

### 验证

- **遍历名册**：ON 下 9 个模式的 `activeBondIds` 均为在官方基础上**末尾追加** `rhodesShip`（24 / 14 条），`inactiveBondIds` 不变；在副本上 `strip` 得到的 `config.json` 与官方 0.2.3 **逐字节相同**，其余 6 个文件不变。
- **往返幂等**：对 strip 后的副本重建，7 个 ON 文件**逐字节复现**。
- **两态对拍**（开发树全量 `node --test`）：失败名集合 `ON-only = 0 / OFF-only = 0`（与 1.2.0 相同的判据）。
- **AI 行为**：`test/match/mod_bot.test.js` + 机器人相关套件 **43/43 通过**；`test/content/{mod_rhodes,mod_toggle,mod_danmaku}.test.js` 30 通过 / 2 跳过 / 0 失败。

### 打包

- `payload/` **52 → 54 个自有文件**：OFF/ON 快照由 6 个文件 × 2 变成 7 个文件 × 2。
- 补丁文件仍为 **19 个**（本版没有新增被改的官方文件），但 hunk 数与改动量随 AI 收敛更新为 **41 个 hunk / +615 −20**。
- **修掉一个打包泄漏**：`payload/mod/toggles.json`（标题页那个开关的登记表）以前是**整份复制**开发树的那份，而开发树是所有 MOD 共用的 —— 于是本包里会多出一个并不包含其数据与快照的**弹幕 MOD** 开关（点了会失败）。现在 `build.mjs` 从开发树里**只挑本 MOD 这一条**重新生成它，并对结果加了一条自检（`verify.mjs`：载荷里这份登记表必须**只**含 `rhodes`，且与安装结果逐字节一致）。现在整个包里（`payload/` + `patches/`）**不含任何弹幕 MOD 的痕迹**。
- 版本号 `1.2.0` → `1.3.0`；README 的简介、补丁表、开关说明、卸载清单与徽章同步更新。

## 1.2.0

让**匹配 AI 学会打「罗德岛」**。此前 AI 只把罗德岛当成一个普通盟约，凑到 3 名就停手；而罗德岛真正的收益在 **6 名**（溢出治疗转屏障 + 屏障引爆）。现在 AI 一旦决定走罗德岛，就会主动往 6 名凑；阿米娅（医疗）还会优先转职。

### 变更

- **AI 会为罗德岛「凑 6」**（`server/match/bot.js`）：
  - **购买**：罗德岛是当前目标盟约、且尚未凑满阈值上限时，其成员的购买权重额外提高（`COMMIT_BUY`）。
  - **上阵**：部署评分按「已上场的不同成员数」线性加权；凑满 6 名时再给一次额外奖励（`COMMIT_MEMBER` / `COMMIT_DONE`）—— 宁可多上一个罗德岛成员，也不再为高星外援让位。
  - **目标选择**：目标盟约评分加入「离第一档还差几名」的提前投入项，让 AI 在刚出现人头苗头时就更早锁定罗德岛，而不是中途改投别的盟约。
- **阿米娅的转职**：新增「转职配对」逻辑（`equipMorphPair`）。当手上有**变形同构体**（T6，可赋盟约）与带 `giveBondId` 的装备时，AI 会把二者**装在同一个人**身上完成转职；宿主优先选**阿米娅·医疗** `char_1037_amiya3`，且优先配 **奥术法阵**（转 **奥术** `arcaneShip`），没有奥术装备时才退而求其次用 **精准狙击镜**（转 **精准** `preciShip`）。找不到合适宿主时，变形同构体**留在手里**，不会被随手装掉。
- **对原版零影响**：以上逻辑全部由 `modOn(gd) = !!gd.bond('rhodesShip')` 门控 —— **MOD 关闭时，AI 的行为与原版逐字节一致**。
- 新增测试 `test/match/mod_bot.test.js`（4 项，MOD 关闭时自动跳过）：验证罗德岛成为目标并凑 6 上阵、阿米娅拿到「变形同构体 + 奥术法阵」并计入奥术盟约、缺奥术时改用精准、以及无配对时不浪费变形同构体。

### 验证

- MOD 开 / 关两态跑**完整匹配测试套件**（`node --test "test/match/*.test.js"`）：两态**全部通过、0 失败**；MOD 关闭时新增 4 项自动跳过。
- 开发树全量测试套件（`node --test`）两态对比（失败名集合）保持 `ON-only = 0 / OFF-only = 0`。

### 打包

- `payload/` 仍为 **52 个自有文件**（本次不动）。
- 补丁文件 **18 → 19**：新增对 `server/match/bot.js` 的改动。
- 版本号 `1.1.0` → `1.2.0`；README 的补丁表、徽章与安装说明同步更新。

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
（以上含**发布 ZIP 解压后**再装一遍的复验。）

官方测试套件（`node --test`，5903 项）两态对比：OFF 失败 12 项、ON 失败 72 项，**只在 OFF 失败的 = 0**。
ON 多出的 60 项全部是作者那种「清单式断言」——记录 / 盟约 / 装备 / 技能条数、覆盖清单、golden 摘要——
多出来的差值恰好等于 MOD 自己新增的内容（+14 条 chess 记录、+1 个盟约、+4 件装备、+7 个可购买位 …）。
没有任何一项是运行时报错：「每个可见干员在真实战斗里不报错」在 ON 下对 MOD 的 14 条记录**全部通过**。
两态都会失败的 18 项与 mod 开关无关（`assets.json`/kit 注册表永远是 mod 态、仓库不是 git 工作区、缺 python/Chrome 等）。
作者的测试里没有为 mod 预留计数偏移——那层「mod 中立化」在开发树里，不在发布的包里。

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
