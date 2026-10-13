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
- 在线练习背题模式在题型旁提供“撤销”：清空已保存的本次答案、恢复选项和答题卡，允许重新作答；只移除插件能确认由本次作答新增的错题，保留历史错题。页面重新加载或无法确认错题来源时保留错题，不猜测删除；移除失败可“重试撤销”。不撤回网站的历史统计。
- 错题本列表的浏览器标签标题取自页面顶部标题文字，随加载和页面标题变化更新，不硬编码名称；练习记录页使用“练习记录”作为标签标题，不受内部页签、筛选条件影响。离开对应页面或停用插件时恢复网站标题。
- 练习、背题、解析及错题本中的题目与选项文字可直接拖选，使用 Ctrl+C 或浏览器右键菜单复制；拖选选项文字不会同时提交答案。不修改网站的服务端设置，停用插件后恢复原有限制。
- 题干与选项中从富文本带入的特殊字体统一继承页面默认字体，覆盖原练习、背题、解析和错题本；去掉覆盖整段题目文字的导入加粗，保留局部强调、斜体、下划线及字号，不修改题目内容，公式和控件字体保持不变。
- 错题本列表显示原题号，并按原题顺序排列，搜索与管理操作保持不变。有本地记录时立即显示；缺少记录时，默认从当前错题本页面直接请求网站接口，读取完整题序并保存，不打开练习页面、不新增标签页，也不答题或交卷。优先恢复未交卷记录，网站确认已交卷后才按固定顺序、完整题数开始新记录；因此仍可能新增正常答题记录。随机出题、受限或无法对应的题目不猜填题号，不保存答案。题号记录不设组数上限，不因新练习增加而自动淘汰；同一练习任务更新原记录，仍受 Chrome 本地存储总额度约束。
- 题号读取使用完整练习记录接口，无需逐题滚动加载。错题缺少任务 ID 时，可从同网站、同原练习的已验证记录中补全无冲突的题号；只有能够确认同一完整顺序时才合并排序，存在冲突时不猜填。
- 错题本未提供课程任务 ID 时，先通过网站自身的练习信息接口补全；支持网站以 `-1` 表示默认固定顺序。纯接口取号验证恢复记录的实际顺序与完整题数，不重建或改变用户已有的随机、部分题数或背题记录。无法验证来源或顺序时明确提示，不自动改用标签页、不反复创建答题记录。
- 同一网站、原练习和任务的完整题号一旦保存，之后手动打开练习或解析也直接复用，不重复查询配置、提取题序或改写记录；不同答题记录共用题号。首次读取失败仍可重试，缓存缺失或损坏时重新读取；不影响网站正常加载题目的请求。
- 本地题号表提前读取，当前页面内复用匹配索引；题目就绪、历史返回或记录更新后立即显示，无固定重试冷却等待。加载状态变化也会触发更新，停用后清理监听与内存缓存。
- 同一网站、原练习和任务的后台读取共用一个请求任务；停用网站、离开页面、关闭页面或两分钟超时时取消。任务状态、创建请求意图与已取得的记录 ID 保存在浏览器会话中，可跨后台进程重启恢复；创建响应丢失时不盲目重复创建。只使用已有的网站授权与登录状态，不读取 Cookie，不新增浏览器权限。
- 旧后台标签页方案暂时保留为开发者回退路径，默认不启用；不会在接口失败后自动弹出标签。开发者可在扩展后台控制台设置 `chrome.storage.local.set({questionOrderStrategy: "tabs"})` 后刷新错题本，恢复时改为 `"direct"`。这不是普通功能开关，待新路径实际使用确认后再移除旧实现。
- 支持点击播放器画面播放或暂停，不影响进度条、音量、倍速和全屏按钮；播放时静止约 3 秒后隐藏控件，移动鼠标或暂停时显示。
- 普通课程、解析视频及直播/回放的全屏按钮与 `F` 使用相同入口；全屏和网页全屏均保留各播放器原有控件（倍速、音量、线路等），不替换为 Chrome 原生控件。移除移动端播放器覆盖整幅画面的渐变遮罩，退出后保留播放控件。
- 在原生全屏和插件管理的网页全屏之间单次按键无缝切换；网页全屏使用黑色背景、隐藏网站导航及其他页面控件、保留底部播放控件，并在窗口尺寸变化时保持视频完整显示。
- 输入框、搜索框、下拉框或可编辑笔记区域聚焦时自动停用快捷键；退出网页全屏的 `T` 和 `Esc` 除外。
- 可通过弹窗开发者模式在当前网站启用或停用插件；停用后自动画质、默认音量、快捷键、全屏增强、解析页按钮、背题撤销、文字选择增强、错题本题号排序与标签标题增强和该网站的登录保活都会停止。
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
node tests/practice-undo-smoke.js
node tests/page-title-smoke.js
node tests/question-order-source-smoke.js
node tests/question-typography-smoke.js
node tests/question-order-resolution-smoke.js
node tests/question-order-performance-smoke.js
node tests/question-order-cache-smoke.js
node tests/question-order-jobs-smoke.js
node tests/question-order-direct-smoke.js
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
- Adds an Undo button beside the question type in rote practice. It clears the saved answer, resets options and answer-card state, and allows re-answering. Only verified error-book entries newly added by this answer are removed; historical, unknown, or reload-preceding entries are preserved. Failed removal can be retried. Historical site statistics are not rolled back.
- Derives the error-book list's browser-tab title from its page heading without hardcoded labels. The practice-record overview uses “练习记录” as its tab title, independent of inner tabs and filters. Leaving either page or disabling the extension restores the site's title.
- Restores native selection, Ctrl+C and the browser context menu for question and option text in practice, rote review, analyses and the error book. Drag-selecting option text does not submit an answer. Server-side settings are unchanged, and disabling the extension restores the original restrictions.
- Makes imported rich-text font faces in questions and options inherit the page's default font across practice, rote review, analysis and error-book pages. Normalizes imported full-question bold while preserving partial emphasis, italics, underlines and sizes; formula and control fonts remain unchanged.
- Displays original numbers and ordering in the error book without changing search or management. Cached numbers appear immediately; missing mappings use same-origin site requests from the current book, without loading a practice page or opening a tab. Unfinished attempts are resumed; confirmed submitted attempts may start one fixed/full unanswered record. Random, partial, restricted or unmatched orders are never guessed, and answers are not stored. Mappings have no count limit or automatic eviction, subject to Chrome's total local-storage quota.
- Reads full practice records without scrolling through lazy-rendered questions. Missing task IDs can recover unambiguous numbers from verified mappings for the same merchant and source; sorting requires a confirmed common full order, and conflicts are never guessed.
- Resolves missing course task IDs using the site's practice-info endpoint and recognizes its `-1` default-fixed setting. Direct requests verify the resumed attempt's actual generation settings and full length without replacing an existing random, partial or rote attempt. Unverified metadata receives explicit feedback without automatically opening a helper or repeatedly creating attempts.
- Preloads local numbering and reuses lookup indexes within the page. Readiness, history return and mapping updates trigger rendering without a fixed retry cooldown; reactive loading changes are detected, and disabling cleans up watchers and memory caches.
- Once a complete order is saved for an exact merchant/practice/task, manual practice and analysis visits reuse it across attempts without repeating config/order queries or rewriting the record. Failed captures remain retryable; missing or invalid mappings are recaptured. The site's normal question-loading requests are unaffected.
- Concurrent error-book pages share one request job per merchant, source and task. Session-backed state preserves mutation intent and returned record IDs across worker restarts; uncertain creation responses are never blindly replayed. Site disable, navigation, tab closure and a two-minute deadline cancel pending work. Existing site grants and authentication suffice; no cookie-reading or new permissions are required. The legacy tab strategy remains an explicit developer rollback (`questionOrderStrategy: "tabs"` in extension local storage); default `"direct"` never falls back to tabs automatically.
- Clicking the player picture toggles playback without interfering with its controls. Controls hide after about three idle seconds during playback and reappear on mouse movement or pause.
- Makes the fullscreen button and `F` use the same entry point for course, analysis, live and replay players. Native and page fullscreen preserve each player's existing controls (speed, volume, stream selection, etc.) rather than replacing them with Chrome's native controls. Removes the mobile skin's full-picture gradient overlay and keeps playback controls after exiting.
- Switches directly between native fullscreen and extension-managed page fullscreen with one keystroke. Page fullscreen uses a black backdrop, hides the site's navigation and surrounding page controls, keeps the playback controls at the bottom, and preserves the complete video while the window is resized.
- Disables shortcuts while an input, search box, select control, or editable notes area has focus, except `T` and `Esc` for exiting page fullscreen.
- Lets you enable or disable the extension on the current site under Developer mode. Disabling a site stops automatic quality, default volume, shortcuts, fullscreen enhancements, analysis actions, rote-practice undo, text-selection enhancements, error-book numbering, sorting and tab-title enhancement, and keep-alive activity for that site.
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
node tests/practice-undo-smoke.js
node tests/page-title-smoke.js
node tests/question-typography-smoke.js
node tests/question-order-resolution-smoke.js
node tests/question-order-performance-smoke.js
node tests/question-order-cache-smoke.js
node tests/question-order-jobs-smoke.js
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
  practice-undo-source.js
  question-order-source.js
  question-order-jobs.js
  content/
    player-dom.js
    volume.js
    analysis-layout.js
    analysis-icons.js
    analysis-feedback.js
    analysis-actions.js
    analysis-actions.css
    practice-undo.js
    practice-undo.css
    page-title.js
    text-selection.js
    question-typography.js
    question-order.js
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
  verify-practice-undo.js
  verify-page-title.js
  verify-text-selection.js
  verify-question-typography.js
  verify-question-order.js
  verify-question-order-auto.js
  verify-question-order-course.js
  verify-question-order-direct.js
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
  practice-undo-smoke.js
  page-title-smoke.js
  question-order-resolution-smoke.js
  question-order-performance-smoke.js
  question-order-cache-smoke.js
  question-order-jobs-smoke.js
  question-order-direct-smoke.js
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

