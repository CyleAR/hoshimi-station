import os
import re
import pandas as pd
from .log import *
from .paths import ADV_DRIVE_PATH

def parse_adv_tags_custom(content):
    """
    Highly robust parser for Idoly Pride ADV tags.
    Handles values with spaces even without quotes by looking ahead for the next key= or ].
    """
    results = []
    # Find all [tag ...] patterns
    tag_pattern = re.compile(r'\[(\w+)\s*([^\]]*)\]')
    
    for line in content.splitlines():
        line = line.strip()
        if not line: continue
        
        for match in tag_pattern.finditer(line):
            tag_name = match.group(1)
            attr_str = match.group(2).strip()
            
            tag_data = {"__tag__": tag_name}
            
            # Use regex to find all key=value pairs. 
            # The value part continues until it sees a space followed by something= OR the end of string.
            # (?: ) is a non-capturing group. (?= ) is a positive lookahead.
            # This handles cases like: text=Hello world name=AI
            attr_matches = re.findall(r'(\w+)=(?:"([^"]*)"|(.*?)(?=\s+\w+=|$))', attr_str)
            
            for attr in attr_matches:
                key = attr[0]
                val = attr[1] if attr[1] else attr[2]
                tag_data[key] = val.strip()
            
            # Handle choices nested in choicegroup
            if tag_name == "choicegroup" and "choices" in tag_data:
                inner_choices = re.findall(r'\[choice text=(?:"([^"]*)"|(.*?)(?=\s+\w+=|\]|$))', tag_data["choices"])
                if inner_choices:
                    tag_data["choice_list"] = [c[0] if c[0] else c[1].strip() for c in inner_choices]
            
            results.append(tag_data)
            
    return results

def extract_messages_from_adv_txt(file_path):
    """Extract (name, text, tag) list from an ADV txt file using custom robust parser."""
    messages = []
    if not os.path.exists(file_path):
        return None
    
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
            
        txt_data = parse_adv_tags_custom(content)
            
        for line in txt_data:
            tag = line.get("__tag__")
            if tag in ["message", "narration"]:
                name = line.get("name", "__narration__")
                text = line.get("text", "")
                messages.append((name, text, tag))
            elif tag == "title":
                name = "__title__"
                text = line.get("title", "")
                messages.append((name, text, tag))
            elif tag == "choicegroup":
                if "choice_list" in line:
                    for c_text in line["choice_list"]:
                        messages.append(("", c_text, "select"))
                elif "choices" in line:
                    messages.append(("", line["choices"], "select"))
            elif tag == "choice":
                messages.append(("", line.get("text", ""), "select"))
                    
        return messages
    except Exception as e:
        raise e

def prefill_adv():
    KOR_ADV_DIR = "adv-kor"
    if not os.path.exists(KOR_ADV_DIR):
        LOG_ERROR(0, f"Korean ADV directory not found: {KOR_ADV_DIR}")
        return

    LOG_INFO(0, "Starting ADV prefill from adv-kor using improved robust parser...")
    
    count = 0
    for root, dirs, files in os.walk(ADV_DRIVE_PATH):
        for file in files:
            if file.endswith(".xlsx"):
                xlsx_path = os.path.join(root, file)
                txt_filename = file.replace(".xlsx", ".txt")
                
                kor_txt_path = None
                for k_root, k_dirs, k_files in os.walk(KOR_ADV_DIR):
                    if txt_filename in k_files:
                        kor_txt_path = os.path.join(k_root, txt_filename)
                        break
                
                if kor_txt_path:
                    try:
                        kor_messages = extract_messages_from_adv_txt(kor_txt_path)
                        
                        if kor_messages:
                            df = pd.read_excel(xlsx_path, engine='openpyxl')
                            
                            # Standard column names for IDOLY Pride
                            NAME_COL = 'translated name'
                            TEXT_COL = 'translated text'
                            
                            if NAME_COL in df.columns:
                                df[NAME_COL] = df[NAME_COL].astype(object)
                            if TEXT_COL in df.columns:
                                df[TEXT_COL] = df[TEXT_COL].astype(object)
                            
                            msg_idx = 0
                            for i, row in df.iterrows():
                                if msg_idx < len(kor_messages):
                                    name_val = kor_messages[msg_idx][0]
                                    text_val = kor_messages[msg_idx][1]
                                    
                                    # Fill 'translated name'
                                    if NAME_COL in df.columns:
                                        if name_val == "__narration__" or name_val == "__title__":
                                            df.at[i, NAME_COL] = ""
                                        else:
                                            df.at[i, NAME_COL] = str(name_val) if pd.notnull(name_val) else ""
                                    
                                    # Fill 'translated text'
                                    if TEXT_COL in df.columns:
                                        df.at[i, TEXT_COL] = str(text_val) if pd.notnull(text_val) else ""
                                        
                                    msg_idx += 1
                            
                            # Remove the accidental 'translation' column if it exists
                            if 'translation' in df.columns:
                                df = df.drop(columns=['translation'])
                            
                            df.to_excel(xlsx_path, index=False)
                            count += 1
                    except Exception as e:
                        LOG_ERROR(1, f"Error processing {file}: {e}")
    
    LOG_INFO(0, f"Finished ADV prefill. Updated {count} files.")

if __name__ == "__main__":
    prefill_adv()
