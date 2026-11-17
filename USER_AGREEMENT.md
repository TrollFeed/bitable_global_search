# User Agreement / 用户协议

**Extension / 插件名称**: 多维表格全局搜索（Global Search for Feishu Bitable）  
**Scope / 适用范围**: Internal Enterprise Sidebar Extension for 完美世界（北京）软件科技发展有限公司 (and open-source MIT users)

## 1. Service Description / 服务说明
This extension runs purely client-side inside the user's Feishu Base (Bitable) sidebar sandbox via the official `@lark-base-open/js-sdk`. It reads tables, fields, and records that the current signed-in user already has permission to view in the open Base, builds a temporary in-memory search index, and supports search result navigation and local export (CSV/JSON/TSV).

本插件完全运行于用户本地浏览器中的飞书多维表格侧边栏沙箱内，仅通过官方 `@lark-base-open/js-sdk` 读取当前登录用户对当前多维表格已有查看权限的数据表、字段与记录，用于构建跨表搜索索引及本地导出结果。

## 2. Permissions & Access / 权限与使用规范
- The extension requests **0** backend OpenAPI scopes and never elevates user permissions.
- Access to records, cell editing, or export strictly follows Feishu Base's built-in permission controls for the active user.
- Users must comply with company information security policies when exporting or sharing search results.

## 3. Availability & Disclaimer / 可用性与免责声明
Provided under the [MIT License](LICENSE) "AS IS" without warranty of any kind. Repository: https://github.com/TrollFeed/bitable_global_search
