# 课程目录静默更新

2026-10-22 在已登录的商家页面核实，只调用读取接口，不修改学习记录。

## 字段来源

| 查询 | 核实返回的字段 | 用途 |
| --- | --- | --- |
| `xe.course.business.e_course.learning_resource_progress.get/1.0.0` | `progress`、`include_elective` | 课程总进度；后者表示选修计入设置，不是逐节数据 |
| `xe.course.business_go.avoidlogin.e_course.resource_catalog_list.get/1.0.0` | `list[].chapter_id`、`p_id`、`study_status`、`learn_progress`、`unlock_state`、`unlock_date` 等目录字段 | 按条目 ID 更新完成状态、已学百分比和解锁状态 |
| `xe.course.business_go.e_course.last_learn_resource.get/1.0.0` | `resource_id`、`resource_type`、`jump_url`、`last_learn_course_name`、`sub_course_id` | 更新目录中的上次学习标识；原网站的继续学习按钮仍执行原有独立查询 |

目录查询通过当前 Vue 组件的 `apiMap.getList` 复用网站的参数和请求处理；上次学习通过 `apiMap.getLearnResource` 读取。未将完整目录响应、用户信息或登录凭据写入存储。

## 行为范围

- 仅在 `/p/t_pc/course_pc_detail/camp_pro/<课程 ID>` 生效，要求找到匹配课程的原生组件。
- 捕获切回事件期间，把原生目录的 `reload()` 调用替换为数据读取。其他 `visibilitychange` 监听器照常运行，手动触发的原生重载仍执行原方法。
- 只查询已加载的根目录页和已加载章节的子页，包括已折叠但仍保留数据的章节；不扫描未加载目录，也不新增标签页。
- 修改原有响应式对象的状态字段，不替换条目、数组、展开状态、分页或滚动位置。不会自动打开上次学习的章节或把视图滚回该条目。
- 并发不超过四个请求；在途刷新合并，读取超时或失败时保留已有数据。
- 子课程、排序、权限筛选、组件或数组改变后忽略对应旧结果。停用网站功能时恢复原方法并撤销监听器。
- 新增／删除章节、标题或目录结构不在静默更新范围，重新进入页面或手动刷新后获取。

## 检查

`output/playwright/verify-course-progress.js` 使用真实 MV3 扩展和隔离课程夹具，通过浏览器的事件捕获／冒泡流程触发可见性事件，覆盖状态更新、DOM／数组身份、展开和内外滚动位置、其他事件监听器、读取失败、晚到结果、停用恢复及 SPA 离开。无头浏览器不会随标签切换改变可见性，因此该夹具显式派发事件；真实网站的接口与字段另经已登录页面核实。
