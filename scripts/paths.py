"""
Centralized path constants for all pipelines.

All modules should import paths from here instead of defining their own.
"""

import os

# Base paths
DEFAULT_PATH = os.getcwd()
REMOTE_PATH = "idoly:ipr-translation-db"
DRIVE_PATH = DEFAULT_PATH + "/res/drive"
TEMP_PATH = DEFAULT_PATH + "/temp"
OUTPUT_PATH = DEFAULT_PATH + "/output"

# Git submodule paths
GIT_ADV_PATH = DEFAULT_PATH + "/res/adv"
GIT_MASTERDB_PATH = DEFAULT_PATH + "/res/masterdb"

# ADV
ADV_ORIGINAL_PATH = GIT_ADV_PATH + "/resource"
ADV_REMOTE_PATH = REMOTE_PATH + "/text assets"
ADV_DRIVE_PATH = DRIVE_PATH + "/text assets"
ADV_TEMP_PATH = TEMP_PATH + "/adv"
ADV_OUTPUT_PATH = OUTPUT_PATH + "/local-files/resource/adv"
ADV_CACHE_FILE = "./cache/adv_update_date.txt"

# MASTERDB (shared by v1 and v2)
MASTERDB_ORIGINAL_PATH = GIT_MASTERDB_PATH
MASTERDB_JSON_PATH = GIT_MASTERDB_PATH
MASTERDB_REMOTE_PATH = REMOTE_PATH + "/masterDB"
MASTERDB_DRIVE_PATH = DRIVE_PATH + "/masterDB"
MASTERDB_TEMP_PATH = TEMP_PATH + "/masterDB"
MASTERDB_OUTPUT_PATH = OUTPUT_PATH + "/local-files/masterTrans"
MASTERDB_CACHE_FILE = "./cache/masterdb_update_date.txt"


# Generic
GENERIC_REMOTE_PATH = REMOTE_PATH + "/GenericTrans"
GENERIC_DRIVE_PATH = DRIVE_PATH + "/GenericTrans"
GENERIC_TEMP_PATH = TEMP_PATH + "/GenericTrans"
GENERIC_OUTPUT_PATH = OUTPUT_PATH + "/local-files/genericTrans"
GENERIC_FILE_LIST = ["/generic.xlsx", "/generic.fmt.xlsx"]

# Localization
LOCALIZATION_FILE = "/localization.xlsx"
LOCALIZATION_REMOTE_PATH = REMOTE_PATH + LOCALIZATION_FILE
LOCALIZATION_DRIVE_PATH = DRIVE_PATH + LOCALIZATION_FILE
LOCALIZATION_OUTPUT_PATH = OUTPUT_PATH + "/local-files" + LOCALIZATION_FILE[:-5] + ".json"