`verify-page-title.js` 验证错题本标签标题的 DOM 提取、延迟加载、动态改名，以及练习记录页标题、内部页签切换、网站清空标题、单页导航、后台更新与停用恢复；同样使用独立的真实 MV3 测试配置及模拟页面。

`verify-page-title.js` checks DOM-derived error-book titles, delayed and changed headings, the practice-record title and inner-tab changes, site title resets, SPA navigation, background-safe updates and restoration on disable in an isolated MV3 profile with fixture pages.

`verify-practice-undo.js` 验证真实 MV3 扩展的背题撤销按钮、保存清空、选项高亮清除、重新作答、历史错题保留、新错题移除、失败重试、键盘操作及网站停用清理。夹具加载版本固定的公开 Vue 运行时与网站选项组件，需要联网；答题接口全部隔离，不操作个人账号。也验证撤销请求未结束时的点击与键盘不会制造未保存的蓝色选项。使用下述全新扩展测试配置运行：`playwright-cli run-code "$(<output/playwright/verify-practice-undo.js)"`。

`verify-practice-undo.js` loads version-pinned public Vue/site selection components (network required) and tests the real MV3 extension's undo UI, private selection state and white markers after clearing, pending mouse/keyboard interactions, re-answering, old/new error-entry handling, retries and site-disable cleanup. Answer endpoints are isolated fixtures, without touching a personal account. Run it with the fresh extension test profile described below.

