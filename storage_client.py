"""
统一的存储客户端
支持：阿里云 OSS（生产）、MinIO（本地开发）、AWS S3
"""

import os
import io
from abc import ABC, abstractmethod
from datetime import timedelta
from typing import Tuple

try:
    import oss2
except ImportError:
    oss2 = None


class StorageClient(ABC):
    """存储客户端抽象基类"""

    @abstractmethod
    def put_object(self, bucket: str, object_name: str, data: bytes, content_type: str = None) -> bool:
        """上传对象（从内存）"""
        pass

    def put_object_from_file(self, bucket: str, object_name: str, file_path: str, content_type: str = None) -> bool:
        """上传对象（从文件）- 默认实现读取文件到内存"""
        with open(file_path, 'rb') as f:
            data = f.read()
        return self.put_object(bucket, object_name, data, content_type)

    @abstractmethod
    def get_object(self, bucket: str, object_name: str) -> bytes:
        """下载对象"""
        pass

    @abstractmethod
    def presigned_get_object(self, bucket: str, object_name: str, expires: int = 3600) -> str:
        """获取预签名 GET URL"""
        pass

    @abstractmethod
    def presigned_put_object(self, bucket: str, object_name: str, expires: int = 300) -> Tuple[str, str]:
        """获取预签名 PUT URL，返回 (url, download_url)"""
        pass

    @abstractmethod
    def stat_object(self, bucket: str, object_name: str) -> dict:
        """获取对象信息"""
        pass

    @abstractmethod
    def bucket_exists(self, bucket: str) -> bool:
        """检查 bucket 是否存在"""
        pass

    @abstractmethod
    def make_bucket(self, bucket: str) -> bool:
        """创建 bucket"""
        pass


class MinioClient(StorageClient):
    """MinIO 客户端（本地开发）"""

    def __init__(self):
        from minio import Minio
        self.client = Minio(
            endpoint=os.getenv("MINIO_ENDPOINT", "localhost:9000"),
            access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
            secret_key=os.getenv("MINIO_SECRET_KEY", "minioadmin"),
            secure=os.getenv("MINIO_SECURE", "false").lower() == "true"
        )

    def put_object(self, bucket: str, object_name: str, data: bytes, content_type: str = None) -> bool:
        try:
            self.client.put_object(bucket, object_name, io.BytesIO(data), len(data), content_type=content_type)
            return True
        except Exception as e:
            print(f"[MinIO] 上传失败: {e}")
            return False

    def get_object(self, bucket: str, object_name: str) -> bytes:
        try:
            response = self.client.get_object(bucket, object_name)
            return response.read()
        except Exception as e:
            print(f"[MinIO] 下载失败: {e}")
            return None

    def presigned_get_object(self, bucket: str, object_name: str, expires: int = 3600) -> str:
        try:
            url = self.client.presigned_get_object(bucket, object_name, expires=timedelta(seconds=expires))
            return url
        except Exception as e:
            print(f"[MinIO] 生成 GET URL 失败: {e}")
            return None

    def presigned_put_object(self, bucket: str, object_name: str, expires: int = 300) -> Tuple[str, str]:
        try:
            url = self.client.presigned_put_object(bucket, object_name, expires=timedelta(seconds=expires))
            download_url = f"http://{os.getenv('MINIO_ENDPOINT')}/{bucket}/{object_name}"
            return url, download_url
        except Exception as e:
            print(f"[MinIO] 生成 PUT URL 失败: {e}")
            return None, None

    def stat_object(self, bucket: str, object_name: str) -> dict:
        try:
            stat = self.client.stat_object(bucket, object_name)
            return {"size": stat.size, "last_modified": stat.last_modified}
        except Exception as e:
            print(f"[MinIO] 获取对象信息失败: {e}")
            return None

    def bucket_exists(self, bucket: str) -> bool:
        try:
            return self.client.bucket_exists(bucket)
        except Exception as e:
            print(f"[MinIO] 检查 bucket 失败: {e}")
            return False

    def make_bucket(self, bucket: str) -> bool:
        try:
            if not self.bucket_exists(bucket):
                self.client.make_bucket(bucket)
            return True
        except Exception as e:
            print(f"[MinIO] 创建 bucket 失败: {e}")
            return False


