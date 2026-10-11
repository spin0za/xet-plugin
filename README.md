# 小鹅通播放助手 / Xiaoe Tech Player Helper

<p align="center">
  <img src="assets/goose-icon-master.png" width="256" height="256" alt="小鹅通播放助手图标 / Xiaoe Tech Player Helper icon">
</p>

一个适用于 Chrome 和 Edge 的本地扩展：默认选择小鹅通视频可用的最高画质，可设置默认最大音量，提供类似 YouTube 的播放快捷键，并可通过无界面请求保持登录。

A local Chrome and Edge extension that defaults to the highest available Xiaoe Tech video quality, optionally initializes maximum volume, adds YouTube-style playback shortcuts, and can keep a session active with invisible background requests.

[中文](#中文) · [English](#english)

> [!NOTE]
> 这是一个非官方社区项目，与小鹅通官方无隶属或合作关系。扩展不会绕过课程权限。
>
> This is an unofficial community project and is not affiliated with or endorsed by Xiaoe Tech. It does not bypass course access controls.

## 中文

### 功能

- 视频加载后自动选择播放器实际提供的最高画质，包括直播课的“原画”；优先比较明确的分辨率信息，没有超清时也会选择可用的最高档位，跳过禁用项和“自动”。
- 手动点击或用键盘选择画质后，当前视频不再被强制改回；切画质、暂停/继续、设置刷新不会清除该选择，打开下一段视频时重新默认最高画质。同页多个播放器分别处理。
- “默认最大音量”开启时，所有受支持页面的视频默认音量为 100%，直播与直播回放的音量滑块也同步到最大；加载后仍可手动调小或静音，不会被持续改回。新视频与页面内切换课程会重新初始化，切换画质不会重置手动音量；不调整系统音量或强制解除静音。可单独关闭该开关，不影响画质、快捷键和全屏功能。
- 支持小鹅通 xgplayer 课程播放器和打卡页面的原生 HTML5 视频。
- 跨域嵌入播放器遵循外层网站的启停设置；网页全屏会同时铺满外层页面，并支持在外层页面按 `T` 或 `Esc` 退出。
- 在线练习（含背题模式）、错题本练习及只读解析与考试解析中的视频预览统一为 16:9 横屏，最大 960 × 540，随可用宽度缩放；仅预览轻微裁切边缘，去除细黑边。加深预览顶部、底部的局部渐变，让白色标题与播放控件更清晰。
- 在线练习解析页每题右上角提供标记、收藏按钮，沿用网站原有保存接口。标记关联本次练习记录，收藏与网站原有题目收藏互通；支持鼠标、空格和回车操作，重新打开页面会读取已保存状态。
- 练习、背题、解析及错题本中的题目与选项文字可直接拖选，使用 Ctrl+C 或浏览器右键菜单复制；拖选选项文字不会同时提交答案。不修改网站的服务端设置，停用插件后恢复原有限制。
- 题干与选项中从富文本带入的特殊字体统一继承页面默认字体，覆盖原练习、背题、解析和错题本；去掉覆盖整段题目文字的导入加粗，保留局部强调、斜体、下划线及字号，不修改题目内容，公式和控件字体保持不变。
- 打开固定顺序的原练习或解析后，插件会在本机记录题目 ID 与题号；对应的错题本列表显示原题号，并按原题顺序排列，搜索与管理操作保持不变。首次没有记录时，请先打开原练习或解析一次；随机出题或无法对应的题目不猜填题号。不保存答案，也不改写网站数据。题号记录不设组数上限，不因新练习增加而自动淘汰；同一练习任务更新原记录，仍受 Chrome 本地存储总额度约束。
- 题号读取使用完整练习记录接口，无需逐题滚动加载。错题缺少任务 ID 时，可从同网站、同原练习的已验证记录中补全无冲突的题号；只有能够确认同一完整顺序时才合并排序，存在冲突时不猜填。
- 支持点击播放器画面播放或暂停，不影响进度条、音量、倍速和全屏按钮；播放时静止约 3 秒后隐藏控件，移动鼠标或暂停时显示。
- 普通课程、解析视频及直播/回放的全屏按钮与 `F` 使用相同入口；全屏和网页全屏均保留各播放器原有控件（倍速、音量、线路等），不替换为 Chrome 原生控件。移除移动端播放器覆盖整幅画面的渐变遮罩，退出后保留播放控件。
- 在原生全屏和插件管理的网页全屏之间单次按键无缝切换；网页全屏使用黑色背景、隐藏网站导航及其他页面控件、保留底部播放控件，并在窗口尺寸变化时保持视频完整显示。
- 输入框、搜索框、下拉框或可编辑笔记区域聚焦时自动停用快捷键；退出网页全屏的 `T` 和 `Esc` 除外。
- 可通过弹窗开发者模式在当前网站启用或停用插件；停用后自动画质、默认音量、快捷键、全屏增强、解析页按钮、文字选择增强、错题本题号排序和该网站的登录保活都会停止。
- 商家自定义课程域名可按网站单独授权，并可在独立的网站管理页中集中撤销或恢复。
- 可选的登录保活：Chrome 启动时检查，并在运行期间每 4 小时进行一次无界面请求。

### 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `←` / `→` | 后退 / 前进 5 秒 |
| `J` / `L` | 后退 / 前进 10 秒 |
| `K` | 暂停 / 继续播放 |
| `空格` | 暂停 / 继续播放 |
| `<` / `>` | 按播放器实际提供的档位降低 / 提高倍速，并同步控件；原生视频回退为 0.5～3 倍速 |
| `F` | 切换原生全屏 |
| `T` | 切换网页全屏 |
| `Esc` | 退出网页全屏 |

在常见键盘布局中，`<` 和 `>` 分别为 `Shift + ,` 和 `Shift + .`。

### 默认支持的网站

- `*.xiaoe-tech.com`
- `*.xiaoeknow.com`
- `*.eapps.cn`
- `*.xet-pc.citv.cn`
- `*.xet.pomoho.com`

如果课程使用其他商家域名，点击浏览器工具栏中的扩展图标，展开“开发者模式”，再选择“在此网站启用”。授权只针对当前域名。启用后，同一位置会显示红色的“在此网站停用”；开发者模式中的“管理已启用的网站”可打开完整列表。

网站管理页也可以从 `chrome://extensions` → 本扩展的“详情”→“扩展程序选项”打开。

### 安装

需要 Chrome 119 或更新版本，或基于 Chromium 119+ 的 Edge。

1. 下载或克隆本仓库。
2. 打开 Chrome 的 `chrome://extensions/`，或 Edge 的 `edge://extensions/`。
3. 开启右上角的“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择包含 `manifest.json` 的 `xet-plugin` 文件夹。
6. 刷新已经打开的小鹅通课程页面。

更新扩展时，获取最新代码后回到扩展程序管理页面，点击本扩展卡片上的“重新加载”，然后刷新课程页面。

### 工作方式与限制

- 扩展只选择播放器实际提供的画质，无法生成不存在的更高画质源。
- 快捷键直接控制当前可见或正在播放的视频。
- `T` 启用的网页全屏由扩展独立布局，不再依赖播放器不稳定的网页全屏样式；播放器会进入页面顶层，网站导航及周围页面内容会被隐藏且无法误触，视频则按比例缩放，剩余区域显示为黑色。
- 播放器界面或 DOM 结构升级后，识别逻辑可能需要同步调整。
- “默认最高画质”开关不会影响课程权限、购买状态或打卡规则。
- 弹窗依次为“默认最高画质”“默认最大音量”和“自动保持登录”，分别独立控制；前两项默认开启，已有画质开关的设置会保留。开发者模式中的网站级启用或停用控制插件在该网站上的全部功能。
- 停用自定义域名时，扩展会同时撤销该域名的 Chrome 访问权限并注销自动加载内容脚本；内置支持域名则通过扩展内部状态停用。
- “自动保持登录”默认关闭，只会请求根据受支持课程网站识别出的商家电脑端主页。
- 后台请求使用浏览器现有登录状态，但扩展不申请 Cookie 读取权限；续期由网站的正常响应完成。
- HTTP 请求完成不等于登录已续期。内部诊断会分别记录请求结果、明确的未登录响应与“无法确认”的登录状态，不保存响应正文或 Cookie。
- 电脑关机、Chrome 未运行或超过网站允许的登录有效期时，扩展无法恢复已经失效的登录。

### 本地验证

项目包含播放器和扩展界面的 Playwright 浏览器回归脚本，用于验证新旧播放器、原生视频、快捷键、全屏、网站启停、默认最高画质以及网站管理界面：

```bash
node tests/background-smoke.js
node tests/content-structure-smoke.js
node tests/analysis-icons-smoke.js
node tests/practice-analysis-source-smoke.js
node tests/question-order-source-smoke.js
node tests/question-typography-smoke.js
node tests/question-order-resolution-smoke.js
node tests/frame-policy-smoke.js
node tests/volume-smoke.js
node tests/playback-rate-smoke.js
node tests/quality-preference-smoke.js
node tests/options-smoke.js
node tests/popup-smoke.js
node tests/site-access-smoke.js
playwright-cli open about:blank --browser chrome
playwright-cli run-code "$(<output/playwright/verify-player-structures.js)"
playwright-cli run-code "$(<output/playwright/verify-fullscreen-controls.js)"
playwright-cli run-code "$(<output/playwright/verify-analysis-player.js)"
playwright-cli run-code "$(<output/playwright/verify-quality-lifecycle.js)"
playwright-cli run-code "$(<output/playwright/verify-highest-quality.js)"
playwright-cli run-code "$(<output/playwright/verify-quality-preference.js)"
playwright-cli run-code "$(<output/playwright/verify-player-focus.js)"
playwright-cli run-code "$(<output/playwright/verify-volume.js)"
playwright-cli run-code "$(<output/playwright/verify-playback-rate.js)"
# 在另一个终端从仓库根目录运行：python3 -m http.server 4173
playwright-cli run-code "$(<output/playwright/verify-extension-ui.js)"
```

## English

### Features

- Defaults to the highest quality offered by the player, including Original (原画) on live lessons. Explicit resolution metadata takes priority over marketing labels; disabled options and adaptive Auto mode are excluded. Videos without Ultra HD still default to their highest available rendition.
- After you select a quality option with the mouse or keyboard, the current video is no longer forced back. Quality reloads, pause/resume, and settings refreshes preserve your choice; the next video defaults to its highest available quality again. Players on the same page are handled independently.
- The **Default maximum volume** switch initializes supported videos to 100% volume and synchronizes the volume slider for live streams and replays. You can still lower the volume or mute afterward without it being continuously reset. New videos and in-page course changes initialize again; quality switches preserve manual volume. It does not change system volume or force unmuting. Turning this switch off leaves quality, shortcuts, and fullscreen features active.
- Supports both Xiaoe Tech's xgplayer course player and native HTML5 videos on clock-in pages.
- Cross-origin players follow the outer site's enable/disable policy. Page fullscreen also expands the hosting frames, and `T` or `Esc` can exit it from the outer page.
- Normalizes practice previews (including rote-review mode), error-book practice and readonly explanations, and exam analysis previews to responsive 16:9, up to 960 × 540, with a slight edge crop limited to previews to remove thin black borders. Darker gradients along the preview's top and bottom edges improve white title and control readability.
- Adds mark and favorite buttons to each question on practice analysis pages using the site's existing save endpoints. Marks belong to the practice attempt; favorites share the site's question collection. Supports mouse, Space and Enter, and reloads saved flags when reopening the page.
- Restores native selection, Ctrl+C and the browser context menu for question and option text in practice, rote review, analyses and the error book. Drag-selecting option text does not submit an answer. Server-side settings are unchanged, and disabling the extension restores the original restrictions.
- Makes imported rich-text font faces in questions and options inherit the page's default font across practice, rote review, analysis and error-book pages. Normalizes imported full-question bold while preserving partial emphasis, italics, underlines and sizes; formula and control fonts remain unchanged.
- Remembers question IDs and original numbers locally after opening a fixed-order practice or analysis. Its error-book list displays the original numbers and follows the original order without changing search, management, or site records. Open the original practice or analysis once to initialize the mapping; randomized or unmatched questions are never assigned guessed numbers. Answers are not stored. Mappings have no count limit or automatic eviction when new practices are added; recapturing the same practice task updates its existing record, subject to Chrome's total local-storage quota.
- Reads full practice records without scrolling through lazy-rendered questions. Missing task IDs can recover unambiguous numbers from verified mappings for the same merchant and source; sorting requires a confirmed common full order, and conflicts are never guessed.
- Clicking the player picture toggles playback without interfering with its controls. Controls hide after about three idle seconds during playback and reappear on mouse movement or pause.
- Makes the fullscreen button and `F` use the same entry point for course, analysis, live and replay players. Native and page fullscreen preserve each player's existing controls (speed, volume, stream selection, etc.) rather than replacing them with Chrome's native controls. Removes the mobile skin's full-picture gradient overlay and keeps playback controls after exiting.
- Switches directly between native fullscreen and extension-managed page fullscreen with one keystroke. Page fullscreen uses a black backdrop, hides the site's navigation and surrounding page controls, keeps the playback controls at the bottom, and preserves the complete video while the window is resized.
- Disables shortcuts while an input, search box, select control, or editable notes area has focus, except `T` and `Esc` for exiting page fullscreen.
- Lets you enable or disable the extension on the current site under Developer mode. Disabling a site stops automatic quality, default volume, shortcuts, fullscreen enhancements, analysis actions, text-selection enhancements, error-book numbering and sorting, and keep-alive activity for that site.
- Supports per-site grants for merchant-owned custom course domains, with a dedicated management page for revoking or restoring access.
- Optionally keeps the session active at Chrome startup and every four hours while Chrome is running.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `←` / `→` | Seek backward / forward 5 seconds |
| `J` / `L` | Seek backward / forward 10 seconds |
| `K` | Pause / resume playback |
| `Space` | Pause / resume playback |
| `<` / `>` | Step through the player's available speeds and synchronize its controls; native video falls back to 0.5x–3x |
| `F` | Toggle native fullscreen |
| `T` | Toggle page fullscreen |
| `Esc` | Exit page fullscreen |

On common keyboard layouts, `<` and `>` correspond to `Shift + ,` and `Shift + .`.

### Supported sites by default

- `*.xiaoe-tech.com`
- `*.xiaoeknow.com`
- `*.eapps.cn`
- `*.xet-pc.citv.cn`
- `*.xet.pomoho.com`

For a merchant-owned custom domain, click the extension icon, expand **Developer mode**, and choose **Enable on this site**. The permission applies only to the current domain. Once enabled, the same location shows a red **Disable on this site** action; use **Manage enabled sites** for the complete list.

You can also open the site manager from `chrome://extensions` → this extension's **Details** → **Extension options**.

### Installation

Requires Chrome 119+ or Edge based on Chromium 119 or later.

1. Download or clone this repository.
2. Open `chrome://extensions/` in Chrome or `edge://extensions/` in Edge.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `xet-plugin` directory that contains `manifest.json`.
6. Refresh any Xiaoe Tech course pages that were already open.

To update, pull or download the latest files, click **Reload** on the extension card, and then refresh the course page.

### How it works and limitations

- The extension selects only quality options exposed by the player. It cannot create a higher-quality source when one is unavailable.
- Shortcuts target the currently visible or actively playing video.
- Page fullscreen activated with `T` uses an extension-managed layout instead of the player's unstable page-fullscreen CSS. The player enters the page's top layer, hiding and blocking accidental interaction with site navigation and surrounding content. The video scales proportionally and any unused space stays black.
- Player UI or DOM updates may require corresponding selector updates.
- The automatic quality setting does not affect course permissions, purchases, or clock-in requirements.
- The popup presents **Default highest quality**, **Default maximum volume**, and **Automatic session keep-alive**, with independent switches in that order. Quality and volume default to on; existing quality preferences are preserved. The site-level action under Developer mode controls every extension feature on that site.
- Disabling a custom domain revokes its Chrome host permission and unregisters its automatically loaded content scripts. Built-in Xiaoe Tech domains are disabled through the extension's internal site state instead.
- Session keep-alive is off by default and requests only the merchant desktop homepage inferred from a supported course site.
- Background requests use the browser's existing login state without requesting cookie-reading permission; renewal is handled by the site's normal response.
- A completed HTTP request does not prove session renewal. Local diagnostics distinguish request results, explicit unauthenticated responses, and unknown session state; they do not store response bodies or cookies.
- The extension cannot restore an expired login while the computer is off, Chrome is not running, or the site's session lifetime has already elapsed.

### Local verification

The repository includes Playwright browser regressions covering legacy and current players, native video, keyboard shortcuts, fullscreen transitions, site lifecycle, automatic quality selection, and the site-management UI:

```bash
node tests/background-smoke.js
node tests/content-structure-smoke.js
node tests/frame-policy-smoke.js
node tests/question-typography-smoke.js
node tests/question-order-resolution-smoke.js
node tests/volume-smoke.js
node tests/playback-rate-smoke.js
node tests/quality-preference-smoke.js
node tests/options-smoke.js
node tests/popup-smoke.js
node tests/site-access-smoke.js
playwright-cli open about:blank --browser chrome
playwright-cli run-code "$(<output/playwright/verify-player-structures.js)"
playwright-cli run-code "$(<output/playwright/verify-fullscreen-controls.js)"
playwright-cli run-code "$(<output/playwright/verify-analysis-player.js)"
playwright-cli run-code "$(<output/playwright/verify-quality-lifecycle.js)"
playwright-cli run-code "$(<output/playwright/verify-highest-quality.js)"
playwright-cli run-code "$(<output/playwright/verify-quality-preference.js)"
playwright-cli run-code "$(<output/playwright/verify-player-focus.js)"
playwright-cli run-code "$(<output/playwright/verify-volume.js)"
playwright-cli run-code "$(<output/playwright/verify-playback-rate.js)"
# In another terminal at the repository root: python3 -m http.server 4173
playwright-cli run-code "$(<output/playwright/verify-extension-ui.js)"
```

## 项目结构 / Project structure

```text
manifest.json
icons/
popup/
options/
src/
  background.js
  content.js
  site-access.js
  practice-analysis-source.js
  content/
    player-dom.js
    volume.js
    analysis-layout.js
    analysis-icons.js
    analysis-feedback.js
    analysis-actions.js
    analysis-actions.css
    text-selection.js
    question-typography.js
    player-interactions.js
    fullscreen.js
    frame-coordinator.js
    fullscreen.css
    media-shortcuts.js
    quality-preference.js
    quality.js
    toast.js
output/playwright/
  verify-extension-ui.js
  verify-player-structures.js
  verify-analysis-player.js
  verify-analysis-frame-loading.js
  verify-analysis-actions.js
  verify-text-selection.js
  verify-question-typography.js
  verify-quality-lifecycle.js
  verify-highest-quality.js
  verify-quality-preference.js
  verify-player-focus.js
  verify-volume.js
  verify-playback-rate.js
  verify-mv3-integration.js
tests/
  background-smoke.js
  content-structure-smoke.js
  analysis-icons-smoke.js
  practice-analysis-source-smoke.js
  question-order-resolution-smoke.js
  question-typography-smoke.js
  frame-policy-smoke.js
  volume-smoke.js
  playback-rate-smoke.js
  quality-preference-smoke.js
  options-smoke.js
  popup-smoke.js
  site-access-smoke.js
```

## 真实扩展集成测试 / Real extension integration test

`verify-mv3-integration.js` 额外验证真实后台与双层跨域 iframe；`verify-analysis-actions.js` 验证解析页按钮与模拟保存接口、刷新恢复、键盘操作和异常处理；`verify-analysis-frame-loading.js` 验证嵌入视频延迟加载、重定向、更换地址、路由切换和停用时的通信，并检查是否出现域名不匹配报错。这些测试需要使用全新的持久 Chromium 测试配置，并通过 `--disable-extensions-except` 和 `--load-extension` 加载本仓库；不要使用个人浏览器配置。

`verify-mv3-integration.js` additionally checks the real service worker and two nested cross-origin frames. `verify-analysis-actions.js` checks analysis buttons against fixture save endpoints, reload persistence, keyboard access and error handling. `verify-analysis-frame-loading.js` checks delayed iframe loads, redirects, source changes, route transitions and site disable, including origin-mismatch console errors. These tests require a fresh persistent Chromium test profile with this repository loaded through `--disable-extensions-except` and `--load-extension`, never your personal browser profile.

`verify-text-selection.js` 同样需要上述独立的真实扩展测试配置；复刻网站的禁止选中与右键限制，验证实际鼠标拖选、Ctrl+C 复制、拖选不误答题、动态题目、路由切换及停用恢复。剪贴板权限仅授予测试浏览器中的夹具页面，插件不新增剪贴板权限。

`verify-text-selection.js` uses the same isolated real-extension profile to reproduce the site's selection/context-menu restrictions and verify native mouse selection, Ctrl+C, drag without submitting answers, dynamic questions, route changes and site disable. Clipboard permissions are granted only to the fixture in the test browser; the extension requests no additional clipboard permissions.

`verify-question-order.js` 使用同样的独立真实扩展配置与 Vue 2 夹具，验证无需滚动的完整原题号记录、缺少任务 ID 的补全与排序、冲突时不猜填并恢复原序、跨网站保留 50 组旧记录、重复读取不新增记录、搜索结果题号、排序后跳转与管理勾选、列表更新、停用恢复、随机题目和网络失败回退；删除操作仅作用于测试夹具，不修改真实错题本。

`verify-question-order.js` uses the same isolated real-extension profile and Vue 2 fixtures to verify original-number capture, retention of 50 prior mappings across sites, recapture without duplicate records, search result numbers, navigation and management after sorting, native list updates, site-disable restoration, randomized questions, and network failure fallback. Deletion tests affect only fixtures, never a real error book.

`verify-question-typography.js` 使用独立真实扩展配置，验证题干及选项的导入字体统一、强调与字号保留、公式和控件排除、动态内容、页面切换以及停用后的字体恢复，不读取或修改真实练习答案。

`verify-question-typography.js` uses an isolated real-extension profile to verify imported question and option fonts, preservation of emphasis and sizes, formula and control exclusions, dynamic content, route changes and restoration on site disable. It never reads or changes real practice answers.

## 许可证 / License

除另有说明及第三方素材外，本项目的原创代码与文档采用 [PolyForm Noncommercial License 1.0.0](LICENSE)。允许在许可证规定的非商业目的下使用、学习、修改和分发；商业使用需要向相关版权持有人另行取得授权。版权持有人仍保留对自己作品另行授权的权利。这属于源码可见（Source Available）项目，不属于 OSI 定义的开源软件。

Except where otherwise indicated and excluding third-party materials, the project's original code and documentation are licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). Noncommercial use, study, modification and redistribution are permitted under its terms; commercial use requires separate permission from the relevant copyright holder. Copyright holders retain the right to offer separate licenses for their own work. This is a source-available project, not OSI-defined open source.

授权范围与版权声明见 [NOTICE](NOTICE)。第三方库保留各自许可证，例如 [mux.js 的 Apache License 2.0](src/vendor/mux.js.LICENSE)；项目图标及游戏衍生素材不属于 PolyForm 授权范围，参见下方图标来源说明。

See [NOTICE](NOTICE) for the license scope and copyright notice. Third-party libraries retain their own licenses, including [mux.js's Apache License 2.0](src/vendor/mux.js.LICENSE). The project icon and game-derived assets are excluded from the PolyForm grant; see the icon attribution below.

## 图标来源 / Icon attribution

本项目图标基于《Age of Empires II: Definitive Edition》中的游戏素材制作，并依照 Microsoft 的 [Game Content Usage Rules](https://www.xbox.com/en-us/developers/rules) 用于这个免费、非商业的社区项目。该图标不是无版权素材，也不表示 Microsoft 对本项目的认可或合作。

The project icon is derived from game content from *Age of Empires II: Definitive Edition* and is used for this free, noncommercial community project under Microsoft's [Game Content Usage Rules](https://www.xbox.com/en-us/developers/rules). The icon is not a copyright-free asset and does not imply Microsoft's endorsement of or affiliation with this project.

> Age of Empires II: Definitive Edition © Microsoft Corporation. 小鹅通播放助手 / Xiaoe Tech Player Helper was created under Microsoft's “Game Content Usage Rules” using assets from Age of Empires II: Definitive Edition, and it is not endorsed by or affiliated with Microsoft.

## 版本 / Version

Current version: **1.15.5**

1.15.5：错题本题号显示简化为“5.”形式，题号匹配和排序不变。

1.15.5: Simplifies error-book number labels to “5.” without changing ordinal matching or sorting.

1.15.4：补全错题本中缺少任务 ID 的题号，并在确认同一完整顺序时排序；冲突时恢复原生顺序，不猜填题号。完整题号读取无需滚动加载。

1.15.4: Recovers unambiguous ordinals when error-book task IDs are missing and sorts only a confirmed common full order, restoring native order on conflicts. Full numbering capture does not require scrolling.

1.15.3：去掉整道题富文本带入的加粗，保留局部强调；动态加载、停用及页面切换时同步处理与恢复。

1.15.3: Normalizes imported full-question bold while preserving partial emphasis, including dynamic content and restoration on disable or route changes.

1.15.2：统一原练习、解析与错题本中题干和选项的导入字体；保留强调、字号、公式及控件样式，停用后恢复原样。

1.15.2: Normalizes imported question and option fonts across practice, analysis and error-book pages while preserving emphasis, sizes, formulas and controls, with restoration on site disable.

1.15.1：取消题号记录的 20 组上限及自动淘汰；新增练习不再删除旧映射，同一练习任务更新原记录。

1.15.1: Removes the 20-mapping limit and automatic eviction for original question numbers. New practices preserve earlier mappings; recapturing the same practice task updates its existing record.

1.15.0：固定顺序练习的错题本列表显示原题号并按原题顺序排列；在打开原练习或解析后自动记录本地对应关系，保留搜索、管理和跳转，不猜填随机或未知题号。

1.15.0: Restores original numbering and order in error-book lists for fixed-order practices, using local identity mappings captured from the original practice or analysis. Preserves native search, management and navigation; never guesses randomized or unknown numbers.

1.14.1：修复选项容器被误识别为不可选中文字的按钮；选项文字显示文本光标，保留点击、回车及空格答题，扩充真实选项结构回归测试。

1.14.1: Fixes answer rows being mistakenly excluded as buttons, shows a text cursor over option content, preserves click/Enter/Space answer actions, and tests the real ARIA-button option structure.

1.14.0：恢复练习相关页面题目与选项文字的原生选择、复制及右键菜单；拖选不误提交答案，网站停用时恢复原有限制。

1.14.0: Restores native question/option text selection, copying and context menus on evaluation pages, prevents drag-selection from submitting answers, and restores site restrictions when disabled.

1.13.6：错题本练习与只读解析复用已有横屏预览规则，保持尺寸、渐变及原有播放控件与其他解析模式一致。

1.13.6: Applies the shared landscape preview rules to error-book practice and readonly explanations, preserving consistent sizing, gradients and original player controls.

1.13.5：统一首次播放前后的预览标题栏和渐变显示，播放闲置时与底部控件一同隐藏，保留原有范围与颜色。

1.13.5: Keeps preview titles and gradients consistent before and after first playback, hiding both bars together during idle playback without changing their bounds or colors.

1.13.4：预览顶部、底部保留原有渐变边界，仅加深 20%，移除扩大范围的额外遮罩。

1.13.4: Preserves the original preview gradient bounds, darkens them by only 20%, and removes the oversized extra overlays.

1.13.3：修复嵌入视频加载期间的通信域名不匹配报错，支持延迟加载、重定向与页面切换后的预览样式同步。

1.13.3: Fixes iframe origin-mismatch errors during video loading and preserves preview styling across delayed loads, redirects and page transitions.

1.13.2：背题模式与解析页共用横屏预览规则；加深预览顶部和底部的局部渐变，保留原有控件与全屏行为。

1.13.2: Shares landscape preview rules between rote-review practice and analysis pages, with darker edge gradients while preserving original controls and fullscreen behavior.

1.13.1：解析页标记、收藏使用原站图标与按钮样式，答题卡标记采用原站圆形徽标；操作反馈复用网站的顶部居中提示组件。

1.13.1: Matches the site's original mark/favorite artwork, button styles and answer-card badges, and reuses its top-centered feedback messages.

1.13.0：为在线练习解析页恢复标记与收藏按钮，复用网站保存接口；交卷后可修改，刷新后保留状态，保存失败会提示。

1.13.0: Restores mark and favorite actions on practice analysis pages using the site's save endpoints, with post-submission editing, persisted flags and save-error feedback.

1.12.5：修复直播/回放的 `F` 键绕过原有播放器控件的问题，统一按钮与快捷键入口，同步播放器全屏状态；网页全屏保留原有控件及菜单，不再强行启用原生控件。

1.12.5: Fixes live/replay fullscreen shortcuts bypassing the original controls. Buttons and shortcuts share the SDK entry point and fullscreen state; page fullscreen preserves existing controls and menus without forcing native controls.

1.12.4：倍速快捷键通过播放器的实际菜单切换，同步实际播放速度、按钮文字和选中档位，并遵守直播或回放菜单的倍速范围。

1.12.4: Speed shortcuts use the player's available menu options, keeping playback speed, button text and selected options in sync while respecting live/replay speed limits.

主要变更：默认选择可用的最高画质，支持直播“原画”、更高分辨率与仅有高清的播放器；弹窗更名为“默认最高画质”，新增独立的“默认最大音量”开关，继续尊重当前视频的手动画质与音量选择。

Highlights: defaults to the highest available quality, including Original for live lessons, higher resolutions, and HD-only players. Renames the popup quality switch and adds an independent default-maximum-volume switch, preserving manual quality and volume choices for the current video.
