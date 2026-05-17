import os
import json
from .log import LOG_INFO

T_PATH = os.path.join(os.path.dirname(__file__), "ipr-db.json")
T_DB = {}
LOADED = False

def load_db():
    global T_DB, LOADED
    if os.path.exists(T_PATH):
        try:
            with open(T_PATH, 'r', encoding='utf-8') as f:
                T_DB = json.load(f)
        except Exception:
            T_DB = {}
    LOADED = True

def save_db():
    with open(T_PATH, 'w', encoding='utf-8') as f:
        json.dump(T_DB, f, ensure_ascii=False, indent=4)

def _find_db(text, fn, key):
    if text in T_DB:
        for idx, obj in enumerate(T_DB[text]):
            if obj.get('masterdb') == fn and obj.get('key') == key:
                return idx
    return -1

def add_db(text, translate_text, filename, key):
    global T_DB
    if not LOADED:
        load_db()
    if text not in T_DB:
        T_DB[text] = []
    idx = -1
    if filename != "" and key != "":
        idx = _find_db(text, filename, key)
    if idx == -1:
        T_DB[text].insert(0, {
            'translate': translate_text,
            'masterdb': filename,
            'key': key
        })
    else:
        T_DB[text][idx]['translate'] = translate_text

def has_db(text):
    if not LOADED: load_db()
    return text in T_DB

def get_db(text, fn="", key=""):
    if not LOADED:
        load_db()
    if text not in T_DB:
        return ""
    if fn != "" and key != "":
        for obj in T_DB[text]:
            if obj.get('masterdb') == fn and obj.get('key') == key:
                return obj["translate"]
    if T_DB[text]:
        return T_DB[text][0]["translate"]
    return ""
