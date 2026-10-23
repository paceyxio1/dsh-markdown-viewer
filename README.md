# dsh-plugin-markdown-viewer

给 DeepSeek Harness（DSH）Web GUI 增加一个 **Markdown 渲染模式开关**：在设置里选择助手消息和侧栏文档预览的渲染方式（标准 / 纯文本 / 源码），并按需打开 emoji 短代码、目录、标题锚点、链接新标签页、长代码块折叠、内容宽度与字号。

功能设计参考了浏览器扩展 [Markdown Viewer](https://github.com/zhusee2/markdown-viewer)（多渲染器 + content 开关 + raw 开关 + 主题/宽度）的思路，但按 DSH 的插件模型重新落地。

---

## 功能

### 总开关
关闭后本插件完全不介入渲染，等同未安装。

### 应用范围
决定下方渲染选项作用的位置（总开关关闭时置灰不可选）：

| 选项 | 效果 |
| --- | --- |
| **仅对话框** | 只个性化助手消息（对话区）。 |
| **仅侧栏预览** | 只个性化右侧栏的 Markdown 文件预览。 |
| **对话框和侧栏预览** | 两个 surface 都个性化。 |

### 渲染模式

| 模式 | 说明 |
| --- | --- |
| **标准渲染** | 转发 DSH 内置渲染器：GFM、代码高亮（shiki）、公式（KaTeX）。与原生输出逐字节一致。 |
| **纯文本** | 去掉 Markdown 标记，只保留可读文字（标题、强调、链接、代码围栏等标记全部剥离）。 |
| **源码** | 直接显示 Markdown 原文，便于复制与校对。对话框取消息原文；侧栏预览通过 `workspaceFiles/read` 接口取文件源码。 |

### 内容增强（仅标准渲染模式生效）

| 开关 | 说明 |
| --- | --- |
| **Emoji 短代码** | 把 `:smile:` 这类 GitHub 短代码转成 emoji（内置约 380 个常用短代码，未知短代码原样保留）。 |
| **目录** | 内容含 2 个以上标题时，在顶部生成目录，点击可跳转。 |
| **标题锚点** | 标题旁显示 `#` 锚点，便于定位与引用。 |
| **链接新标签页打开** | 外部 http(s) 链接加上 `target="_blank" rel="noreferrer"`。 |
| **长代码块折叠** | 超过 24 行的代码块默认折叠（底部渐隐 + 提示），点击整块即可展开/收起。 |
| **单波浪号原样显示** | DSH 的解析器沿用 micromark 的 `singleTilde` 默认值，单个 `~` 也会变成删除线（GFM 规范只允许 `~~`），行号区间如 `105~112` 常因此整段被误删。开启后单波浪号删除线恢复为字面 `~文本~`，`~~` 删除线不受影响。 |

### 版式

- **内容宽度**：默认 / 较宽 / 全宽 / 较窄。对话区收窄时内容居中；侧栏预览同样生效（面板内收窄并居中）。
- **正文字号**：默认 / 紧凑 / 宽松，对话框与侧栏预览均生效。

设置页底部有 **恢复默认设置**。

---

## 安装

### 方式一：安装脚本（推荐）

```powershell
# 先构建
pnpm install
pnpm build

# 再装进 desktop profile
.\install.ps1
```

脚本做两件事（与 DSH 自己 `dsh plugin add` 的效果一致）：

1. 在 `<DSH_HOME>\profiles\<profile>\node_modules\` 下创建指向本仓库的**目录联接（junction）**；
2. 在 `<profile>\cordis.patch.yml` 末尾追加一行 `insert`（写入前自动备份，且使用 UTF-8 **无 BOM**，与 DSH 自身文件一致）。

脚本是幂等的，重复执行只会修复联接、不会重复追加。卸载：

```powershell
.\install.ps1 -Uninstall
```

其它 profile：

```powershell
.\install.ps1 -Profile web
```

### 方式二：手动

```powershell
$profileDir = "$env:USERPROFILE\.dsh\profiles\desktop"
New-Item -ItemType Junction -Path "$profileDir\node_modules\dsh-plugin-markdown-viewer" -Target "<本仓库路径>"
```

然后在 `$profileDir\cordis.patch.yml` 末尾追加：

```yaml
- insert:
    - id: markdown-viewer
      name: dsh-plugin-markdown-viewer
```

### 生效

**必须重启 DSH**（插件行在 profile 加载时挂载）。重启后打开 **设置**，左侧应出现 **Markdown 渲染** 一页。

---

## 使用

1. 打开设置 → **Markdown 渲染**；
2. 保持「启用渲染控制」为开；
3. 选一个渲染模式；选「纯文本」或「源码」后立即在对话里生效；
4. 回到「标准渲染」可继续使用下面的内容增强开关。

所有设置存在浏览器 `localStorage`（键 `dsh-markdown-viewer/settings/v1`），刷新即时保留、无加载态。

---

## 实现要点

### 为什么覆盖 `assistant-step` 槽位，而不是"改渲染函数"

DSH 里助手正文由 `@deepseek-ai/dsh-client-ui-primitives` 的 `MarkdownText` 渲染，而调用它的是 `ui-conversation` 内部的助手节点渲染器——这两者都**没有对外开放的插槽**：

- `ui-conversation/client` 只导出 `ConversationController` / `apply` / `inject`，拿不到内部组件；
- `MarkdownText` 所在模块是原生 ESM 命名空间对象，属性只读，无法打补丁。

DSH 提供的合法扩展点是 `conversation.chat.node` 这个 **keyed 槽位**（按节点类型分派，同 key 取优先级**最低**者渲染）。所以本插件以 `priority: -100` 占用 `assistant-step` 单元（内置渲染器在 `0`），把渲染决定权拿过来。

但这里有一个真实的陷阱：**框架按每个条目自己的 `inject` 面来合成 props**。当前版本里助手渲染器声明了自己的业务面（需要一个 `usePresentation` hook），如果直接用本插件的 props 去调用它的组件，这个 hook 就是 undefined，会当场崩溃（我们在真实环境里验证过这条失败路径）。所以本插件的做法是**镜像**：

1. 渲染时用 `ctx.slots.entries('conversation.chat.node')` 找到被自己遮蔽的内置条目；
2. 注册时把该条目的 `inject` 工厂**原样重新声明**在自己的注册上——框架因此为两个条目绑定同一组 hook，转发过去的 props 是完整的；
3. 一个 `ViewBoundary` 包住自己的视图：任何一步出错都降级为「自己用 `MarkdownText` 渲染」，绝不空白一条消息。

由此得到一个关键性质：**默认配置下标准模式与原生逐字节相同**（无包裹元素、无 DOM 处理），这一条由测试断言保证。

### 三种模式分别怎么实现

| 模式 | 做法 |
| --- | --- |
| 标准 | 直接 `createElement(内置渲染器, props)`；需要内容增强时套一层 `<div class="mdv-root">` 并跑一遍 DOM 增强。 |
| 纯文本 / 源码 | 不调用内置渲染器，改用自己的 `ContentView`：文本块用 `extractMarkdownPlainText` 或原文渲染，思考块用原生 `<details>` 折叠，图片走会话授权的 `loadImage`，工具调用仍由 DSH 自己的节点渲染。 |

### DOM 增强的收敛性

emoji、锚点、链接、代码折叠都写成**幂等**变换：对同一子树跑第二遍不产生任何变化。配合 `MutationObserver`（rAF 防抖）就能跟随流式输出持续生效而不进入死循环。代码折叠只改属性、不插入额外元素，因此不会破坏 React 的协调。

### 侧栏预览是怎么挂钩的

右侧栏的 Markdown 文件预览由 `ui-sidebar-documentpreview` 渲染，同样没有可声明的插槽。本插件的做法：

1. 一个跟随插件生命周期的 `MutationObserver` 扫描 `[data-document-preview="...documentpreview/markdown"]` 容器；
2. **纯文本 / 源码**模式：给容器加 `data-mdv-sidebar-mode` 属性（CSS 规则据此隐藏原生输出），再**追加**一个携带插件渲染的兄弟节点——不碰 React 管理的子节点，删除追加项即恢复原样；
3. 文件源码通过预览自身使用的 `POST /api/workspaceFiles/read`（typert gateway 的 client-request 信封）获取，按 session+path 缓存；
4. **标准**模式复用对话区的同一套幂等 DOM 增强；目录用源码里的标题生成；
5. 总开关关闭或范围不含侧栏时，所有追加项被移除，预览回到原生渲染。

### 单波浪号修复是怎么定位的

渲染后的 `<del>` 元素不区分来自 `~` 还是 `~~`，也拿不到自己对应的源码区间，所以**反向定位**：把每个 `<del>` 的渲染文本拿到源码里找（匹配时跳过渲染已经消费掉的行内标记字符 `*`、`` ` ``、`\`——删除线内容里嵌着加粗/行内代码时，渲染文本与源码切片本就不同），然后检查匹配区间**紧邻两侧**的波浪号数量：两侧各 1 个 → 单波浪号误删线，还原为字面 `~文本~`（内部标记原样保留）；两侧各 2 个 → 合法的 `~~` 删除线，保持不动；其余（不成对的孤儿 run 等）跳过不碰。

每处独立判定，没有全局数量对齐，因此一份文档里混着区间误删、正常删除线、行内代码都不会互相干扰。定位从上一次匹配位置继续（单调前进），重复文本也不会回退错配。

### 为什么用 localStorage 而不是 Host 设置

DSH 的持久化设置要求先在 **Host 侧注册命名空间**（`ctx.settings.register`），客户端再 `ctx.settingsScope.bind` 绑定。本插件是纯展示开关，走 localStorage 可以**同步读取**，没有加载态、不会出现"先按默认渲染再闪一下"的问题，也不需要额外的 Host 半边。代价是设置不跨浏览器同步——对本地桌面应用可接受。

---

## 与参考浏览器插件的对应关系

| 浏览器插件能力 | 本插件 | 说明 |
| --- | --- | --- |
| 渲染器选择（marked / markdown-it / remark …） | 渲染模式（标准 / 纯文本 / 源码） | DSH 使用自有 mdast 管线，无法替换解析器；这里控制的是**呈现方式**。 |
| raw 开关 | 源码模式 | 对应。 |
| Emoji | Emoji 短代码 | 对应（内置短代码表，无外部依赖）。 |
| ToC | 目录 | 对应。 |
| content width / theme | 内容宽度 / 正文字号 | 部分对应；宽度受会话列宽限制。 |
| MathJax | — | DSH 已内置 KaTeX 渲染，且没有"关闭"开关。 |
| Prism 语法高亮 | — | DSH 已内置 shiki 高亮。 |
| Mermaid | — | **未包含**。需要额外打包 mermaid（约 2.5 MB），当前构建保持零运行时依赖；见「后续可做」。 |
| autoreload / origins / permissions | — | 面向浏览器扩展与本地文件，DSH 场景无意义。 |

---

## 开发

```powershell
pnpm install        # 依赖走公共 npm（见 .npmrc）
pnpm typecheck      # tsc --noEmit，无错误
pnpm build          # dist/index.js（Host 半边）+ client.js（浏览器半边）
pnpm test           # 针对构建产物的行为测试
pnpm check          # 上面三步串起来
```

### 测试

`scripts/smoke-test.mjs` 不重新 import 源码，而是**把构建出来的 `client.js` 当成 DSH 的浏览器模块加载器那样加载**（`window.__ModuleLoader__.load({id, factory})`，平台模块通过 `require` 注入），再用真实 React 渲染注册出来的组件。因此断言针对的是真正会发布的那份产物。

覆盖 25 项检查，包括：

- 包契约：`apply` / `inject` 导出、两个槽位注册、`priority: -100`、`locale: 'conversation'`、注册了镜像 `inject` 面；
- **默认配置下输出与内置渲染器逐字节相同**（无包裹元素）；
- 总开关关闭同样逐字节相同；
- **inject 面镜像**：带业务面的内置渲染器被正确委托（框架绑定 hook 后），无可委托对象时降级为自己渲染 Markdown；
- 三种模式的输出特征（`data-mdv-mode`、是否替换内置渲染器、是否保留原文）；
- **应用范围**：`isChatActive` / `isSidebarActive` 按范围与总开关分流；设置页渲染 6 个开关、3 个模式段、3 个下拉，总开关关闭时范围下拉置灰；
- 目录仅在 ≥2 个标题时生成，且链接指向每个标题；
- localStorage 读写、重载后恢复、损坏 JSON 的容错；
- 纯函数：标题提取（跳过代码围栏、剥离行内标记）、短代码替换、`isActive` / `isChatActive` / `isSidebarActive` 判定。

### 改完代码怎么生效

本插件通过目录联接（junction）挂进 profile，**宿主按文件内容实时计算 `rev` 并提供产物**。所以开发迭代只需要：

```powershell
pnpm build   # 重新生成 client.js
```

然后在浏览器里 **刷新页面** 即可加载新产物——**不需要重启 DSH**。 cordis 行、Host 半边这类 profile 加载时才读取的东西才需要重启。

### 产物格式

浏览器半边必须是 `window.__ModuleLoader__.load({ id, factory })` 形式，且 `id` 必须是本包名——模块系统会拒绝注册其它 id 的包。构建脚本按此包装。

对外部模块只保留 DSH **平台模块表**里的三个（`react`、`react/jsx-runtime`、`@deepseek-ai/dsh-client-ui-primitives`），其余全部打进产物，因此插件不依赖任何运行时安装。

---

## 已知限制

- **`settings.section` 依赖 DSH 的设置外壳**。该槽位由 `ui-settings-general` 声明；外壳被裁掉时 `ctx.slots.inject` 不会触发，设置页不出现（插件本身仍能渲染）。
- **内容宽度只能收窄**。消息位于会话列内部，无法超出列宽。
- **代码折叠作用于 `<pre>`**。若上游改变代码块的 DOM 结构，折叠可能不生效（不会报错）。
- **侧栏预览的「源码」依赖 `workspaceFiles/read` 接口**：文件过大时宿主可能截断（`eof: false`），此时只显示已读到的部分。
- **内容宽度受所在面板约束**：「较宽/全宽」只有在容器本身够宽时才有效果；「较窄」在两个 surface 都居中收窄。
- **Emoji 短代码表是精选子集**，不是完整 Unicode 表。
- **纯文本/源码模式下思考块与图片的呈现与标准模式不同**：这是模式本身的语义（"只看文字"），不是渲染缺陷。
- **浏览器扩展的 Mermaid、autoreload、origins 未实现**，原因见上表。

## 后续可做

- **Mermaid 图表**：把 `mermaid` 的 UMD 构建打进浏览器半边，在标准模式下扫描 `code.language-mermaid` 并替换为渲染结果。需要接受约 2.5 MB 的产物体积。
- **Host 持久化设置**：在 Host 半边用 `ctx.settings.register` 注册命名空间，客户端改用 `ctx.settingsScope`，可跨浏览器同步。
- **更多解析器选项**：DSH 未暴露 markdown 管线，无法在不 fork 上游的情况下实现。

## 目录结构

```
src/
  server/index.ts        Host 半边（空实现，仅为挂载 cordis 行）
  client/
    index.tsx            插件入口：注册两个槽位、注入样式、测试接缝
    assistant-view.tsx   assistant-step 渲染器：占用槽位、镜像内置 inject 面并委托 / 切换模式 / 降级边界
    content-view.tsx     纯文本 / 源码 / 独立富文本三种消息体渲染
    dom-features.ts      内容增强（幂等 DOM 变换）+ 标题提取
    settings.ts          偏好模型、localStorage 持久化、快照 store
    settings-page.tsx    设置页 UI
    sidebar-preview.ts   侧栏文档预览的个性化（DOM 装饰 + 源码拉取）
    emoji.ts             GitHub 短代码表
    locale.ts            中英文文案
    styles.ts            注入的样式表（仅用 --dsw-* 令牌）
scripts/
  build.mjs              esbuild 构建（Host 半边 + 浏览器半边）
  smoke-test.mjs         针对构建产物的行为测试
install.ps1              安装/卸载到 DSH profile
cordis.patch.yml         插件行（dsh.bundle.patch 指向它）
```

## License

MIT
