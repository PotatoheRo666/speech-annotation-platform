"""
数据库索引优化脚本
支持 SQLite 和 MySQL
"""
import os

DATABASE_URL = os.getenv("DATABASE_URL", "mysql+pymysql://voice_admin:123456@localhost/voice_db?charset=utf8mb4")

def add_indexes():
    if DATABASE_URL.startswith("sqlite"):
        add_indexes_sqlite()
    elif DATABASE_URL.startswith("mysql"):
        add_indexes_mysql()
    else:
        print(f"不支持的数据库类型: {DATABASE_URL}")

def add_indexes_sqlite():
    import sqlite3
    db_path = DATABASE_URL.replace("sqlite:///", "")
    if db_path.startswith("./"):
        db_path = db_path[2:]
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    indexes = get_indexes()
    for idx_name, table, column in indexes:
        try:
            cursor.execute(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table} ({column})")
            print(f"✓ {idx_name}")
        except Exception as e:
            print(f"✗ {idx_name}: {e}")
    
    # 复合索引
    composite_indexes = get_composite_indexes()
    for idx_name, table, columns in composite_indexes:
        try:
            cursor.execute(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table} ({columns})")
            print(f"✓ {idx_name} (composite)")
        except Exception as e:
            print(f"✗ {idx_name}: {e}")
    
    conn.commit()
    conn.close()

def add_indexes_mysql():
    import pymysql
    
    # 解析 MySQL 连接信息
    # 格式: mysql+pymysql://user:password@host:port/database
    url = DATABASE_URL.replace("mysql+pymysql://", "")
    user_pass, host_db = url.split("@", 1)
    user, password = user_pass.split(":", 1)
    if "/" in host_db:
        host_port, database = host_db.split("/", 1)
    else:
        host_port = host_db
        database = ""
    
    if ":" in host_port:
        host, port = host_port.split(":", 1)
        port = int(port)
    else:
        host = host_port
        port = 3306
    
    # 去掉查询参数
    database = database.split("?")[0]
    
    conn = pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
        charset='utf8mb4'
    )
    cursor = conn.cursor()
    
    indexes = get_indexes()
    for idx_name, table, column in indexes:
        try:
            # MySQL 不支持 IF NOT EXISTS 语法，需要先检查
            cursor.execute(f"""
                SELECT COUNT(*) FROM information_schema.statistics 
                WHERE table_schema = %s AND table_name = %s AND index_name = %s
            """, (database, table, idx_name))
            exists = cursor.fetchone()[0]
            
            if not exists:
                cursor.execute(f"ALTER TABLE `{table}` ADD INDEX `{idx_name}` (`{column}`)")
                print(f"✓ {idx_name}")
            else:
                print(f"- {idx_name} (已存在)")
        except Exception as e:
            print(f"✗ {idx_name}: {e}")
    
    # 复合索引
    composite_indexes = get_composite_indexes()
    for idx_name, table, columns in composite_indexes:
        try:
            cursor.execute(f"""
                SELECT COUNT(*) FROM information_schema.statistics 
                WHERE table_schema = %s AND table_name = %s AND index_name = %s
            """, (database, table, idx_name))
            exists = cursor.fetchone()[0]
            
            if not exists:
                cursor.execute(f"ALTER TABLE `{table}` ADD INDEX `{idx_name}` ({columns})")
                print(f"✓ {idx_name} (composite)")
            else:
                print(f"- {idx_name} (已存在)")
        except Exception as e:
            print(f"✗ {idx_name}: {e}")
    
    conn.commit()
    conn.close()

