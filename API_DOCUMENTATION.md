# 语音采集系统 API 文档

## 已实现的完整 API 接口

### 一、标注员工作流 API

#### 1. 获取待标注包列表
```
GET /api/annotator/available-packages?user_id={user_id}
```
**响应示例:**
```json
{
  "code": 200,
  "data": [
    {
      "id": 1,
      "name": "package_001",
      "size": 10,
      "annotation_status": "待标注",
      "corpus_group_name": "方言区A",
      "created_at": "2024-04-29 10:00"
    }
  ]
}
```

#### 2. 领取标注任务
```
POST /api/annotator/packages/{package_id}/claim
Content-Type: application/json

{
  "user_id": 123
}
```
**响应:**
```json
{
  "code": 200,
  "msg": "领取成功"
}
```

#### 3. 获取我的标注包列表
```
GET /api/annotator/my-packages?user_id={user_id}
```
**响应示例:**
```json
{
  "code": 200,
  "data": [
    {
      "id": 1,
      "name": "package_001",
      "size": 10,
      "annotation_status": "待标注",
      "corpus_group_name": "方言区A",
      "claimed_at": "2024-04-29 10:05"
    }
  ]
}
```

#### 4. 获取包内语料及采集员信息
```
GET /api/annotator/package-corpus?package_id={package_id}&user_id={user_id}
```
**响应示例:**
```json
{
  "code": 200,
  "data": [
    {
      "id": 1,
      "text_id": "text_abc123",
      "content": "我是一条语料文本",
      "recording_id": 1,
      "recording_file": "voice_1_1_1_123456_xxx.wav",
      "recorded_at": "2024-04-29 09:00",
      "annotated_text": null,
      "is_valid": null,
      "annotation_note": null
    }
  ],
  "total": 10,
  "package_status": "待标注",
  "collector_real_name": "张三",
  "collector_gender": "男",
  "collector_age": 28,
  "collector_hometown": "北京市朝阳区"
}
```

#### 5. 提交标注结果
```
POST /api/annotator/submit-annotation
Content-Type: application/json

{
  "package_id": 1,
  "corpus_text_id": 1,
  "user_id": 123,
  "annotated_text": "我是一条标注后的文本",
  "is_valid": 1,
  "annotation_note": "清晰，无噪音"
}
```
**响应:**
```json
{
  "code": 200,
  "msg": "标注成功",
  "user_id": 123,
  "package_id": 1,
  "corpus_id": 1,
  "annotated_at": "2024-04-29T10:15:00",
  "completed": 5,
  "total": 10,
  "is_package_completed": false,
  "next": {
    "id": 2,
    "text_id": "text_def456",
    "content": "下一条语料"
  }
}
```

#### 6. 获取标注员统计信息
```
GET /api/annotator/statistics?user_id={user_id}
```
**响应:**
```json
{
  "code": 200,
  "data": {
    "packages": 5,
    "corpus_count": 50,
    "total_duration_seconds": 450
  }
}
```

---

### 二、质检员工作流 API

#### 1. 获取待质检包列表
```
GET /api/inspector/available-packages?user_id={user_id}
```
**响应示例:**
```json
{
  "code": 200,
  "data": [
    {
      "id": 1,
      "name": "package_001",
      "size": 10,
      "quality_status": "待质检",
      "corpus_group_name": "方言区A",
      "created_at": "2024-04-29 10:00"
    }
  ]
}
```

#### 2. 领取质检任务
```
POST /api/inspector/packages/{package_id}/claim
Content-Type: application/json

{
  "user_id": 456
}
```
**响应:**
```json
{
  "code": 200,
  "msg": "领取成功"
}
```

#### 3. 获取我的质检包列表
```
GET /api/inspector/my-packages?user_id={user_id}
```
**响应示例:**
```json
{
  "code": 200,
  "data": [
    {
      "id": 1,
      "name": "package_001",
      "size": 10,
      "quality_status": "待质检",
      "corpus_group_name": "方言区A",
      "claimed_at": "2024-04-29 10:05"
    }
  ]
}
```

#### 4. 获取包内语料及标注内容
```
GET /api/inspector/package-corpus?package_id={package_id}&user_id={user_id}
```
**响应示例:**
```json
{
  "code": 200,
  "data": [
    {
      "id": 1,
      "text_id": "text_abc123",
      "content": "我是一条语料文本",
      "recording_id": 1,
      "recording_file": "voice_1_1_1_123456_xxx.wav",
      "recorded_at": "2024-04-29 09:00",
      "annotated_text": "我是一条标注后的文本",
      "is_valid": 1,
      "annotation_note": "清晰，无噪音",
      "quality_note": null
    }
  ],
  "total": 10,
  "package_status": "待质检",
  "collector_real_name": "张三",
  "collector_gender": "男",
  "collector_age": 28,
  "collector_hometown": "北京市朝阳区"
}
```

