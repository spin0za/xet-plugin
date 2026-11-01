# 直播详情页倒计时

适用范围：已授权网站的 `/detail/l_…/4` 直播详情页，不限某个商家或直播 ID。没有原生 `AliveStatus` Vue 组件的页面不处理。

## 真实页面核实

- 原生 `status-wrapper.__vue__` 提供 `time`（剩余毫秒数）、`status`、`liveStatus`、`count`、`getTime` 和 `formate`。
- 原生 `time` watcher 先调用 `getTime(count)`，再每秒调用一次；`getTime` 只执行 `count -= 1000`。后台标签页定时器被降频时，会少减很多秒。
- 时间由 `/api/xe.goods.detail.get/2.0.0` 返回的 `zb_start_rest_time` 提供。页面的 `zb_start_at` 已经过本地化处理，不能把显示字符串当成带时区的绝对时间重新解析。

## 修复

在经过后台站点授权、顶层 frame、文档和路由校验后，于 MAIN 世界安装小范围 Vue 适配器。以原始接口的 `PerformanceResourceTiming.responseEnd` 为基准，将服务器剩余时长换算成截止时间；每次显示计算 `max(0, deadline - Date.now())`，不按回调次数递减。首次安装晚于响应时也会扣除已经过去的时间。

如果页面清除了资源计时记录，则从原生当前剩余值接管；无法凭空恢复安装前丢失的时间，但接管后不会继续累积降频误差。更新服务器 props 时重新建立基准，同一轮 Vue 更新不会重复重置。

保留原生 `getTime` 格式化、DOM、CSS 和到点 `liveStatus = 1` 行为。仅停止原生递减定时器，不修改网站接口或全局计时器。`visibilitychange`（变为可见）、`focus` 和 `pageshow` 直接校准，无等待期。不刷新、不新建标签页、不进入直播、不自动播放，也不额外轮询网络。

禁用网站、路由离开、组件卸载时清理定时器和监听器；可见组件仍在倒计时则把准确剩余时间交回原生 watcher。主入口沿用现有站点启停机制，没有新增权限。

## 验证

- `node tests/live-countdown-smoke.js`：晚安装、漏执行定时器、可见／焦点／恢复事件、零下限、原生状态、服务器新数据、停止和授权边界。
- `output/playwright/verify-live-countdown.js`：全新隔离浏览器加载真实 MV3 扩展与 Vue 2.6.14，复现原生 watcher；模拟后台时间流逝，验证立即纠正、保留原生节点／格式、到点、重排期、站点启停和 SPA 清理。检查无页面刷新、无写请求和页面异常。
- 真实登录页仅做只读组件及公开源码检查；检查时直播已到开播时间，未为测试改动真实直播时间、进入直播间或刷新页面。
