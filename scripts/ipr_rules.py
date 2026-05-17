"""
IPR (Idoly Pride) MasterDB translation rules.
"""

_COMMON_HEADERS = {
    "age": "나이",
    "birthday": "생일",
    "catchphrase": "캐치프레이즈",
    "choiceText": "선택지 텍스트",
    "cv": "CV",
    "description": "설명",
    "evolveMessage": "진화 메시지",
    "favorite": "좋아하는 것",
    "firstName": "이름(성)",
    "groupName": "그룹명",
    "hometown": "출신/학교",
    "idiom": "격언",
    "level": "레벨",
    "managerText": "매니저 텍스트",
    "name": "이름",
    "obtainMessage": "획득 메시지",
    "profile": "프로필",
    "shortDescription": "짧은 설명",
    "shortProfile": "프로필(요약)",
    "text": "텍스트",
    "title": "제목",
    "unfavorite": "싫어하는 것",
    "word": "단어",
    "zodiacSign": "별자리",
}

def _h(field_name: str) -> str:
    return _COMMON_HEADERS.get(field_name, field_name)

IPR_RULES = {
    "Accessory": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "ActivityAbility": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
        "nested": {
            "levels": {
                "index_key": "level",
                "fields": {
                    "description": _h("description"),
                },
            },
        },
    },
    "ActivityFanEvent": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
        "nested": {
            "levels": {
                "index_key": "level",
                "fields": {
                    "name": _h("name"),
                },
            },
        },
    },
    "ActivityPromotion": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
        "nested": {
            "levels": {
                "index_key": "level",
                "fields": {
                    "name": _h("name"),
                },
            },
        },
    },
    "ActivityRefresh": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
        "nested": {
            "levels": {
                "index_key": "level",
                "fields": {
                    "name": _h("name"),
                },
            },
        },
    },
    "Area": {
        "pk": ['id'],
        "fields": {
            "dailyRewardName": _h("dailyRewardName"),
            "description": _h("description"),
            "name": _h("name"),
        },
    },
    "AreaGroup": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "BacksidePanelGoalSetting": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "BoxGacha": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "Card": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "name": _h("name"),
            "obtainMessage": _h("obtainMessage"),
        },
    },
    "CardEvolutionMessage": {
        "pk": ['cardId', 'evolutionLevel', 'number'],
        "fields": {
            "evolveMessage": _h("evolveMessage"),
        },
    },
    "Character": {
        "pk": ['id'],
        "fields": {
            "age": _h("age"),
            "birthday": _h("birthday"),
            "catchphrase": _h("catchphrase"),
            "cv": _h("cv"),
            "favorite": _h("favorite"),
            "firstName": _h("firstName"),
            "groupName": _h("groupName"),
            "hometown": _h("hometown"),
            "idiom": _h("idiom"),
            "name": _h("name"),
            "profile": _h("profile"),
            "shortProfile": _h("shortProfile"),
            "unfavorite": _h("unfavorite"),
            "zodiacSign": _h("zodiacSign"),
        },
        "nested": {
            "activityFanEventWords": {
                "index_key": "id",
                "fields": {
                    "word": _h("word"),
                },
            },
            "loveInfo": {
                "index_key": "id",
                "fields": {
                    "cv": _h("cv"),
                    "description": _h("description"),
                    "name": _h("name"),
                },
            },
            "loveInfos": {
                "index_key": "id",
                "fields": {
                    "cv": _h("cv"),
                    "description": _h("description"),
                    "name": _h("name"),
                },
            },
        },
    },
    "CharacterGroup": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
        "nested": {
            "mappings": {
                "index_key": "id",
                "fields": {
                    "description": _h("description"),
                },
            },
        },
    },
    "CompanyEnjoyHomeAction": {
        "pk": ['id'],
        "fields": {
            "text": _h("text"),
        },
    },
    "CompanyPoint": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "name": _h("name"),
        },
    },
    "ConditionDescription": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
        },
    },
    "Costume": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "CostumeType": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "Decoration": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "name": _h("name"),
        },
    },
    "DutyPoint": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "howToGet": _h("howToGet"),
            "name": _h("name"),
        },
    },
    "Emblem": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "name": _h("name"),
        },
    },
    "EventMission": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "EventStory": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "name": _h("name"),
        },
    },
    "Exercise": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "name": _h("name"),
        },
    },
    "ExerciseHint": {
        "pk": ['exerciseId'],
        "nested": {
            "contents": {
                "index_key": "number",
                "fields": {
                    "text": _h("text"),
                    "title": _h("title"),
                },
            },
        },
    },
    "ExtraStory": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "name": _h("name"),
        },
    },
    "ExtraStoryPart": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "Gacha": {
        "pk": ['id'],
        "fields": {
            "appealText": _h("appealText"),
            "description": _h("description"),
            "name": _h("name"),
            "precaution": _h("precaution"),
        },
    },
    "GachaButton": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "name": _h("name"),
        },
    },
    "GachaStamp": {
        "pk": ['groupId', 'sheetNumber', 'stampNumber'],
        "fields": {
            "description": _h("description"),
        },
    },
    "Guild": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "Hair": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "HelpCategory": {
        "pk": ['id'],
        "fields": {
            "title": _h("title"),
        },
        "nested": {
            "contents": {
                "index_key": "helpContentId",
                "fields": {
                    "text": _h("text"),
                    "title": _h("title"),
                },
            },
        },
    },
    "HierarchyGrade": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "HomeAction": {
        "pk": ['homeActionId'],
        "fields": {
            "text": _h("text"),
        },
    },
    "HomeBackground": {
        "pk": ['homeBackgroundId'],
        "fields": {
            "name": _h("name"),
        },
    },
    "HomeBackgroundCategory": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "HomeDramaPosition": {
        "pk": ['homeDramaPositionId'],
        "fields": {
            "name": _h("name"),
        },
    },
    "HomeTalk": {
        "pk": ['homeTalkId'],
        "fields": {
            "choiceText": _h("choiceText"),
            "displayConditionDescription": _h("displayConditionDescription"),
            "managerText": _h("managerText"),
            "title": _h("title"),
        },
        "nested": {
            "characterTalks": {
                "index_key": "voiceAssetId",
                "fields": {
                    "text": _h("text"),
                },
            },
        },
    },
    "HomeTalkCallPattern": {
        "pk": ['characterId', 'patternId'],
        "fields": {
            "characterArrivalText": _h("characterArrivalText"),
            "managerCallText": _h("managerCallText"),
        },
    },
    "Item": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "howToGet": _h("howToGet"),
            "name": _h("name"),
        },
    },
    "LiveAbility": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "name": _h("name"),
        },
        "nested": {
            "levels": {
                "index_key": "level",
                "fields": {
                    "description": _h("description"),
                },
            },
        },
    },
    "LiveBonus": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "LiveTip": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
        },
    },
    "Loading": {
        "pk": ['id'],
        "fields": {
            "text": _h("text"),
            "title": _h("title"),
        },
    },
    "LoginBonus": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "name": _h("name"),
        },
    },
    "LoginBonusText": {
        "pk": ['id'],
        "fields": {
            "text": _h("text"),
        },
    },
    "LoveHomeAction": {
        "pk": ['id'],
        "fields": {
            "text": _h("text"),
        },
    },
    "MarathonBoxGachaSetting": {
        "pk": ['marathonId', 'boxGachaId'],
        "fields": {
            "guageName": _h("guageName"),
        },
    },
    "MarathonQuest": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "name": _h("name"),
            "unlockDescription": _h("unlockDescription"),
        },
    },
    "Message": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
        "nested": {
            "details": {
                "index_key": "messageDetailId",
                "fields": {
                    "choiceText": _h("choiceText"),
                    "text": _h("text"),
                },
            },
        },
    },
    "MessageGroup": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "Mission": {
        "pk": ['id'],
        "fields": {
            "longDescription": _h("longDescription"),
            "name": _h("name"),
            "shortDescription": _h("shortDescription"),
        },
    },
    "Music": {
        "pk": ['id'],
        "fields": {
            "arranger": _h("arranger"),
            "composer": _h("composer"),
            "description": _h("description"),
            "lyricist": _h("lyricist"),
            "name": _h("name"),
            "singer": _h("singer"),
        },
    },
    "PhotoAbility": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "name": _h("name"),
        },
    },
    "PhotoActivity": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "PhotoAllInOne": {
        "pk": ['id'],
        "fields": {
            "eventName": _h("eventName"),
            "name": _h("name"),
            "placeName": _h("placeName"),
        },
    },
    "PhotoContestActivity": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "PhotoContestQuestMusic": {
        "pk": ['id'],
        "fields": {
            "arranger": _h("arranger"),
            "composer": _h("composer"),
            "description": _h("description"),
            "lyricist": _h("lyricist"),
            "name": _h("name"),
            "singer": _h("singer"),
        },
    },
    "PhotoContestQuestStage": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "PhotoContestSection": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "name": _h("name"),
            "theme": _h("theme"),
        },
    },
    "PhotoExpression": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "PhotoExpressionStagePosition": {
        "pk": ['stageId', 'number'],
        "fields": {
            "name": _h("name"),
        },
    },
    "PhotoFacial": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "PhotoPose": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "name": _h("name"),
        },
    },
    "PhotoQuestMusic": {
        "pk": ['id'],
        "fields": {
            "arranger": _h("arranger"),
            "composer": _h("composer"),
            "description": _h("description"),
            "lyricist": _h("lyricist"),
            "name": _h("name"),
            "singer": _h("singer"),
        },
    },
    "PhotoQuestStage": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "PhotoRecipe": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "name": _h("name"),
        },
    },
    "Quest": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "name": _h("name"),
        },
    },
    "QuestPressure": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "RaceQuest": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "name": _h("name"),
        },
    },
    "Setting": {
        "pk": ['id'],
        "fields": {
            "dreamAreaName": _h("dreamAreaName"),
            "functionMaintenanceMessage": _h("functionMaintenanceMessage"),
            "functionMaintenanceTitle": _h("functionMaintenanceTitle"),
            "tutorialAdvSubTitle": _h("tutorialAdvSubTitle"),
            "tutorialAdvTitle": _h("tutorialAdvTitle"),
        },
    },
    "ShowcaseFrame": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "name": _h("name"),
        },
    },
    "ShowcaseHashtag": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "ShowcaseMusicFilter": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "ShowcaseToy": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "name": _h("name"),
        },
    },
    "ShowcaseToyCategory": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "ShowcaseToyShopFilter": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "Skill": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
        "nested": {
            "levels": {
                "index_key": "level",
                "fields": {
                    "description": _h("description"),
                    "shortDescription": _h("shortDescription"),
                },
            },
        },
    },
    "SkillEfficacy": {
        "pk": ['id'],
        "fields": {
            "description": _h("description"),
            "name": _h("name"),
        },
    },
    "StaffTraining": {
        "pk": ['parameterType'],
        "fields": {
            "name": _h("name"),
        },
    },
    "Stage": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
        "nested": {
            "cameraPositions": {
                "index_key": "number",
                "fields": {
                    "name": _h("name"),
                },
            },
        },
    },
    "StatusEffectName": {
        "pk": ['statusEffectType'],
        "fields": {
            "name": _h("name"),
        },
    },
    "Story": {
        "pk": ['id'],
        "fields": {
            "branchCautionText": _h("branchCautionText"),
            "branchFirstText": _h("branchFirstText"),
            "description": _h("description"),
            "name": _h("name"),
        },
        "nested": {
            "branchChoices": {
                "index_key": "index",
                "fields": {
                    "text": _h("text"),
                },
            },
        },
    },
    "StoryPart": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
        "nested": {
            "chapters": {
                "index_key": "id",
                "fields": {
                    "name": _h("name"),
                },
            },
        },
    },
    "Telephone": {
        "pk": ['id'],
        "fields": {
            "name": _h("name"),
        },
    },
    "Tutorial": {
        "pk": ['type'],
        "nested": {
            "stepInfo": {
                "index_key": "id",
                "fields": {
                    "texts": _h("texts"),
                },
            },
        },
    },
    "Wording": {
        "pk": ['key'],
        "fields": {
            "word": _h("word"),
        },
    },
}


import re
IPR_IGNORE_PATTERNS = [
    re.compile(r'^[\d\.\-\+,]+$'),
    re.compile(r'^[A-Za-z0-9_\-\.\:\/]+$'),
    re.compile(r'^\s*$'),
]
