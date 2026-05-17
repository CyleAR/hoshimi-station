import os
import json
import re
import pandas as pd
from .ipr_rules import IPR_RULES, IPR_IGNORE_PATTERNS
from .log import LOG_INFO, LOG_ERROR, LOG_WARN, LOG_DEBUG
from .helper import load_cache_date, save_cache_date, Helper_GetUpdatedFiles

# ============================================================
# Helpers
# ============================================================

def clean_text(text: str) -> str:
    """Remove control characters that are illegal in Excel."""
    if not isinstance(text, str):
        return text
    return "".join(c for c in text if (ord(c) >= 32 and ord(c) != 127) or c in "\n\r\t")

def should_ignore(text: str) -> bool:
    if not isinstance(text, str):
        return True
    if not text.strip():
        return True
    for pattern in IPR_IGNORE_PATTERNS:
        if pattern.match(text.strip()):
            return True
    return False

def serialize_array(arr: list) -> str:
    """Convert string array to [LA_F] format."""
    if not arr: return ""
    return "[LA_F]" + "[LA_N_F]".join(str(x) for x in arr)

def deserialize_array(text: str) -> list:
    """Convert [LA_F] format back to list."""
    if not text.startswith("[LA_F]"):
        return [text]
    return text[6:].split("[LA_N_F]")

# ============================================================
# Core Logic: Extraction
# ============================================================

def traverse_and_extract(obj, path_parts: list, current_path: str, base_id: str, results: list, category: str):
    """Recursively traverse JSON object to find translatable fields."""
    if not path_parts:
        # Leaf node: Collect text
        if isinstance(obj, str):
            if not should_ignore(obj):
                results.append({
                    "category": category,
                    "id": f"{base_id}|{current_path}",
                    "original": clean_text(obj),
                    "translated": ""
                })
        elif isinstance(obj, list):
            # String array handling
            if all(isinstance(x, (str, int, float)) for x in obj):
                text = serialize_array(obj)
                if not should_ignore(text):
                    results.append({
                        "category": category,
                        "id": f"{base_id}|{current_path}",
                        "original": clean_text(text),
                        "translated": ""
                    })
        return

    key = path_parts[0]
    remaining = path_parts[1:]
    
    if isinstance(obj, dict):
        if key in obj:
            new_path = f"{current_path}.{key}" if current_path else key
            traverse_and_extract(obj[key], remaining, new_path, base_id, results, category)
    
    elif isinstance(obj, list):
        # Array of objects: Traverse each element with index
        for idx, item in enumerate(obj):
            new_path = f"{current_path}[{idx}].{key}" if current_path else f"[{idx}].{key}"
            if isinstance(item, dict) and key in item:
                traverse_and_extract(item[key], remaining, new_path, base_id, results, category)

def load_and_extract_ipr_data(json_dir: str) -> list:
    extracted_data = []
    
    for filename, rules in IPR_RULES.items():
        file_path = os.path.join(json_dir, f"{filename}.json")
        if not os.path.exists(file_path):
            continue
            
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                
            data_list = data.get("data", data) if isinstance(data, dict) else data
            if not isinstance(data_list, list):
                continue
                
            pk_fields = rules.get("pk", ["id"])
            
            target_paths = []
            for f in rules.get("fields", {}).keys():
                target_paths.append(f)
            
            for n_field, n_rule in rules.get("nested", {}).items():
                for sub_f in n_rule.get("fields", {}).keys():
                    target_paths.append(f"{n_field}.{sub_f}")

            for item in data_list:
                pk_values = [str(item.get(pk, "0")) for pk in pk_fields]
                base_id = "_".join(pk_values)
                
                for path in target_paths:
                    parts = path.split(".")
                    traverse_and_extract(item, parts, "", base_id, extracted_data, filename)
                                        
        except Exception as e:
            LOG_ERROR(2, f"Error processing {file_path}: {e}")
            continue
            
    return extracted_data

# ============================================================
# Public API
# ============================================================

