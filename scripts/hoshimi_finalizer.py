import json
import os
from .ipr_rules import IPR_RULES
from .log import LOG_INFO, LOG_ERROR
from .paths import MASTERDB_OUTPUT_PATH

def finalize_for_hoshimi(category_list=None):
    """
    Wraps KV JSON maps into the hoshimi-localify format (adding 'rule' field).
    Output is saved to output/localized/
    """
    input_dir = MASTERDB_OUTPUT_PATH
    output_dir = os.path.join(os.path.dirname(MASTERDB_OUTPUT_PATH), "localized")
    
    os.makedirs(output_dir, exist_ok=True)
    LOG_INFO(1, "Finalizing for hoshimi-localify format...")
    
    if category_list is None:
        category_list = [f[:-5] for f in os.listdir(input_dir) if f.endswith(".json")]
        
    for category in category_list:
        input_path = os.path.join(input_dir, f"{category}.json")
        if not os.path.exists(input_path): continue
        
        with open(input_path, "r", encoding="utf-8") as f:
            translated_data = json.load(f)
            
        rules = IPR_RULES.get(category)
        rule_list = []
        if rules:
            pks = rules.get("pk", ["id"])
            pk_str = "|".join(pks)
            # Add all fields as rules
            for f in rules.get("fields", {}).keys():
                rule_list.append(f"{pk_str}|{f}")
            for n_field, n_rule in rules.get("nested", {}).items():
                for sub_f in n_rule.get("fields", {}).keys():
                    rule_list.append(f"{pk_str}|{n_field}.{sub_f}")
        
        final_output = {
            "rule": rule_list,
            "data": translated_data
        }
        
        output_path = os.path.join(output_dir, f"{category}.json")
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(final_output, f, ensure_ascii=False, indent=2)
            
        LOG_INFO(2, f"  [Finalized] {category} -> {output_path}")

if __name__ == "__main__":
    finalize_for_hoshimi()
