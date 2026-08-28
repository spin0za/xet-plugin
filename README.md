# 小鹅通播放助手 / Xiaoe Tech Player Helper

<p align="center">
  <img src="icons/icon-128.png" width="96" height="96" alt="小鹅通播放助手图标 / Xiaoe Tech Player Helper icon">
</p>

一个适用于 Chrome 和 Edge 的本地扩展：自动选择小鹅通视频的“超清”画质，提供类似 YouTube 的播放快捷键，并可通过无界面请求保持登录。

A local Chrome and Edge extension that automatically selects the highest supported Xiaoe Tech video quality, adds YouTube-style playback shortcuts, and can keep a session active with invisible background requests.

[中文](#中文) · [English](#english)

> [!NOTE]
> 这是一个非官方社区项目，与小鹅通官方无隶属或合作关系。扩展不会绕过课程权限，也不会下载视频。
>
> This is an unofficial community project and is not affiliated with or endorsed by Xiaoe Tech. It does not bypass course access controls or download videos.

## 中文

### 功能

- 视频加载后自动选择播放器已有的“超清”、1080P 或蓝光画质。
- 支持小鹅通 xgplayer 课程播放器和打卡页面的原生 HTML5 视频。
- 在原生全屏和网页全屏之间单次按键无缝切换。
- 输入框、搜索框、下拉框或可编辑笔记区域聚焦时自动停用快捷键；退出网页全屏的 `T` 和 `Esc` 除外。
- 可在扩展弹窗中全局暂停，或只对当前网站暂停。
- 商家自定义课程域名可按网站单独授权。
- 可选的登录保活：Chrome 启动时检查，并在运行期间每 4 小时进行一次无界面请求。
- 提供“立即测试”，不会创建标签页，也不会直接读取或保存 Cookie；续期由网站的正常响应完成。

### 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `←` / `→` | 后退 / 前进 5 秒 |
| `J` / `L` | 后退 / 前进 10 秒 |
| `K` | 暂停 / 继续播放 |
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

如果课程使用其他商家域名，点击浏览器工具栏中的扩展图标，再选择“在此网站启用”。授权只针对当前域名。

### 安装

1. 下载或克隆本仓库。
2. 打开 Chrome 的 `chrome://extensions/`，或 Edge 的 `edge://extensions/`。
3. 开启右上角的“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择包含 `manifest.json` 的 `xet-plugin` 文件夹。
6. 刷新已经打开的小鹅通课程页面。

更新扩展时，获取最新代码后回到扩展程序管理页面，点击本扩展卡片上的“重新加载”，然后刷新课程页面。

### 工作方式与限制

- 扩展只选择播放器实际提供的画质；如果视频没有超清源，则无法生成更高画质。
- 快捷键直接控制当前可见或正在播放的视频。
- 播放器界面或 DOM 结构升级后，识别逻辑可能需要同步调整。
- 自动超清开关不会影响课程权限、购买状态或打卡规则。
- “自动保持登录”默认关闭，只会请求弹窗中显示的商家电脑端主页。
- 后台请求使用浏览器现有登录状态，但扩展不申请 Cookie 读取权限。请先用“立即测试”并在开发者工具中确认 `pc_user_key` 的到期时间确实延长。
- 电脑关机、Chrome 未运行或超过网站允许的登录有效期时，扩展无法恢复已经失效的登录。

### 本地验证

项目包含一个 Playwright 浏览器回归脚本，用于验证新旧播放器、原生视频、快捷键、全屏切换和自动超清逻辑：

```bash
node tests/background-smoke.js
playwright-cli open about:blank --browser firefox
playwright-cli run-code "$(<output/playwright/verify-player-structures.js)"
```

## English

### Features

- Automatically selects an available Ultra HD, 1080P, or Blu-ray quality option after the video loads.
- Supports both Xiaoe Tech's xgplayer course player and native HTML5 videos on clock-in pages.
- Switches directly between native fullscreen and page fullscreen with one keystroke.
- Disables shortcuts while an input, search box, select control, or editable notes area has focus, except `T` and `Esc` for exiting page fullscreen.
- Supports global pause and per-site pause from the extension popup.
- Allows one-site permission grants for merchant-owned custom course domains.
- Optionally keeps the session active at Chrome startup and every four hours while Chrome is running.
- Includes a **Test now** action that creates no tab and does not directly read or store cookies; renewal is handled by the site's normal response.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `←` / `→` | Seek backward / forward 5 seconds |
| `J` / `L` | Seek backward / forward 10 seconds |
| `K` | Pause / resume playback |
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

For a merchant-owned custom domain, click the extension icon in the browser toolbar and choose “Enable on this site.” The permission applies only to the current domain.

### Installation

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
- Player UI or DOM updates may require corresponding selector updates.
- The automatic quality setting does not affect course permissions, purchases, or clock-in requirements.
- Session keep-alive is off by default and requests only the merchant desktop homepage shown in the popup.
- Background requests use the browser's existing login state without requesting cookie-reading permission. Use **Test now** first, then verify in DevTools that the `pc_user_key` expiration moved forward.
- The extension cannot restore an expired login while the computer is off, Chrome is not running, or the site's session lifetime has already elapsed.

### Local verification

The repository includes a Playwright browser regression script covering legacy and current players, native video, keyboard shortcuts, fullscreen transitions, and automatic quality selection:

```bash
node tests/background-smoke.js
playwright-cli open about:blank --browser firefox
playwright-cli run-code "$(<output/playwright/verify-player-structures.js)"
```

## 项目结构 / Project structure

```text
manifest.json
icons/
popup/
src/
  background.js
  content.js
output/playwright/
  verify-player-structures.js
tests/
  background-smoke.js
```

## 版本 / Version

Current version: **1.8.1**

主要变更：网页全屏现在可通过 `T` 或 `Esc` 退出，并保留无界面登录保活、自动超清、播放控制、倍速和双全屏快捷键。

Highlights: page fullscreen can now be exited with either `T` or `Esc`, alongside invisible session keep-alive, automatic quality selection, playback controls, speed controls, and two fullscreen modes.
