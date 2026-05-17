import json
import os
import re
from .ipr_rules import IPR_RULES
from .log import LOG_INFO, LOG_ERROR
from .paths import MASTERDB_ORIGINAL_PATH, MASTERDB_OUTPUT_PATH

def _set_nested_parts(obj, parts: list, value):
    """Recursive helper to set value at a given path in a nested object."""
    if not parts:
        return
    token = parts[0]
    rest = parts[1:]

    # Array index parsing: "levels[0]" -> key="levels", idx=0
    m = re.match(r'^(\w+)\[(\d+)\]$', token)
    if m:
        key = m.group(1)
        idx = int(m.group(2))
        if isinstance(obj, dict) and key in obj:
            arr = obj[key]
            if isinstance(arr, list) and idx < len(arr):
                if not rest:
                    arr[idx] = value
                else:
                    _set_nested_parts(arr[idx], rest, value)
    else:
        key = token
        if isinstance(obj, dict) and key in obj:
            if not rest:
                # Leaf: String or [LA_F] Array
                if isinstance(value, str) and value.startswith("[LA_F]"):
                    remaining = value[len("[LA_F]"):]
                    if remaining == "":
                        obj[key] = []
                    else:
                        obj[key] = remaining.split("[LA_N_F]")
                else:
                    obj[key] = value
            else:
                _set_nested_parts(obj[key], rest, value)

def fill_back_translations(data_obj: dict, primary_keys: list, trans_map: dict):
    """Apply translations from KV map back to a single record."""
    pk_parts = [str(data_obj.get(pk, "")) for pk in primary_keys]
    baseKey = "|".join(pk_parts)
    prefix = baseKey + "|"
    
    for fullKey, translated in trans_map.items():
        if not fullKey.startswith(prefix):
            continue
        if not translated:
            continue
        
        field_path = fullKey[len(prefix):]
        parts = re.split(r'\.', field_path)
        _set_nested_parts(data_obj, parts, translated)

def run_import(category, trans_map):
    """
    Import translations for a specific category.
    category: e.g. 'Character'
    trans_map: { "PK|path": "translation" }
    """
    base_json_path = os.path.join(MASTERDB_ORIGINAL_PATH, f"{category}.json")
    output_json_path = os.path.join(MASTERDB_OUTPUT_PATH, f"{category}.json")
    
    if not os.path.exists(base_json_path):
        LOG_ERROR(2, f"Source JSON not found for import: {base_json_path}")
        return False
        
    rules = IPR_RULES.get(category)
    if not rules:
        LOG_ERROR(2, f"Rules not found for category: {category}")
        return False
        
    with open(base_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    data_list = data.get("data", data) if isinstance(data, dict) else data
    if not isinstance(data_list, list):
        LOG_ERROR(2, f"Unexpected JSON structure in {category}.json")
        return False
        
    primary_keys = rules.get("pk", ["id"])
    
    for row in data_list:
        if isinstance(row, dict):
            fill_back_translations(row, primary_keys, trans_map)
            
    os.makedirs(os.path.dirname(output_json_path), exist_ok=True)
    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        
    LOG_INFO(2, f"Successfully imported translations to {output_json_path}")
    return True

def batch_import_from_kv_dir(kv_dir):
    """Batch import translations from a directory of KV JSONs."""
    for file in os.listdir(kv_dir):
        if file.endswith(".json"):
            category = file[:-5]
            with open(os.path.join(kv_dir, file), "r", encoding="utf-8") as f:
                trans_map = json.load(f)
            run_import(category, trans_map)