#### 5. 提交质检结果
```
POST /api/inspector/submit-inspection
Content-Type: application/json

{
  "package_id": 1,
  "corpus_text_id": 1,
  "user_id": 456,
  "annotated_text": "修正后的文本（可选）",
  "is_valid": 1,
  "quality_note": "标注正确",
  "quality_action": "通过"  # "通过" 或 "打回"
}
```
**响应:**
```json
{
  "code": 200,
  "msg": "质检成功",
  "user_id": 456,
  "package_id": 1,
  "corpus_id": 1,
  "quality_action": "通过",
  "inspected_at": "2024-04-29T10:20:00",
  "completed": 5,
  "total": 10,
  "is_package_completed": false,
  "next": {
    "id": 2,
    "text_id": "text_def456",
    "content": "下一条语料"
  }
}
```

#### 6. 获取质检员统计信息
```
GET /api/inspector/statistics?user_id={user_id}
```
**响应:**
```json
{
  "code": 200,
  "data": {
    "packages": 3,
    "corpus_count": 30,
    "total_duration_seconds": 270
  }
}
```

---

### 三、数据流转状态

#### 包生命周期
```
[采集阶段]
未领取 → 已领取 → 已完成 → 待审核 → {已合格 → [标注阶段] | 已打回 → 已领取}

[标注阶段]
未分配 → 待标注 → 已标注 → [质检阶段]

[质检阶段]
未分配 → 待质检 → 已质检 → {结束 | 已打回 → 待标注}
```

#### annotation_status 字段
- `未分配`: 包刚通过审核，未分配给标注员
- `待标注`: 标注员已领取，等待标注
- `已标注`: 标注员已完成标注

#### quality_status 字段
- `未分配`: 包标注完成，未分配给质检员
- `待质检`: 质检员已领取，等待质检
- `已质检`: 质检员通过，包完成
- `已打回`: 质检员打回，包返回标注阶段

---

### 四、VoiceRecording 表字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键 |
| package_id | Integer | 所属语料包 |
| corpus_text_id | Integer | 所属语料 |
| collector_id | Integer | 采集员ID |
| file_path | String | MinIO文件路径 |
| duration_seconds | Integer | 录音时长（秒） |
| status | String | 录音状态：已录制/已提交 |
| **annotated_text** | String | 标注员标注的文本 |
| **is_valid** | Integer | 1=有效 0=无效 NULL=未设置 |
| **annotation_note** | String | 标注员备注 |
| **annotated_by** | Integer | 标注员ID |
| **annotated_at** | DateTime | 标注时间 |
| **quality_note** | String | 质检员备注 |
| **inspected_by** | Integer | 质检员ID |
| **inspected_at** | DateTime | 质检时间 |

---

## 采集员参考 API（已实现）

| 功能 | 端点 | 方法 |
|------|------|------|
| 获取可领取包列表 | `/api/collector/available-packages` | GET |
| 领取语料包 | `/api/collector/packages/{id}/claim` | POST |
| 获取我的包列表 | `/api/collector/my-packages` | GET |
| 获取包内语料 | `/api/collector/package-corpus` | GET |
| 提交录音 | `/api/collector/submit-recording` | POST |
| 获取个人统计 | `/api/collector/statistics` | GET |
| 获取个人档案 | `/api/collector/profile` | GET |
| 更新个人档案 | `/api/collector/profile` | PATCH |

---

## 功能开关

环境变量：`ROLE_FEATURE_FLAG`

- **1** (默认): 标注员/质检员跳转到占位符界面（demo）
- **2**: 标注员/质检员进入新的功能页面（使用新 API）

在登录响应中返回：
```json
{
  "code": 200,
  "data": {
    "id": 123,
    "username": "annotator_001",
    "role": "annotator",
    "role_feature_flag": 1
  }
}
```

---

## 错误响应

所有接口统一错误格式：
```json
{
  "detail": "错误信息"
}
```

常见错误码：
- `400` - 请求参数错误
- `403` - 无权限访问
- `404` - 资源不存在
- `409` - 冲突（如语料包已被其他人领取）
- `500` - 服务器错误

---

## 速率限制

- 领取任务: 20次/分钟
- 提交（录音/标注/质检）: 60次/分钟
- 统计接口: 30次/分钟
