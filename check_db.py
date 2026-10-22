import sqlite3

conn = sqlite3.connect('app.db')
cursor = conn.cursor()

# Check corpus groups and their folder assignments
cursor.execute('SELECT id, name, folder_id FROM corpus_groups')
corp_groups = cursor.fetchall()
print('Corpus groups:', corp_groups)

# Check all assignment tables
for table_name in [
    'corpus_group_assignments',
    'corpus_annotation_assignments', 
    'corpus_inspection_assignments',
    'corpus_reviewer_assignments',
    'corpus_quality_reviewer_assignments'
]:
    try:
        cursor.execute(f'SELECT * FROM {table_name}')
        rows = cursor.fetchall()
        print(f'{table_name}: {len(rows)} rows')
        if rows:
            cursor.execute(f'PRAGMA table_info({table_name})')
            cols = [col[1] for col in cursor.fetchall()]
            print(f'  Columns: {cols}')
            for row in rows[:3]:  # Show first 3 rows
                print(f'  Row: {row}')
    except Exception as e:
        print(f'{table_name}: ERROR - {e}')

# Check groups by role type
cursor.execute('SELECT id, name, role_type FROM groups')
groups = cursor.fetchall()
print('\nGroups by role:')
role_groups = {}
for g in groups:
    role = g[2]
    if role not in role_groups:
        role_groups[role] = []
    role_groups[role].append(g)
for role, gs in role_groups.items():
    print(f'  {role}: {[g[1] for g in gs]}')

conn.close()
