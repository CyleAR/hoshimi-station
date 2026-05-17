import os
import json
import pandas as pd
from . import ipr_extractor
from .ipr_rules import IPR_RULES
from .log import LOG_INFO, LOG_ERROR
from .paths import MASTERDB_DRIVE_PATH

def prefill_xlsx_from_json_dir(json_kor_dir, xlsx_dir=None):
    """
    Read Korean JSONs from a directory and fill '번역' column in individual local Excel files.
    """
    if xlsx_dir is None:
        xlsx_dir = MASTERDB_DRIVE_PATH
        
    if not os.path.isdir(xlsx_dir):
        LOG_ERROR(1, f"Excel directory not found for prefill: {xlsx_dir}")
        return

    if not os.path.exists(json_kor_dir):
        LOG_ERROR(1, f"Korean JSON directory not found: {json_kor_dir}")
        return

    LOG_INFO(1, f"Starting prefill from {json_kor_dir} to files in {xlsx_dir}...")
    
    match_total = 0
    xlsx_files = [f for f in os.listdir(xlsx_dir) if f.endswith(".xlsx")]
    
    for filename in xlsx_files:
        category = filename[:-5] # Remove .xlsx
        xlsx_path = os.path.join(xlsx_dir, filename)
        kor_json_path = os.path.join(json_kor_dir, f"{category}.json")
        
        if not os.path.exists(kor_json_path):
            continue
            
        LOG_INFO(2, f"Matching {category}...")
        
        try:
            # 1. Load individual Excel
            df = pd.read_excel(xlsx_path, engine='openpyxl').fillna("")
            
            # 2. Extract KV map from Korean JSON
            with open(kor_json_path, 'r', encoding='utf-8') as f:
                kor_data = json.load(f)
            
            # If it's already a KV map, use it directly
            if isinstance(kor_data, dict) and not any(isinstance(v, (dict, list)) for v in kor_data.values()):
                kor_kv_map = kor_data
            else:
                # If it's a full JSON structure, extract it using the rules
                extracted = []
                rules = IPR_RULES.get(category, {})
                pk_fields = rules.get("pk", ["id"])
                target_paths = []
                for f in rules.get("fields", {}).keys(): target_paths.append(f)
                for n_field, n_rule in rules.get("nested", {}).items():
                    for sub_f in n_rule.get("fields", {}).keys(): target_paths.append(f"{n_field}.{sub_f}")
                
                data_list = kor_data.get("data", kor_data) if isinstance(kor_data, dict) else kor_data
                if isinstance(data_list, list):
                    for item in data_list:
                        pk_values = [str(item.get(pk, "0")) for pk in pk_fields]
                        base_id = "_".join(pk_values)
                        for path in target_paths:
                            ipr_extractor.traverse_and_extract(item, path.split("."), "", base_id, extracted, category)
                
                kor_kv_map = {item['id']: item['original'] for item in extracted}

            # 3. Apply translations to DataFrame
            df['번역'] = df['번역'].astype(str)
            count = 0
            for idx, row in df.iterrows():
                row_id = row['ID']
                if row_id in kor_kv_map:
                    val = kor_kv_map[row_id]
                    # Only fill if current translation is empty and it's actually different from original
                    if not row['번역'] and val and val != row['원문']:
                        df.at[idx, '번역'] = val
                        count += 1
            
            # 4. Save back to the same Excel file
            if count > 0:
                df.to_excel(xlsx_path, index=False)
                match_total += count
                LOG_INFO(2, f"  -> {count} items prefilled for {category}")

        except Exception as e:
            LOG_ERROR(2, f"Error prefilling {category}: {e}")

    LOG_INFO(1, f"Prefill complete! Total {match_total} items matched.")
