# 小鹅通播放助手 / XiaoeTong Player Helper

<p align="center">
  <img src="icons/icon-128.png" width="96" height="96" alt="小鹅通播放助手图标 / XiaoeTong Player Helper icon">
</p>

一个适用于 Chrome 和 Edge 的本地扩展：自动选择小鹅通视频的“超清”画质，并提供类似 YouTube 的播放快捷键。

A local Chrome and Edge extension that automatically selects the highest supported XiaoeTong video quality and adds YouTube-style playback shortcuts.

[中文](#中文) · [English](#english)

> [!NOTE]
> 这是一个非官方社区项目，与小鹅通官方无隶属或合作关系。扩展不会绕过课程权限，也不会下载视频。
>
> This is an unofficial community project and is not affiliated with or endorsed by XiaoeTong. It does not bypass course access controls or download videos.

## 中文

### 功能

- 视频加载后自动选择播放器已有的“超清”、1080P 或蓝光画质。
- 支持小鹅通 xgplayer 课程播放器和打卡页面的原生 HTML5 视频。
- 在原生全屏和网页全屏之间单次按键无缝切换。
- 输入框、搜索框、下拉框或可编辑笔记区域聚焦时自动停用快捷键。
- 可在扩展弹窗中全局暂停，或只对当前网站暂停。
- 商家自定义课程域名可按网站单独授权。

### 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `←` / `→` | 后退 / 前进 5 秒 |
| `J` / `L` | 后退 / 前进 10 秒 |
| `K` | 暂停 / 继续播放 |
| `<` / `>` | 降低 / 提高播放速度（0.5～3 倍速） |
| `F` | 切换原生全屏 |
| `T` | 切换网页全屏 |

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

### 本地验证

项目包含一个 Playwright 浏览器回归脚本，用于验证新旧播放器、原生视频、快捷键、全屏切换和自动超清逻辑：

```bash
playwright-cli open about:blank --browser firefox
playwright-cli run-code "$(<output/playwright/verify-player-structures.js)"
```

## English

### Features

- Automatically selects an available Ultra HD, 1080P, or Blu-ray quality option after the video loads.
- Supports both XiaoeTong's xgplayer course player and native HTML5 videos on clock-in pages.
- Switches directly between native fullscreen and page fullscreen with one keystroke.
- Disables shortcuts while an input, search box, select control, or editable notes area has focus.
- Supports global pause and per-site pause from the extension popup.
- Allows one-site permission grants for merchant-owned custom course domains.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `←` / `→` | Seek backward / forward 5 seconds |
| `J` / `L` | Seek backward / forward 10 seconds |
| `K` | Pause / resume playback |
| `<` / `>` | Decrease / increase playback speed (0.5x–3x) |
| `F` | Toggle native fullscreen |
| `T` | Toggle page fullscreen |

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
6. Refresh any XiaoeTong course pages that were already open.

To update, pull or download the latest files, click **Reload** on the extension card, and then refresh the course page.

### How it works and limitations

- The extension selects only quality options exposed by the player. It cannot create a higher-quality source when one is unavailable.
- Shortcuts target the currently visible or actively playing video.
- Player UI or DOM updates may require corresponding selector updates.
- The automatic quality setting does not affect course permissions, purchases, or clock-in requirements.

### Local verification

The repository includes a Playwright browser regression script covering legacy and current players, native video, keyboard shortcuts, fullscreen transitions, and automatic quality selection:

```bash
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
```

## 版本 / Version

Current version: **1.7.0**

主要变更：新增 `xet.pomoho.com` 打卡页面及原生 HTML5 视频支持，并提供自动超清、播放控制、倍速和双全屏快捷键。

Highlights: support for `xet.pomoho.com` clock-in pages and native HTML5 video, plus automatic quality selection, playback controls, speed controls, and two fullscreen modes.