class AliyunOSSClient(StorageClient):
    """阿里云 OSS 客户端"""

    def __init__(self):
        if oss2 is None:
            raise ImportError("oss2 module not installed. Install with: pip install oss2")

        self.auth = oss2.Auth(
            os.getenv('ALIYUN_ACCESS_KEY_ID'),
            os.getenv('ALIYUN_ACCESS_KEY_SECRET')
        )
        self.bucket_name = os.getenv('ALIYUN_BUCKET_NAME')
        self.endpoint = os.getenv('ALIYUN_ENDPOINT')
        # 强制使用HTTPS
        endpoint = self.endpoint
        if endpoint and not endpoint.startswith('http'):
            endpoint = 'https://' + endpoint
        self.bucket = oss2.Bucket(self.auth, endpoint, self.bucket_name)

    def put_object(self, bucket: str, object_name: str, data: bytes, content_type: str = None) -> bool:
        try:
            headers = {}
            if content_type:
                headers['Content-Type'] = content_type
            self.bucket.put_object(object_name, data, headers=headers)
            return True
        except Exception as e:
            print(f"[Aliyun OSS] 上传失败: {e}")
            return False

    def put_object_from_file(self, bucket: str, object_name: str, file_path: str, content_type: str = None) -> bool:
        """从文件上传到OSS（避免将整个文件读入内存）"""
        try:
            headers = {}
            if content_type:
                headers['Content-Type'] = content_type
            # oss2 支持直接从文件上传
            with open(file_path, 'rb') as f:
                self.bucket.put_object(object_name, f, headers=headers)
            return True
        except Exception as e:
            print(f"[Aliyun OSS] 文件上传失败: {e}")
            return False

    def get_object(self, bucket: str, object_name: str) -> bytes:
        try:
            obj = self.bucket.get_object(object_name)
            return obj.read()
        except Exception as e:
            print(f"[Aliyun OSS] 下载失败: {e}")
            return None

    def presigned_get_object(self, bucket: str, object_name: str, expires: int = 3600) -> str:
        try:
            # expires 是秒数，sign_url 直接接受秒数
            url = self.bucket.sign_url('GET', object_name, int(expires))
            # 强制使用HTTPS避免混合内容问题
            if url.startswith('http://'):
                url = 'https://' + url[7:]
            return url
        except Exception as e:
            print(f"[Aliyun OSS] 生成 GET URL 失败: {e}")
            return None

    def presigned_put_object(self, bucket: str, object_name: str, expires: int = 300) -> Tuple[str, str]:
        try:
            # expires 是秒数，sign_url 直接接受秒数
            url = self.bucket.sign_url('PUT', object_name, int(expires))
            # 强制使用HTTPS避免混合内容问题
            if url.startswith('http://'):
                url = 'https://' + url[7:]
            download_url = f"https://{self.bucket_name}.{self.endpoint}/{object_name}"
            return url, download_url
        except Exception as e:
            print(f"[Aliyun OSS] 生成 PUT URL 失败: {e}")
            return None, None

    def stat_object(self, bucket: str, object_name: str) -> dict:
        try:
            stat = self.bucket.head_object(object_name)
            return {"size": stat.content_length, "last_modified": stat.last_modified}
        except Exception as e:
            print(f"[Aliyun OSS] 获取对象信息失败: {e}")
            return None

    def bucket_exists(self, bucket: str) -> bool:
        try:
            service = oss2.Service(self.auth, self.endpoint)
            buckets = service.list_buckets()
            return any(b.name == self.bucket_name for b in buckets.buckets)
        except Exception as e:
            print(f"[Aliyun OSS] 检查 bucket 失败: {e}")
            return False

    def make_bucket(self, bucket: str) -> bool:
        # 阿里云 bucket 需要提前在控制台创建，这里只是占位
        return True


class S3Client(StorageClient):
    """AWS S3 客户端"""

    def __init__(self):
        import boto3
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
            region_name=os.getenv('AWS_REGION', 'us-east-1')
        )
        self.bucket_name = os.getenv('AWS_BUCKET_NAME')

    def put_object(self, bucket: str, object_name: str, data: bytes, content_type: str = None) -> bool:
        try:
            kwargs = {'Body': data}
            if content_type:
                kwargs['ContentType'] = content_type
            self.s3_client.put_object(Bucket=self.bucket_name, Key=object_name, **kwargs)
            return True
        except Exception as e:
            print(f"[S3] 上传失败: {e}")
            return False

    def get_object(self, bucket: str, object_name: str) -> bytes:
        try:
            response = self.s3_client.get_object(Bucket=self.bucket_name, Key=object_name)
            return response['Body'].read()
        except Exception as e:
            print(f"[S3] 下载失败: {e}")
            return None

    def presigned_get_object(self, bucket: str, object_name: str, expires: int = 3600) -> str:
        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': object_name},
                ExpiresIn=expires
            )
            return url
        except Exception as e:
            print(f"[S3] 生成 GET URL 失败: {e}")
            return None

    def presigned_put_object(self, bucket: str, object_name: str, expires: int = 300) -> Tuple[str, str]:
        try:
            url = self.s3_client.generate_presigned_url(
                'put_object',
                Params={'Bucket': self.bucket_name, 'Key': object_name},
                ExpiresIn=expires
            )
            download_url = f"https://{self.bucket_name}.s3.amazonaws.com/{object_name}"
            return url, download_url
        except Exception as e:
            print(f"[S3] 生成 PUT URL 失败: {e}")
            return None, None

    def stat_object(self, bucket: str, object_name: str) -> dict:
        try:
            response = self.s3_client.head_object(Bucket=self.bucket_name, Key=object_name)
            return {"size": response['ContentLength'], "last_modified": response['LastModified']}
        except Exception as e:
            print(f"[S3] 获取对象信息失败: {e}")
            return None

    def bucket_exists(self, bucket: str) -> bool:
        try:
            self.s3_client.head_bucket(Bucket=self.bucket_name)
            return True
        except Exception as e:
            return False

    def make_bucket(self, bucket: str) -> bool:
        try:
            self.s3_client.create_bucket(Bucket=self.bucket_name)
            return True
        except Exception as e:
            print(f"[S3] 创建 bucket 失败: {e}")
            return False


def get_storage_client() -> StorageClient:
    """获取存储客户端实例"""
    storage_type = os.getenv('STORAGE_TYPE', 'aliyun').lower()

    if storage_type == 'minio':
        return MinioClient()
    elif storage_type == 'aliyun':
        return AliyunOSSClient()
    elif storage_type == 's3':
        return S3Client()
    else:
        raise ValueError(f"不支持的存储类型: {storage_type}")