`verify-mv3-integration.js` 额外验证真实后台与双层跨域 iframe；`verify-analysis-actions.js` 验证解析页按钮与模拟保存接口、刷新恢复、键盘操作和异常处理；`verify-analysis-frame-loading.js` 验证嵌入视频延迟加载、重定向、更换地址、路由切换和停用时的通信，并检查是否出现域名不匹配报错。这些测试需要使用全新的持久 Chromium 测试配置，并通过 `--disable-extensions-except` 和 `--load-extension` 加载本仓库；不要使用个人浏览器配置。

`verify-mv3-integration.js` additionally checks the real service worker and two nested cross-origin frames. `verify-analysis-actions.js` checks analysis buttons against fixture save endpoints, reload persistence, keyboard access and error handling. `verify-analysis-frame-loading.js` checks delayed iframe loads, redirects, source changes, route transitions and site disable, including origin-mismatch console errors. These tests require a fresh persistent Chromium test profile with this repository loaded through `--disable-extensions-except` and `--load-extension`, never your personal browser profile.

`verify-text-selection.js` 同样需要上述独立的真实扩展测试配置；复刻网站的禁止选中与右键限制，验证实际鼠标拖选、Ctrl+C 复制、拖选不误答题、动态题目、路由切换及停用恢复。剪贴板权限仅授予测试浏览器中的夹具页面，插件不新增剪贴板权限。

