#!/usr/bin/env python3
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), 'app.db')

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("开始清空语料相关数据...")
print()

# 查询删除前的数量
tables = [
    'corpus_texts',
    'corpus_package_items',
    'corpus_packages',
    'corpus_group_assignments',
    'corpus_groups'
]

print("删除前的数据：")
for table in tables:
    cursor.execute(f'SELECT COUNT(*) FROM {table}')
    count = cursor.fetchone()[0]
    print(f"  {table}: {count}")

print("\n删除中...")

# 级联删除
for table in ['corpus_package_items', 'corpus_packages', 'corpus_texts', 'corpus_group_assignments', 'corpus_groups']:
    cursor.execute(f'DELETE FROM {table}')
    print(f"  ✓ 删除 {table}")

conn.commit()

print("\n删除后的数据：")
for table in tables:
    cursor.execute(f'SELECT COUNT(*) FROM {table}')
    count = cursor.fetchone()[0]
    print(f"  {table}: {count}")

conn.close()

print("\n✅ 清空完成！所有语料相关数据已删除")
print("现在可以重新创建语料组来测试删除功能")