def get_indexes():
    return [
        # User
        ("idx_users_role", "users", "role"),
        ("idx_users_username", "users", "username"),
        
        # CorpusPackage
        ("idx_corpus_packages_status", "corpus_packages", "status"),
        ("idx_corpus_packages_claimed_by", "corpus_packages", "claimed_by"),
        ("idx_corpus_packages_corpus_group_id", "corpus_packages", "corpus_group_id"),
        ("idx_corpus_packages_review_status", "corpus_packages", "review_status"),
        ("idx_corpus_packages_annotation_status", "corpus_packages", "annotation_status"),
        ("idx_corpus_packages_annotation_claimed_by", "corpus_packages", "annotation_claimed_by"),
        ("idx_corpus_packages_quality_status", "corpus_packages", "quality_status"),
        ("idx_corpus_packages_quality_claimed_by", "corpus_packages", "quality_claimed_by"),
        ("idx_corpus_packages_quality_review_status", "corpus_packages", "quality_review_status"),
        
        # VoiceRecording
        ("idx_voice_recordings_package_id", "voice_recordings", "package_id"),
        ("idx_voice_recordings_corpus_text_id", "voice_recordings", "corpus_text_id"),
        ("idx_voice_recordings_collector_id", "voice_recordings", "collector_id"),
        ("idx_voice_recordings_status", "voice_recordings", "status"),
        ("idx_voice_recordings_annotated_by", "voice_recordings", "annotated_by"),
        ("idx_voice_recordings_inspected_by", "voice_recordings", "inspected_by"),
        ("idx_voice_recordings_quality_review_action", "voice_recordings", "quality_review_action"),
        ("idx_voice_recordings_submitted_at", "voice_recordings", "submitted_at"),
        ("idx_voice_recordings_annotated_at", "voice_recordings", "annotated_at"),
        ("idx_voice_recordings_inspected_at", "voice_recordings", "inspected_at"),
        
        # CorpusPackageItem
        ("idx_corpus_package_items_package_id", "corpus_package_items", "package_id"),
        ("idx_corpus_package_items_corpus_text_id", "corpus_package_items", "corpus_text_id"),
        
        # GroupMember
        ("idx_group_members_user_id", "group_members", "user_id"),
        ("idx_group_members_group_id", "group_members", "group_id"),
        
        # AgreementSignature
        ("idx_agreement_signatures_user_id", "agreement_signatures", "user_id"),
        ("idx_agreement_signatures_agreement_id", "agreement_signatures", "agreement_id"),
        
        # CorpusGroupFolder
        ("idx_corpus_group_folders_level", "corpus_group_folders", "level"),
        ("idx_corpus_group_folders_parent_id", "corpus_group_folders", "parent_id"),
        
        # CorpusGroup
        ("idx_corpus_groups_folder_id", "corpus_groups", "folder_id"),
    ]

def get_composite_indexes():
    """复合索引 - 需要单独处理"""
    return [
        # VoiceRecording: submit_recording中查询已有记录
        ("idx_vr_pkg_txt_collector", "voice_recordings", "package_id, corpus_text_id, collector_id"),
        
        # CorpusGroupAssignment: claim-next中查询权限
        ("idx_cga_collector_group", "corpus_group_assignments", "collector_group_id, corpus_group_id"),
        
        # AgreementDocument: claim-next中查询协议
        ("idx_ad_group_created", "agreement_documents", "group_id, created_at"),
        
        # AgreementSignature: claim-next中检查签名（已有单列索引，组合索引更高效）
        ("idx_as_user_agreement", "agreement_signatures", "user_id, agreement_id"),
        
        # CorpusPackage: claim-next中查找未领取的包
        ("idx_cp_status_group", "corpus_packages", "status, corpus_group_id"),
        
        # VoiceRecording: 查询包内录音
        ("idx_vr_pkg_collector", "voice_recordings", "package_id, collector_id"),
        
        # VoiceRecording: daily-work按日期统计采集员
        ("idx_vr_collector_submitted", "voice_recordings", "collector_id, submitted_at"),
        
        # VoiceRecording: daily-work按日期统计标注员
        ("idx_vr_annotator_annotated", "voice_recordings", "annotated_by, annotated_at"),
        
        # VoiceRecording: daily-work按日期统计质检员
        ("idx_vr_inspector_inspected", "voice_recordings", "inspected_by, inspected_at"),
        
        # VoiceRecording: 无效语料查询 (is_valid=0, submitted_at DESC)
        ("idx_vr_invalid_submitted", "voice_recordings", "is_valid, submitted_at"),
        
        # CorpusPackage: statistics按claimed_by统计
        ("idx_cp_claimed_status", "corpus_packages", "claimed_by, status"),
        
        # CorpusPackage: statistics按annotation_claimed_by统计
        ("idx_cp_ann_claimed_status", "corpus_packages", "annotation_claimed_by, annotation_status"),
        
        # CorpusPackage: statistics按quality_claimed_by统计
        ("idx_cp_qual_claimed_status", "corpus_packages", "quality_claimed_by, quality_status"),
        
        # CorpusPackage: statistics按review_status统计
        ("idx_cp_claimed_review", "corpus_packages", "claimed_by, review_status"),
        
        # CorpusPackage: statistics按quality_review_status统计
        ("idx_cp_ann_claimed_qual_review", "corpus_packages", "annotation_claimed_by, quality_review_status"),
        
        # CorpusPackage: statistics按quality_review_status统计
        ("idx_cp_qual_claimed_qual_review", "corpus_packages", "quality_claimed_by, quality_review_status"),

        # CorpusPackage: 导出查询 (corpus_group_id, quality_status, quality_review_status)
        ("idx_cp_export", "corpus_packages", "corpus_group_id, quality_status, quality_review_status"),
    ]

if __name__ == "__main__":
    print(f"数据库: {DATABASE_URL[:50]}...")
    add_indexes()
    print("\n完成！")