`verify-text-selection.js` uses the same isolated real-extension profile to reproduce the site's selection/context-menu restrictions and verify native mouse selection, Ctrl+C, drag without submitting answers, dynamic questions, route changes and site disable. Clipboard permissions are granted only to the fixture in the test browser; the extension requests no additional clipboard permissions.

`verify-question-order.js` 使用同样的独立真实扩展配置与 Vue 2 夹具，验证加载完成（含无 DOM 变化）和历史返回时及时显示、监听清理、无需滚动的完整原题号记录、缺少任务 ID 的补全与排序、冲突时不猜填并恢复原序、跨网站保留 50 组旧记录、重复读取不新增记录、搜索结果题号、排序后跳转与管理勾选、列表更新、停用恢复、随机题目和网络失败回退；删除操作仅作用于测试夹具，不修改真实错题本。题目已显示但原题号识别失败时，会显示重试提示，不再静默退出。

`verify-question-order.js` uses the same isolated real-extension profile and Vue 2 fixtures to verify immediate loading completion (including no DOM changes) and history return, watcher cleanup, original-number capture, retention of 50 prior mappings across sites, recapture without duplicate records, search result numbers, navigation and management after sorting, native list updates, site-disable restoration, randomized questions, and network failure fallback. Deletion tests affect only fixtures, never a real error book.

`question-order-performance-smoke.js` 验证就绪通知不等待计时器、预读及返回时复用本地索引、记录变更失效缓存、并发读取与停用期间的竞态；仅使用模拟数据。

`question-order-performance-smoke.js` verifies readiness without waiting for timer ticks, preloading and history-return cache reuse, mapping invalidation, concurrent reads and disable-time races using synthetic data only.

`question-order-cache-smoke.js` 验证练习、解析及后台页面命中完整缓存时不再查询或写入、不同答题记录共用映射、网站与任务隔离，以及删除、损坏、读取失败和保存失败后的重试。真实 MV3 夹具 `verify-question-order.js` 同时检查重复手动打开练习及解析的额外请求数为零、原记录不变。

`question-order-cache-smoke.js` verifies zero-query/zero-write cache hits across practice, analysis and helper pages, cross-attempt reuse, merchant/task isolation, and retries after deletion, corruption or failed reads/saves. The real MV3 fixture `verify-question-order.js` also checks zero extra requests and unchanged records on repeated manual practice/analysis visits.

`question-order-source-smoke.js` 同时覆盖数字与字符串错题本 ID（包括 `228976328`）、不同 ID/来源的拒绝，以及异常值和不安全数字的拒绝，确保类型兼容不放宽身份校验。

`question-order-jobs-smoke.js` 验证后台标签页去重、配置检查、授权边界、后台进程重启、完成与超时清理，以及用户激活或导航后的保护。`verify-question-order-auto.js` 在独立真实 MV3 浏览器与 Vue 2 夹具中验证数字 ID 的首次自动读取、多个错题本共用一个后台练习、切换数字 ID 的错题本、身份不匹配提示及恢复、缓存命中不重新进入练习、缺少任务 ID 的补全、随机题目跳过和网络失败清理；所有练习请求均使用模拟数据，不读取真实答案。

`question-order-source-smoke.js` also checks matching numeric/string book IDs (including `228976328`), mismatched IDs/sources, invalid values and unsafe numbers. Recognition failures on populated pages show retry feedback rather than failing silently.

