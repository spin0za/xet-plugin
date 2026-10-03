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
- 在线练习与考试解析中的视频预览统一为 16:9 横屏，最大 960 × 540，随可用宽度缩放；仅预览轻微裁切边缘，去除细黑边。
- 支持点击播放器画面播放或暂停，不影响进度条、音量、倍速和全屏按钮；播放时静止约 3 秒后隐藏控件，移动鼠标或暂停时显示。
- 播放器全屏按钮与 `F` 使用相同的原生全屏入口；移除移动端播放器覆盖整幅画面的渐变遮罩，退出后保留播放控件。
- 在原生全屏和插件管理的网页全屏之间单次按键无缝切换；网页全屏使用黑色背景、隐藏网站导航及其他页面控件、保留底部播放控件，并在窗口尺寸变化时保持视频完整显示。
- 输入框、搜索框、下拉框或可编辑笔记区域聚焦时自动停用快捷键；退出网页全屏的 `T` 和 `Esc` 除外。
- 可通过弹窗开发者模式在当前网站启用或停用插件；停用后自动画质、默认音量、快捷键、全屏增强和该网站的登录保活都会停止。
- 商家自定义课程域名可按网站单独授权，并可在独立的网站管理页中集中撤销或恢复。
- 可选的登录保活：Chrome 启动时检查，并在运行期间每 4 小时进行一次无界面请求。

### 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `←` / `→` | 后退 / 前进 5 秒 |
| `J` / `L` | 后退 / 前进 10 秒 |
| `K` | 暂停 / 继续播放 |
| `空格` | 暂停 / 继续播放 |
| `<` / `>` | 降低 / 提高播放速度（0.5～3 倍速） |
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
node tests/frame-policy-smoke.js
node tests/volume-smoke.js
node tests/quality-preference-smoke.js
node tests/options-smoke.js
node tests/popup-smoke.js
node tests/site-access-smoke.js
playwright-cli open about:blank --browser chrome
playwright-cli run-code "$(<output/playwright/verify-player-structures.js)"
playwright-cli run-code "$(<output/playwright/verify-analysis-player.js)"
playwright-cli run-code "$(<output/playwright/verify-quality-lifecycle.js)"
playwright-cli run-code "$(<output/playwright/verify-highest-quality.js)"
playwright-cli run-code "$(<output/playwright/verify-quality-preference.js)"
playwright-cli run-code "$(<output/playwright/verify-player-focus.js)"
playwright-cli run-code "$(<output/playwright/verify-volume.js)"
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
- Normalizes practice and exam analysis previews to responsive 16:9, up to 960 × 540, with a slight edge crop limited to previews to remove thin black borders.
- Clicking the player picture toggles playback without interfering with its controls. Controls hide after about three idle seconds during playback and reappear on mouse movement or pause.
- Makes the player's fullscreen button and `F` use the same native fullscreen entry point, removes the mobile skin's full-picture gradient overlay, and keeps playback controls visible after exiting.
- Switches directly between native fullscreen and extension-managed page fullscreen with one keystroke. Page fullscreen uses a black backdrop, hides the site's navigation and surrounding page controls, keeps the playback controls at the bottom, and preserves the complete video while the window is resized.
- Disables shortcuts while an input, search box, select control, or editable notes area has focus, except `T` and `Esc` for exiting page fullscreen.
- Lets you enable or disable the extension on the current site under Developer mode. Disabling a site stops automatic quality, default volume, shortcuts, fullscreen enhancements, and keep-alive activity for that site.
- Supports per-site grants for merchant-owned custom course domains, with a dedicated management page for revoking or restoring access.
- Optionally keeps the session active at Chrome startup and every four hours while Chrome is running.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `←` / `→` | Seek backward / forward 5 seconds |
| `J` / `L` | Seek backward / forward 10 seconds |
| `K` | Pause / resume playback |
| `Space` | Pause / resume playback |
| `<` / `>` | Decrease / increase playback speed (0.5x–3x) |
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
node tests/volume-smoke.js
node tests/quality-preference-smoke.js
node tests/options-smoke.js
node tests/popup-smoke.js
node tests/site-access-smoke.js
playwright-cli open about:blank --browser chrome
playwright-cli run-code "$(<output/playwright/verify-player-structures.js)"
playwright-cli run-code "$(<output/playwright/verify-analysis-player.js)"
playwright-cli run-code "$(<output/playwright/verify-quality-lifecycle.js)"
playwright-cli run-code "$(<output/playwright/verify-highest-quality.js)"
playwright-cli run-code "$(<output/playwright/verify-quality-preference.js)"
playwright-cli run-code "$(<output/playwright/verify-player-focus.js)"
playwright-cli run-code "$(<output/playwright/verify-volume.js)"
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
  content/
    player-dom.js
    volume.js
    analysis-layout.js
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
  verify-quality-lifecycle.js
  verify-highest-quality.js
  verify-quality-preference.js
  verify-player-focus.js
  verify-volume.js
  verify-mv3-integration.js
tests/
  background-smoke.js
  content-structure-smoke.js
  frame-policy-smoke.js
  volume-smoke.js
  quality-preference-smoke.js
  options-smoke.js
  popup-smoke.js
  site-access-smoke.js
```

## 真实扩展集成测试 / Real extension integration test

`verify-mv3-integration.js` 额外验证真实后台与双层跨域 iframe，需要使用全新的持久 Chromium 测试配置，并通过 `--disable-extensions-except` 和 `--load-extension` 加载本仓库；不要使用个人浏览器配置。

`verify-mv3-integration.js` additionally checks the real service worker and two nested cross-origin frames. Use a fresh persistent Chromium test profile with this repository loaded through `--disable-extensions-except` and `--load-extension`, never your personal browser profile.

## 图标来源 / Icon attribution

本项目图标基于《Age of Empires II: Definitive Edition》中的游戏素材制作，并依照 Microsoft 的 [Game Content Usage Rules](https://www.xbox.com/en-us/developers/rules) 用于这个免费、非商业的社区项目。该图标不是无版权素材，也不表示 Microsoft 对本项目的认可或合作。

The project icon is derived from game content from *Age of Empires II: Definitive Edition* and is used for this free, noncommercial community project under Microsoft's [Game Content Usage Rules](https://www.xbox.com/en-us/developers/rules). The icon is not a copyright-free asset and does not imply Microsoft's endorsement of or affiliation with this project.

> Age of Empires II: Definitive Edition © Microsoft Corporation. 小鹅通播放助手 / Xiaoe Tech Player Helper was created under Microsoft's “Game Content Usage Rules” using assets from Age of Empires II: Definitive Edition, and it is not endorsed by or affiliated with Microsoft.

## 版本 / Version

Current version: **1.12.3**

主要变更：默认选择可用的最高画质，支持直播“原画”、更高分辨率与仅有高清的播放器；弹窗更名为“默认最高画质”，新增独立的“默认最大音量”开关，继续尊重当前视频的手动画质与音量选择。

Highlights: defaults to the highest available quality, including Original for live lessons, higher resolutions, and HD-only players. Renames the popup quality switch and adds an independent default-maximum-volume switch, preserving manual quality and volume choices for the current video.
