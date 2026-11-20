# dsh-sidebar-view-density

侧边栏 / 面板 / 插件页的「查看方式」切换器。

## 三套互相独立的属性

| 属性 | 控制对象 | 由谁改 |
|---|---|---|
| `data-dsh-view-density` | 左侧栏的**会话列表** | 头像行「查看方式」按钮的第一组 |
| `data-dsh-view-panel-density` | 左侧栏的**面板条目**（Purge / 技能中心 / 记忆系统 / 免费搜索 / IG5 / 更多） | 头像行按钮的第二组 |
| `data-dsh-view-plugin-density` | **插件页**（已安装卡片、插件行、市场卡片） | 插件页工具栏自己的按钮 |

三者互不影响：改侧栏不会动插件页，改插件页也不会动侧栏。

## 四档

| 档位 | 列 | 行高 / 图标 / 字号 / 间距 |
|---|---|---|
| 详细列表 detail | 1 | 宿主原生（32 / 16 / 14 / 2） |
| 单列 column1 | 1 | 44 / 18 / 14 / 6 |
| 双列 column2 | 2 | 44 / 18 / 13 / 6 |
| 自定义 custom | 1–6（滑块） | 44 / 18 / 13 / 6，上下与左右间距各自可调 |

菜单里没有「自定义」这一行：它被换成了一个**列数滑块**，拖动即切到 custom 并实时改列数。上下/左右间距在设置里调。

`custom` 用根变量驱动，**按区域分开**，不写死列数：

| 区域 | 变量前缀 |
|---|---|
| 会话列表 | `--dsh-view-*` |
| 面板 | `--dsh-panel-*` |
| 插件页 | `--dsh-plugin-*` |

每个前缀下四个变量：`-cols` 列数 1-6、`-rowheight` 每行高度 12-96px、
`-rowgap` 上下间距 0-24px、`-colgap` 左右间距 0-24px。

## 自定义在哪调

设置 → **侧栏视图**（本插件注册的 `settings.section`）：会话列表 / 面板 / 插件页各一组，每组四个滑块
（列数 / 每行高度 / 上下间距 / 左右间距）。菜单里也直接带「列数」和「每行高度」两条滑块，拖动即切到自定义。
每个区域各存一份，写入 `localStorage['dsh-sidebar-view-density:custom']` 的 `session` / `panels` / `plugins` 三个键。

## 持久化

```
localStorage['dsh-sidebar-view-density']          会话列表档位
localStorage['dsh-sidebar-view-density:panels']   面板档位
localStorage['dsh-sidebar-view-density:plugins']  插件页档位
localStorage['dsh-sidebar-view-density:custom']   {session:{cols,rowHeight,rowGap,colGap}, panels:{...}, plugins:{...}}
```

## 稳定 DOM 钩子（改宿主后先核对这里）

- 会话列表：`[data-sidebar-list-area]` → `[role="tree"]` → 行 `[data-row-key^="session:"]`
- 插件页：`[data-plugin-rows] > ul`、`[data-plugin-scope] > ul`、`[data-plugin-tab] ul`；行 `[data-plugin-row]` / `[data-plugin-entry]` / `[data-market-entry]`，已安装卡片是裸 `<li>`，用 `:scope > li`
- 面板条目：`nav[class*="panelList"] > [class*="panelEntry"]`（CSS Module 的哈希前缀会变，只认后缀）
- 头像行：`[data-slot="sidebar.settings"]` 里的 `[data-slot="settings.launcher"]`，手机/电脑图标组是 `[data-dshm-footer-group]`；本插件按钮是它的**前一个兄弟节点**，不并进那个框

## 安装

```powershell
cd $env:USERPROFILE\.dsh\profiles\<profile>
pnpm add "file:./plugins/dsh-sidebar-view-density"
```

安装后必须**重新加载界面**：应用菜单 → 重新加载界面（F5 已由本插件在渲染进程绑定；原生层补丁需完全退出重开）。

## 已知取舍

- 双列/自定义模式下隐藏会话行的第三列（时间戳），否则标签被挤到看不见。
- 插件页 `.card` 自带 `margin:0 -8px` 悬停外溢，进网格后会把内容顶出面板，已在规则里中和。

## 行高为什么不能压到 24px 以下（已修）

宿主样式里有三个硬指标：`.slot{height:20px}`、`.title{line-height:20px}`、
面板 `.panelRow{min-height:32px;padding:5px}`。只把滑块接到 `min-height`（下限）时，
行高会被内容自身撑住，所以低于 24px 毫无变化。

custom 模式现在的做法：轨道高度 **精确等于滑块值**（同时给 `height` 与 `max-height`，
超出裁切），图标取 `min(18px, 行高 - 4px)`，字号固定 13px、行距 1.1（不再按比例缩小，
否则文字会缩到看不清），面板行则显式清掉 `min-height` 与上下 `padding`。
范围 12-96px、步长 1；低于约 16px 时行内文字会被裁掉，属预期取舍。