def UpdateOriginalToDrive(bFullUpdate=False):
    from .paths import MASTERDB_ORIGINAL_PATH, MASTERDB_DRIVE_PATH, MASTERDB_CACHE_FILE, MASTERDB_REMOTE_PATH
    
    # Smart Update: Check if source files changed since last run
    if not bFullUpdate:
        last_update = load_cache_date(MASTERDB_CACHE_FILE)
        if last_update:
            updated_files = Helper_GetUpdatedFiles(last_update, MASTERDB_ORIGINAL_PATH)
            if not updated_files:
                LOG_INFO(1, "MasterDB is already up-to-date. (Checked via Git)")
                return {"files": [], "remote_path": MASTERDB_REMOTE_PATH}, {}
    
    json_dir = MASTERDB_ORIGINAL_PATH
    extracted_data = load_and_extract_ipr_data(json_dir)
    
    if not extracted_data:
        LOG_WARN(2, "No data extracted for translation.")
        return {"files": [], "remote_path": MASTERDB_REMOTE_PATH}, {}
        
    os.makedirs(MASTERDB_DRIVE_PATH, exist_ok=True)
    
    df = pd.DataFrame(extracted_data)
    df = df.drop_duplicates(subset=['category', 'id'])
    
    exported_files = []
    for category, group in df.groupby('category'):
        output_path = os.path.join(MASTERDB_DRIVE_PATH, f"{category}.xlsx")
        
        export_df = group[['id', 'original', 'translated']].copy()
        export_df.rename(columns={'id': 'ID', 'original': '원문', 'translated': '번역'}, inplace=True)
        
        # Merge with existing file to preserve translations
        if os.path.exists(output_path):
            try:
                old_df = pd.read_excel(output_path, engine='openpyxl').fillna("")
                if 'ID' in old_df.columns and '번역' in old_df.columns:
                    # Create a map of existing translations
                    old_trans = dict(zip(old_df['ID'], old_df['번역']))
                    # Map existing translations to the new data
                    # If ID matches, use the existing translation. Otherwise, keep it empty.
                    export_df['번역'] = export_df['ID'].apply(lambda x: old_trans.get(x, ""))
                    LOG_INFO(3, f"Merged existing translations for {category}.xlsx")
            except Exception as e:
                LOG_WARN(3, f"Failed to merge existing translations for {category}.xlsx: {e}")

        # Use simple Excel export for individual files
        export_df.to_excel(output_path, index=False)
        exported_files.append(f"{category}.xlsx")
            
    LOG_INFO(2, f"Created {len(exported_files)} individual XLSX files in {MASTERDB_DRIVE_PATH}.")
    
    # Update cache date after successful extraction
    save_cache_date(MASTERDB_CACHE_FILE)
    
    return {"files": exported_files, "remote_path": MASTERDB_REMOTE_PATH}, {}

def ConvertDriveToOutput(drive_file_paths=None, bFullUpdate=False):
    from .paths import MASTERDB_DRIVE_PATH, MASTERDB_OUTPUT_PATH
    
    if drive_file_paths is None:
        # Scan for all XLSX files in the masterdb drive directory
        if not os.path.exists(MASTERDB_DRIVE_PATH):
            LOG_INFO(2, f"MasterDB drive path {MASTERDB_DRIVE_PATH} not found.")
            return [], []
        
        xlsx_files = [f for f in os.listdir(MASTERDB_DRIVE_PATH) if f.endswith(".xlsx")]
        drive_file_paths = [(os.path.join(MASTERDB_DRIVE_PATH, f), f, f) for f in xlsx_files]
        
    if not drive_file_paths:
        LOG_INFO(2, "No MasterDB XLSX files found, skipping conversion.")
        return [], []
        
    converted_file_list = []
    error_file_list = []
    
    os.makedirs(MASTERDB_OUTPUT_PATH, exist_ok=True)
    
    for abs_path, _, filename in drive_file_paths:
        category = filename[:-5] # Remove .xlsx
        try:
            # Force dtype=str to prevent pandas from converting columns to datetime objects
            df = pd.read_excel(abs_path, engine='openpyxl', dtype=str).fillna("")
            
            if '번역' not in df.columns or 'ID' not in df.columns:
                LOG_WARN(2, f"Skipping {filename}: Missing 'ID' or '번역' columns.")
                continue

            translated_rows = df[df['번역'] != ""]
            if translated_rows.empty:
                continue
                
            trans_map = dict(zip(translated_rows['ID'], translated_rows['번역']))
                                    
            # Build HoshimiLocalify final format
            rules = IPR_RULES.get(category)
            rule_list = []
            if rules:
                pks = rules.get("pk", ["id"])
                pk_str = "|".join(pks)
                # Add top-level fields
                for f in rules.get("fields", {}).keys():
                    rule_list.append(f"{pk_str}|{f}")
                # Add nested fields
                for n_field, n_rule in rules.get("nested", {}).items():
                    for sub_f in n_rule.get("fields", {}).keys():
                        rule_list.append(f"{pk_str}|{n_field}.{sub_f}")
            
            final_output = {
                "rule": rule_list,
                "data": trans_map
            }

            out_json_path = os.path.join(MASTERDB_OUTPUT_PATH, f"{category}.json")
            with open(out_json_path, 'w', encoding='utf-8') as f:
                json.dump(final_output, f, ensure_ascii=False, indent=2)
                
            converted_file_list.append(f"{category}.json")
            LOG_INFO(2, f"Exported {len(trans_map)} translations for {category} (KV Map)")
            
        except Exception as e:
            LOG_ERROR(2, f"Error converting {filename} to KV Map: {e}")
            error_file_list.append((filename, e))
        
    return error_file_list, converted_file_list
