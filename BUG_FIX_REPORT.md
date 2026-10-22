# Bug 修复报告：删除语料组 500 错误

## 问题描述

在管理员界面删除语料组时出现 **HTTP 500 Internal Server Error**。

**浏览器错误信息：**
```
DELETE https://caiji.gdzawl.com/api/admin/corpus-groups/8 500 (Internal Server Error)
```

## 根本原因

后端删除函数 (`delete_corpus_group`) 的**删除顺序错误**，导致外键约束冲突。

### 数据库关系链：
```
VoiceRecording
├─ FK: package_id → CorpusPackage
└─ FK: corpus_text_id → CorpusText

PackageCorpusRejectionNote
├─ FK: package_id → CorpusPackage
└─ FK: corpus_text_id → CorpusText

CorpusPackageItem
├─ FK: package_id → CorpusPackage
└─ FK: corpus_text_id → CorpusText
```

### 问题代码（main.py:891-925）

原始删除顺序：
1. ❌ 直接删除 CorpusPackageItem
2. ❌ 删除 CorpusPackage
3. ❌ 删除 CorpusText

**问题**：VoiceRecording 仍然引用这些数据，导致外键约束违反 → 500 错误

## 解决方案

修正删除顺序（**从最深层的依赖开始删除**）：

```python
正确的删除顺序：
1. ✅ VoiceRecording（最底层，无其他表引用）
2. ✅ PackageCorpusRejectionNote
3. ✅ CorpusPackageItem
4. ✅ CorpusPackage
5. ✅ CorpusText
6. ✅ CorpusGroupAssignment
7. ✅ CorpusAnnotationAssignment
8. ✅ CorpusInspectionAssignment
9. ✅ CorpusGroup（最顶层）
```

### 修复内容

**文件**：`main.py` 第 891-925 行

**改进**：
- ✅ 添加异常处理（try-catch）
- ✅ 正确的删除顺序（先删除有外键的表）
- ✅ 提取所有 ID 列表，避免重复查询
- ✅ 添加详细的错误日志
- ✅ 返回有意义的错误信息

## 修复后的行为

- **删除成功**：显示"删除成功"，页面自动刷新
- **删除失败**：显示详细的错误信息（含原因）
- **服务器日志**：打印完整的错误堆栈便于调试

## 测试步骤

1. 登录管理员账号
2. 进入「语料组管理」
3. 选择一个语料组
4. 点击「删除」按钮
5. 确认删除

**预期结果**：删除成功，不再出现 500 错误

## 文件修改

- ✅ `main.py`：修复 `delete_corpus_group()` 函数
- ✅ `voice-h5/src/pages/Manager.tsx`：改进前端错误提示

---

**修复时间**：2026-05-03  
**状态**：已完成