`question-order-jobs-smoke.js` checks coalescing, config validation, authorization, restart recovery and owned-tab cleanup. `verify-question-order-auto.js` uses real MV3 and Vue 2 fixtures in an isolated browser to verify numeric-ID first capture and navigation, mismatch feedback and recovery, concurrent books sharing one helper, cache-only revisits, missing-task recovery, random-paper exclusion and failure cleanup. All practice requests use synthetic data.

`verify-question-order-course.js` 复现课程错题全部缺少任务 ID、固定顺序返回 `-1`、原练习跳转配置页并丢失任务标记的完整链路：验证 34 题完整记录、7 个错题号、网站原有开始操作仅调用一次、后台页关闭、手动配置页不被操作，以及再次访问零额外请求。无头浏览器中的后台文档可见性由夹具模拟；标签页的激活状态和所有 MV3 代码保持真实。单元测试另覆盖读取已完成才恢复标记、隐藏页绘制暂停和失败/超时提示，避免仅用配置查询成功代替完整取号验证。

`verify-question-order-course.js` reproduces all-taskless course cards, the site's `-1` fixed default, native configuration redirects and lost job markers. It verifies the full 34-question mapping, seven ordinals, one native start, owned-helper cleanup, untouched manual configuration and zero-request cache revisits. Headless document visibility is modeled in the fixture; actual tab activation and MV3 extension code remain real. Unit tests additionally cover capture-before-marker restoration, paused background frames and terminal failure feedback.

`question-order-direct-smoke.js` 验证实际网站的纯接口参数、恢复与新建记录、完整顺序校验、不保存答案、并发去重、页面离开和网站停用取消、后台重启及响应丢失时不重复创建。`verify-question-order-direct.js` 使用独立真实 MV3 扩展、Vue 2 错题本与模拟接口，端到端验证 22/34 题题号、同时打开两个错题本时只创建一次、缓存再次访问零请求、恢复背题模式不改变配置、失败提示以及全程零新标签、零练习页面加载；旧方案回归显式切换到 `"tabs"`，测试结束恢复默认 `"direct"`。

`question-order-direct-smoke.js` covers native direct API payloads, resume/new generation, full-only IDs, coalescing, cancellation, worker restarts and uncertain mutation responses. `verify-question-order-direct.js` uses real MV3/Vue 2 with isolated synthetic APIs to verify 22/34-question numbering, one generation across concurrent books, zero-request cache revisits, preserved existing rote mode, failure feedback, zero new tabs and zero practice-page loads. Legacy integration tests explicitly select `"tabs"` and restore default `"direct"` on completion.

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

Current version: **1.17.6**

1.17.6：默认通过网站接口读取错题本完整原题号，不打开练习页面或新增标签；优先恢复已有记录，并保护已有随机、部分题数和背题设置。补齐请求去重、取消、后台重启与创建响应丢失的安全处理；旧标签页方案暂时保留，失败不自动回退。

1.17.6: Defaults to direct site requests for full error-book numbering without practice-page loads or new tabs. Preserves existing attempts/settings, adds coalescing, cancellation and mutation-safe restart recovery, and retains the legacy tab strategy without automatic fallback.

1.16.1：手动打开练习或解析时优先复用同一网站、原练习和任务的完整题号缓存，跳过重复查询与保存；不同答题记录共享映射，失败或缓存缺失、损坏仍可重读。

1.16.1: Reuses complete merchant/practice/task numbering on manual practice and analysis visits, skipping repeated queries and writes across attempts while allowing recapture after failures or missing/invalid caches.

1.16.0：错题本缺少题号时自动后台打开原练习、读取完整题序并关闭；有缓存直接显示。后台任务去重、会话恢复和超时清理，不抢焦点、不答题、不交卷，也不新增权限。

1.16.0: Automatically captures missing error-book numbering through an inactive original-practice tab, closes it after persistence, and renders cache hits immediately. Adds coalescing, session recovery and deadline cleanup without answering, submitting or adding permissions.

1.15.6：移除题号显示的固定重试等待；预读并复用本地索引，加载完成和返回页面时直接更新，记录变更同步失效缓存，停用后清理监听。

1.15.6: Removes fixed numbering retry delays, preloads and reuses local indexes, renders on reactive readiness and history return, and invalidates caches on mapping changes with cleanup on disable.

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
