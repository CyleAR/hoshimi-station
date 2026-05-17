import os
import logging
import configparser
from typing import Callable, List, Union

from rclone_python import rclone
from rclone_python.remote_types import RemoteTypes
from rich.progress import (
    Progress,
    TextColumn,
    BarColumn,
    TaskProgressColumn,
    TimeRemainingColumn,
    SpinnerColumn,
    DownloadColumn,
)

from .log import *


def LoadRemoteConfig(name):
    config_path = os.getenv("RCLONE_CONFIG")
    if not config_path:
        # Default rclone config path on Windows
        appdata = os.getenv("APPDATA")
        if appdata:
            config_path = os.path.join(appdata, "rclone", "rclone.conf")
        else:
            config_path = os.path.join(os.path.expanduser("~"), ".config", "rclone", "rclone.conf")
    
    if not os.path.exists(config_path):
        LOG_WARN(2, f"Rclone config file not found at {config_path}. Skipping config load.")
        return None

    config = configparser.ConfigParser()
    config.read(config_path)
    if len(config) == 0:
        return None
    if not name in config:
        return None
    return config

def hasRemote(remote):
    try:
        return remote+":" in rclone.get_remotes()
    except:
        return False

def createRemote(remote, config:configparser.ConfigParser):
    if hasRemote(remote):
        return
    # This might fail on windows due to HOME not being set, but we handle it
    try:
        config_dir = os.path.join(os.path.expanduser("~"), ".config", "rclone")
        os.makedirs(config_dir, exist_ok=True)
        with open(os.path.join(config_dir, "rclone.conf"), "w") as f:
            config.write(f)
    except Exception as e:
        LOG_WARN(2, f"Failed to create remote config: {e}")

class Recorder:
    # Records all updates provided to the update function.
    def __init__(self):
        self.history = []

    def update(self, update: dict):
        self.history.append(update)

    def get_summary_stats(self, stat_name: str) -> List[any]:
        # returns the stats related to the overall transfer task.
        return [update[stat_name] for update in self.history]

    def get_subtask_stats(self, stat_name: str, task_name: str) -> List[any]:
        # returns stats related to a specific subtask.
        return [
            task_update[stat_name]
            for update in self.history
            for task_update in update["tasks"]
            if task_update["name"] == task_name
        ]
def generatePbar():
    pbar = Progress(
        TextColumn("[progress.description]{task.description}"),
        SpinnerColumn(),
        BarColumn(),
        TaskProgressColumn(),
        DownloadColumn(binary_units=True),
        TimeRemainingColumn(),
        console=Console(stderr=True),
        redirect_stdout=False,
        redirect_stderr=True,
    )
    return pbar

def copy(source, destination):
    recorder = Recorder()
    LOG_INFO(2, f"Rclone copy from '{source}' to '{destination}'")
    rclone.copy(source, destination, listener=recorder.update, args=["--fast-list", "--transfers=32"], pbar=generatePbar())
    return recorder

def sync(source, destination):
    recorder = Recorder()
    LOG_INFO(2, f"Rclone sync from '{source}' to '{destination}'")
    rclone.sync(source, destination, listener=recorder.update, args=["--fast-list", "--transfers=32"], pbar=generatePbar())
    return recorder

def check(source, destination):
    LOG_INFO(2, f"Rclone check from '{source}' to '{destination}'")
    try:
        returncode, result = rclone.check(source, destination, args=["--fast-list"])
        return_result = []
        for obj in result:
            if obj[0] != '=':
                return_result.append([obj[0], os.path.relpath(os.path.join(destination, obj[1]), destination)])
        return return_result
    except Exception as e:
        LOG_DEBUG(2, f"Rclone check failed (maybe new remote?): {e}")
        return []

def link(dest):
    result = rclone.link(dest, args=[])
    return result

def init():
    if not rclone.is_installed():
        LOG_WARN(2, "Rclone is not installed in PATH.")
        return
    
    try:
        # Check version
        version_str = rclone.version()
        if version_str:
            version = version_str[1:].split(".")
            if int(version[0]) < 1 or int(version[0]) == 1 and int(version[1]) < 69:
                 LOG_WARN(2, f"Rclone version {version_str} is old. Some features may not work.")
    except:
        pass

    remote_name = os.getenv("REMOTE_NAME")
    if remote_name == None:
        LOG_INFO(2, f"Environment 'REMOTE_NAME' is not set, use default name 'idoly'")
        remote_name = "idoly"
    
    if not hasRemote(remote_name):
        remote_config = LoadRemoteConfig(remote_name)
        if remote_config:
            createRemote(remote_name, remote_config)
    
    if not hasRemote(remote_name):
        LOG_WARN(2, f"Remote '{remote_name}' not found in rclone config.")

# We don't auto-init here to avoid issues when importing
init()