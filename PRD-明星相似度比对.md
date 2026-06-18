# 数字人明星相似度比对系统 PRD 文档
## 1. 产品概述
### 1.1 产品名称
数字人明星相似度比对系统
### 1.2 产品目标
在数字人生产和上传流程中，**自动检测数字人与国内外明星的人脸相似度**，提前识别肖像权侵权风险，为数字人资产提供合规保障。
### 1.3 目标用户
- 数字人设计师：在生产阶段自检相似度
- 平台审核人员：对上传的数字人资产进行合规审核
- 平台运营人员：批量检测已有数字人资产的风险

## 2. 需求背景
- 目前平台已生产200+数字人资产，且计划持续扩大生产规模
- 数字人若与真实明星相似度较高，用于短剧、广告等商业用途时存在**极高的肖像权侵权风险**
- 现有人工比对方式效率低、主观性强，无法满足批量生产需求
- 需要建立标准化、自动化的相似度校验流程，作为数字人上线前的强制审核环节

## 3. 核心功能需求
### 3.1 数字人上传比对（核心）
- **支持格式**：JPG/PNG，推荐使用**人脸特写图**（2048×2048以上）
- **比对方式**：
  - 单张上传比对
  - 批量上传比对（支持ZIP包，一次最多100张）
- **比对结果**：
  - 返回Top 5最相似明星
  - 显示相似度百分比（精确到小数点后两位）
  - 显示明星照片和姓名
  - 自动标注风险等级
### 3.2 风险等级自动判定
| 相似度 | 风险等级 | 处理建议 | 系统操作 |
|--------|----------|----------|----------|
| > 85% | 🔴 极高风险 | **必须修改** | 禁止上传，强制打回 |
| 70% - 85% | 🟡 中度风险 | 建议微调 | 允许上传，但标记为待人工审核 |
| < 70% | 🟢 低风险 | 安全 | 自动通过审核 |
### 3.3 明星人脸库管理
- 支持查看库中所有明星列表
- 支持添加/删除明星
- 支持为单个明星上传多张不同角度/表情的照片
- 支持按地区（中国/韩国/日本/欧美）、性别、职业筛选明星
### 3.4 历史记录查询
- 记录所有比对历史（数字人ID、比对时间、结果、处理状态）
- 支持按风险等级、时间范围筛选
- 支持导出比对结果为Excel
### 3.5 与现有系统集成
- **生产流程集成**：在数字人后台上传页面，上传完成后自动触发相似度比对
- **审核流程集成**：比对结果直接显示在审核页面，作为审核依据

## 4. 非功能需求
- **响应时间**：单张比对 < 1秒，100张批量比对 < 30秒
- **准确率**：清晰正面照准确率 ≥ 95%
- **并发能力**：支持同时10人在线比对
- **数据安全**：上传的数字人图片仅用于比对，比对完成后自动删除，不永久存储

## 5. 开发排期
| 阶段 | 内容 | 时间 | 负责人 |
|------|------|------|--------|
| 第一阶段 | 阿里云API接入、单张比对功能 | 3天 | 后端 |
| 第二阶段 | 明星人脸库构建（基础版4000人） | 2天 | 运营+后端 |
| 第三阶段 | 批量比对、历史记录、风险等级 | 3天 | 后端+前端 |
| 第四阶段 | 与现有后台系统集成 | 2天 | 后端+前端 |
| 第五阶段 | 测试上线 | 2天 | 测试+产品 |
| **总计** | | **12天** | |

---

# 一、明星人脸库构建清单方案
## 1. 分阶段构建计划
### 1.1 第一阶段：基础版（立即可用，覆盖99%知名明星）
**总规模：4000人**
- 中国内地：1500人（一线/二线演员、歌手、网红）
- 中国港台：500人
- 韩国：1000人（K-pop偶像、演员）
- 日本：500人
- 欧美：500人（好莱坞明星、网红）

**获取方式：**
1. **优先使用开源数据集**（最快）：
   - GitHub搜索 `celebrity face dataset`，有多个现成的明星人脸库
   - 推荐：`MS-Celeb-1M`（百万级，可筛选前4000人）、`CelebA`
2. **补充缺失明星**：
   - 从百度百科、维基百科获取最新的明星榜单
   - 用爬虫工具从百度图片/谷歌图片爬取每个明星的5-10张高清正面照

### 1.2 第二阶段：进阶版（1个月内完成）
**总规模：10000人**
- 增加三四线演员、网红、运动员、主持人等
- 增加东南亚、印度等地区明星

### 1.3 第三阶段：完整版（长期维护）
**总规模：20000人**
- 覆盖几乎所有公众人物
- 每月更新一次，添加新晋明星

## 2. 数据质量标准（关键！直接影响准确率）
✅ **每个明星必须包含**：
- 5-10张不同角度的**高清正面照**（分辨率≥1024×1024）
- 不同表情（开心、中性、严肃）
- 不同发型/妆容

