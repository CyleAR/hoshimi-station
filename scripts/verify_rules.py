import json
import os
import re
import sys
from ipr_rules import IPR_RULES
from paths import MASTERDB_ORIGINAL_PATH

# Force UTF-8 for console output
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# 일본어 탐지 정규식 (히라가나, 가타카나, 한자 매칭)
JP_PATTERN = re.compile(r'[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]')

def get_target_fields(rules):
    """IPR_RULES 구조에서 추출 대상 필드 경로들을 집합으로 반환"""
    targets = set()
    # General fields
    for f in rules.get("fields", {}).keys():
        targets.add(f)
    # Nested fields
    for n_field, n_rule in rules.get("nested", {}).items():
        for sub_f in n_rule.get("fields", {}).keys():
            targets.add(f"{n_field}.{sub_f}")
    return targets

def verify_file(filepath, filename):
    with open(filepath, "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError:
            return

    # MasterDB JSONs usually have a "data" wrapper or are a list
    data_list = data.get("data", data) if isinstance(data, dict) else data
    if not isinstance(data_list, list):
        return

    category = filename.replace('.json', '')
    rules = IPR_RULES.get(category)
    
    if not rules:
        # If no rules, check if there's ANY Japanese text at all
        has_any_jp = False
        def find_any_jp(obj):
            nonlocal has_any_jp
            if has_any_jp: return
            if isinstance(obj, dict):
                for v in obj.values(): find_any_jp(v)
            elif isinstance(obj, list):
                for v in obj: find_any_jp(v)
            elif isinstance(obj, str):
                if JP_PATTERN.search(obj): has_any_jp = True
        
        for row in data_list: find_any_jp(row)
        
        if has_any_jp:
            print(f"\n⚠️  [미등록] '{category}' 테이블에 일본어가 존재하지만 IPR_RULES에 정의되지 않았습니다.")
        return

    target_keys = get_target_fields(rules)
    found_unmapped = set()
    jp_found_in_path = {key: False for key in target_keys}

    def traverse(obj, current_path):
        if isinstance(obj, dict):
            for k, v in obj.items():
                traverse(v, current_path + [k])
        elif isinstance(obj, list):
            for item in obj:
                # Remove array indexing for path matching (e.g. levels[0].name -> levels.name)
                traverse(item, current_path)
        elif isinstance(obj, str):
            # Clean path string for matching
            path_str = ".".join(current_path)
            # Remove any specific array indices like .0. or .1. to match rule paths
            clean_path = re.sub(r'\.\d+\.', '.', path_str)
            clean_path = re.sub(r'^\d+\.', '', clean_path)
            clean_path = re.sub(r'\.\d+$', '', clean_path)

            has_jp = bool(JP_PATTERN.search(obj))
            
            if clean_path in target_keys:
                if has_jp:
                    jp_found_in_path[clean_path] = True
            elif has_jp:
                found_unmapped.add((clean_path, obj))

    for row in data_list:
        traverse(row, [])

    # Report
    missing_reports = sorted(list(found_unmapped))[:5] # Limit display
    unnecessary_keys = [k for k, found in jp_found_in_path.items() if not found]

    if missing_reports or unnecessary_keys:
        print(f"\n{'-'*40}")
        print(f"Table: {category}")
        
        if missing_reports:
            print(f"  [누락] 룰에 없는 일본어 발견:")
            for path, text in missing_reports:
                sample = text[:30].replace('\n', ' ')
                print(f"    - '{path}': {sample}...")
        
        if unnecessary_keys:
            print(f"  [불필요] 일본어가 발견되지 않은 룰:")
            for k in unnecessary_keys:
                print(f"    - {k}")

def main():
    src_dir = MASTERDB_ORIGINAL_PATH
    if not os.path.exists(src_dir):
        print(f"Error: {src_dir} not found.")
        return

    print(f"Verifying MasterDB rules against JSONs in {src_dir}...\n")
    
    files = [f for f in os.listdir(src_dir) if f.endswith(".json")]
    for filename in sorted(files):
        filepath = os.path.join(src_dir, filename)
        verify_file(filepath, filename)

    print("\nVerification complete.")

if __name__ == "__main__":
    main()