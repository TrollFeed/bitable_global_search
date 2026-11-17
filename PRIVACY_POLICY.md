# Privacy Policy / 隐私政策

**Extension / 插件名称**: 多维表格全局搜索（Global Search for Feishu Bitable）  

## 1. Zero External Data Transmission / 零外部数据传输
This extension makes **zero** external network requests, telemetry calls, or third-party analytics connections. No table contents, record values, queries, or user metadata ever leave the user's Feishu Base browser sandbox.

本插件**不向任何外部服务器、第三方接口或统计平台发送任何数据**。多维表格中的数据内容、搜索关键词及导出结果仅在用户本地浏览器内存中处理，绝不离开飞书前端沙箱环境。

## 2. Local Browser Caching / 本地浏览器缓存
To make repeated searches faster, the extension stores a read-only search index snapshot in the browser's `localStorage`, scoped strictly by:
- Base ID (`baseId`)
- Active Base User ID (`userId`)
- UI locale used for boolean checkbox labels

Users can refresh or overwrite this local cache at any time via the in-app **Refresh index** button or by clearing browser site storage.

为提升检索响应速度，插件仅在浏览器本地 `localStorage` 中保存只读索引缓存，并按多维表格 ID、当前用户 ID 及语言标签隔离。用户可随时点击刷新按钮重建缓存或通过浏览器清理本地存储。

## 3. Contact / 联系方式
Source repository: https://github.com/TrollFeed/bitable_global_search