❌ **必须排除的图片**：
- 侧脸、低头、仰头超过30度
- 戴口罩、墨镜、帽子遮挡面部
- 模糊、低分辨率、水印过多
- 多人合照
- 过度P图、艺术化处理的图片

## 3. 数据处理流程
1. **人脸检测**：使用RetinaFace自动检测图片中的人脸
2. **人脸对齐**：将所有人脸对齐到统一标准（眼睛水平、鼻子居中）
3. **特征提取**：使用InsightFace提取每个人脸的512维特征向量
4. **去重**：删除同一明星的重复特征
5. **入库**：将特征向量存入阿里云人脸库，关联明星信息

## 4. 工具清单
- 人脸检测对齐：InsightFace（开源免费）
- 图片爬虫：Scrapy、BeautifulSoup
- 批量处理：Python脚本
- 人脸库存储：阿里云人脸搜索服务

---

# 二、阿里云API快速接入指南
## 1. 开通服务
1. 登录[阿里云视觉智能开放平台](https://vision.aliyun.com/)
2. 搜索"人脸搜索"，点击"立即开通"
3. 选择按量付费（**¥0.002/次**，1000次仅需2元）
4. 开通后，在控制台获取你的 `AccessKey ID` 和 `AccessKey Secret`

## 2. 创建人脸库
1. 在控制台进入"人脸搜索" → "人脸库管理"
2. 点击"创建人脸库"，名称填写 `celebrity_db`
3. 人脸库类型选择"通用人脸库"
4. 最大人脸数量填写 `50000`（足够用）
5. 点击"确定"创建

## 3. 批量上传明星人脸
### 3.1 安装SDK
```bash
pip install alibabacloud_facebody20191230
```

### 3.2 批量上传脚本
```python
from alibabacloud_facebody20191230.client import Client
from alibabacloud_facebody20191230.models import AddFaceEntityRequest
from alibabacloud_tea_util import models as util_models
import os
import base64

# 配置你的阿里云密钥
config = {
    "accessKeyId": "你的AccessKey ID",
    "accessKeySecret": "你的AccessKey Secret",
    "endpoint": "facebody.cn-shanghai.aliyuncs.com"
}

client = Client(config)

# 批量上传明星图片
def upload_celebrity(celebrity_name, image_path):
    with open(image_path, "rb") as f:
        image_base64 = base64.b64encode(f.read()).decode()
    
    request = AddFaceEntityRequest()
    request.db_name = "celebrity_db"
    request.entity_id = celebrity_name  # 用明星姓名作为实体ID
    request.image_url = ""
    request.image_content = image_base64
    request.extra_data = celebrity_name  # 额外信息存储明星姓名
    
    try:
        response = client.add_face_entity(request)
        print(f"✅ 上传成功: {celebrity_name}")
    except Exception as e:
        print(f"❌ 上传失败: {celebrity_name}, 错误: {e}")

# 遍历文件夹批量上传
celebrity_dir = "明星人脸库/"
for celebrity_name in os.listdir(celebrity_dir):
    celebrity_path = os.path.join(celebrity_dir, celebrity_name)
    if os.path.isdir(celebrity_path):
        for image_name in os.listdir(celebrity_path):
            if image_name.endswith((".jpg", ".png")):
                image_path = os.path.join(celebrity_path, image_name)
                upload_celebrity(celebrity_name, image_path)
```

## 4. 调用相似度比对接口
```python
from alibabacloud_facebody20191230.models import SearchFaceRequest

def search_similar_face(image_path, top_n=5):
    with open(image_path, "rb") as f:
        image_base64 = base64.b64encode(f.read()).decode()
    
    request = SearchFaceRequest()
    request.db_name = "celebrity_db"
    request.image_content = image_base64
    request.limit = top_n
    
    response = client.search_face(request)
    
    results = []
    if response.body.match_list:
        for match in response.body.match_list:
            results.append({
                "name": match.extra_data,
                "similarity": match.score,
                "face_id": match.face_id
            })
    
    return results

# 测试比对
digital_human_image = "数字人人脸特写.png"
similar_faces = search_similar_face(digital_human_image)

print("比对结果:")
for i, face in enumerate(similar_faces):
    print(f"{i+1}. {face['name']} - 相似度: {face['similarity']:.2f}%")
```

## 5. 价格计算
- 人脸搜索：**¥0.002/次**
- 人脸库存储：**¥0.0001/人脸/天**（1万张人脸每天仅需1元）
- 总费用估算：比对1000个数字人 + 存储1万张人脸，每月总费用约 **50元**

## 6. 最佳实践
1. **只用人脸特写比对**：不要用全身图或三视图，准确率会大幅下降
2. **多表情比对**：上传数字人的5种表情分别比对，取最高相似度
3. **阈值调整**：数字人比对建议将阈值调低0.05，即相似度>80%视为高风险
4. **批量处理**：使用异步调用方式处理大量图片，避免超时



