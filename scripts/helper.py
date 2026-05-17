import os, re, json, subprocess
from datetime import date, datetime

from .log import *

from .paths import (
    DEFAULT_PATH, REMOTE_PATH, DRIVE_PATH, TEMP_PATH, OUTPUT_PATH,
    GIT_MASTERDB_PATH,
)

# Character name mapping or regex-based translations can be added here
CHARACTER_REGEX_TRANS_MAP = {
    # "Original":"Translated",
}

XLSX_NAME_FORMAT = {'font_name': 'Calibri','bold':False, 'text_wrap':True, 'align':'center', 'valign':'top', 'border':1}
XLSX_TEXT_FORMAT = {'font_name': 'Calibri','bold':False, 'text_wrap':True, 'align':'left', 'valign':'top', 'border':1}

REGEX_DOTS_4_TO_6 = re.compile('\.{4,6}')
REGEX_DOTS_3 = re.compile('\.{2,3}')

# Shared serialization for spreadsheet ↔ code conversion.
# Generic/Localization use SERIALIZE_LIST_FULL (includes ☢ marker for \r in Google Sheets).
# MasterDB uses SERIALIZE_LIST_BASIC (no ☢).
SERIALIZE_LIST_BASIC = [
    ('\r', '\\r'),
    ('\t', '\\t'),
]
SERIALIZE_LIST_FULL = [
    ('\r', '\\r'),
    ('\r', '☢'),       # Google Sheets workaround: ☢ → \r
    ('\t', '\\t'),
]

def Serialize(string: str, rules=SERIALIZE_LIST_FULL) -> str:
    result = string
    for original, escaped in rules:
        result = result.replace(original, escaped)
    return result

def Deserialize(string: str, rules=SERIALIZE_LIST_FULL) -> str:
    result = string
    for original, escaped in rules:
        result = result.replace(escaped, original)
    return result


def load_cache_date(cache_file):
    """Read last update date from cache file. Returns None if missing or invalid."""
    if not os.path.exists(cache_file):
        return None
    with open(cache_file, 'r') as f:
        try:
            line = f.readlines()[0]
            return datetime.fromisoformat(line.strip())
        except Exception:
            return None


def save_cache_date(cache_file):
    """Write current datetime to cache file."""
    with open(cache_file, 'w') as f:
        f.write(datetime.today().isoformat(" "))


def Helper_GetFilesFromDir(path:str, suffix:str = None, prefix:str = None) -> list[str]:
    """Get all files from dir. Output: [(Absolute path, Relative path, Filename)]"""
    finds : list[str] = []
    if not os.path.exists(path):
        return []
    for root_path, _, files in os.walk(path):
        for file in files:
            if suffix != None and not file.endswith(suffix):
                continue
            if prefix != None and not file.startswith(prefix):
                continue
            file_path = os.path.join(root_path, file)
            relate_path = os.path.relpath(file_path, os.getcwd())
            finds.append((file_path, relate_path, file))
    return finds   


def Helper_GetUpdatedFiles(target_date:str, path:str, suffix:str = None, prefix:str = None, branch:str='HEAD') -> list[str]:
    """Get updated files based on git diff since target_date."""
    _ORIGINAL_ROOT = os.getcwd()
    if not os.path.exists(path):
        return []
    try:
        CMDS = f'git rev-list --since="{target_date}" --until="{date.today()}" {branch}'
        commits = subprocess.check_output(CMDS, shell=True, text=True, cwd=path).split("\n")
    except Exception as e:
        LOG_DEBUG(2, f"Git error (checking updates): {e}")
        return []
        
    result = {}
    for commit in commits:
        if commit == "": continue
        try:
            for key in subprocess.check_output(f"git diff --name-only {commit}~", shell=True, text=True, cwd=path).split("\n"):
                if key == "": continue
                result[key] = True
        except Exception:
            continue
            
    finds : list[str] = []
    for relate_path in result.keys():
        if relate_path == "" or relate_path == "revision": continue
        file_path = os.path.join(path, relate_path)
        if not os.path.exists(file_path): continue
        rel_to_cwd = os.path.relpath(file_path, os.getcwd())
        finds.append((file_path, rel_to_cwd, os.path.basename(rel_to_cwd)))
    return finds   

def Helper_GetFilesFromDirByCheck(check_result:list, path:str, suffix:str = None, prefix:str = None) -> list[str]:
    """Get files from dir based on rclone check result."""
    finds : list[str] = []
    for diff, relate_path in check_result:
        if diff == "-": continue
        file_path = os.path.join(path, relate_path)
        rel_to_cwd = os.path.relpath(file_path, os.getcwd())
        file_name:str = os.path.basename(rel_to_cwd)
        if prefix != None and not file_name.startswith(prefix): continue
        if suffix != None and not file_name.endswith(suffix): continue
        finds.append((file_path, rel_to_cwd, file_name))
    return finds