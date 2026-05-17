import os
import json
import re
import sys
import io
from typing import List, Dict

# Set console output to UTF-8
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTERDB_PATH = os.path.join(BASE_DIR, "res", "masterdb")
ADV_PATH = os.path.join(BASE_DIR, "res", "adv", "resource")

def load_json(filename: str):
    path = os.path.join(MASTERDB_PATH, f"{filename}.json")
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def track_card(asset_id: str):
    print(f"Tracking translation assets for Card Asset ID: {asset_id}\n")
    
    # 1. Card.json
    cards = load_json("Card")
    card_entry = next((c for c in cards if c.get("assetId") == asset_id), None)
    if not card_entry:
        card_entry = next((c for c in cards if c.get("id") == f"card-{asset_id}"), None)
    
    if not card_entry:
        print(f"[-] Card with assetId '{asset_id}' not found in Card.json.")
        return

    card_id = card_entry.get("id")
    print(f"[+] 1. 카드 기본 정보 (Card.json)")
    print(f"    - 카드명: {card_entry.get('name')}")
    print(f"    - 설명 (글귀): {card_entry.get('description')}")
    print(f"    - 획득 메시지: {card_entry.get('obtainMessage')}")
    print()

    # 2. Costume.json
    costume_id = card_entry.get("rewardCostumeId")
    if costume_id:
        costumes = load_json("Costume")
        costume_entry = next((cos for cos in costumes if cos.get("id") == costume_id), None)
        if costume_entry:
            print(f"[+] 2. 의상 정보 (Costume.json)")
            print(f"    - 의상명: {costume_entry.get('name')} ({costume_id})")
        else:
            print(f"[+] 2. 의상 정보: {costume_id} (Costume.json에서 못 찾음)")
        print()

    # 3. Skill.json
    skill_ids = [card_entry.get(f"skillId{i}") for i in range(1, 5) if card_entry.get(f"skillId{i}")]
    if skill_ids:
        skills = load_json("Skill")
        print(f"[+] 3. 스킬 정보 (Skill.json)")
        for sid in skill_ids:
            s_entry = next((s for s in skills if s.get("id") == sid), None)
            if s_entry:
                print(f"    - {sid}: {s_entry.get('name')}")
                for lvl in s_entry.get("levels", []):
                    desc = lvl.get('description', '').replace('\n', ' ')
                    print(f"      [Lvl {lvl.get('level')}] {desc}")
            else:
                print(f"    - {sid}: NOT FOUND")
        print()

    # 4. Story.json & ADV
    story_refs = card_entry.get("stories", [])
    if story_refs:
        stories = load_json("Story")
        print(f"[+] 4. 스토리 및 ADV (Story.json)")
        for sref in story_refs:
            sid = sref.get("storyId")
            s_entry = next((s for s in stories if s.get("id") == sid), None)
            if s_entry:
                print(f"    - {sid}: {s_entry.get('name')}")
                adv_ids = s_entry.get("advAssetIds", [])
                for aid in adv_ids:
                    adv_file = f"adv_{aid}.txt"
                    adv_full_path = os.path.join(ADV_PATH, adv_file)
                    exists = "파일 있음" if os.path.exists(adv_full_path) else "파일 없음"
                    print(f"      -> ADV: {adv_file} ({exists})")
            else:
                print(f"    - {sid}: NOT FOUND")
        print()

    # 5. Message.json
    messages = load_json("Message")
    msg_group_id = f"message-card-{asset_id}"
    msg_entries = [m for m in messages if m.get("id") == msg_group_id]
    if msg_entries:
        print(f"[+] 5. 메시지 (Message.json)")
        for group in msg_entries:
            for detail in group.get("details", []):
                text = detail.get("text", "").replace("\n", " ")
                print(f"    - [{detail.get('messageDetailId')}] {text[:50]}...")
        print()
    else:
        # Check if linked in card_entry
        m_refs = card_entry.get("messages", [])
        if m_refs:
            print(f"[+] 5. 메시지 (Card.json에 정의됨)")
            for mref in m_refs:
                mid = mref.get("messageId")
                print(f"    - {mid}")
        else:
            print(f"[-] 5. 메시지: '{msg_group_id}' 관련 데이터를 찾을 수 없음")
        print()

    # 6. HomeTalk.json (Bubble Talks)
    home_talks = load_json("HomeTalk")
    relevant_ht = [ht for ht in home_talks if asset_id in ht.get("homeTalkId", "") or ht.get("cardId") == card_id]
    
    # Check costume-linked home talks
    if costume_id:
        conditions = load_json("Condition")
        # Find condition IDs that require this costume
        # Note: Condition structure is complex, this is a simplified search
        cond_ids_for_cos = []
        for cond in conditions:
            # Check if costumeId is mentioned in the condition structure
            # This is a bit brute-force but effective
            if costume_id in str(cond):
                cond_ids_for_cos.append(cond.get("id"))
        
        if cond_ids_for_cos:
            cos_ht = [ht for ht in home_talks if ht.get("conditionId") in cond_ids_for_cos]
            for cht in cos_ht:
                if cht not in relevant_ht:
                    relevant_ht.append(cht)

    if relevant_ht:
        print(f"[+] 6. 홈 화면 대사 (HomeTalk.json - 말풍선)")
        for ht in relevant_ht:
            print(f"    - ID: {ht.get('homeTalkId')}")
            if ht.get('choiceText'):
                print(f"      선택지: {ht.get('choiceText')}")
            for ct in ht.get("characterTalks", []):
                text = ct.get('text', '').replace('\n', ' ')
                print(f"      > {text}")
        print()
    else:
        print(f"[-] 6. 홈 화면 대사: 관련 데이터 없음")
        print()

    # 7. HomeTalkCallPattern.json
    call_patterns = load_json("HomeTalkCallPattern")
    relevant_cp = [cp for cp in call_patterns if asset_id in cp.get("patternId", "")]
    if relevant_cp:
        print(f"[+] 7. 홈 접속 대사 (HomeTalkCallPattern.json)")
        for cp in relevant_cp:
            char_text = cp.get('characterArrivalText').replace('\n', ' ')
            mgr_text = cp.get('managerCallText').replace('\n', ' ')
            print(f"    - {cp.get('patternId')}")
            print(f"      캐릭터: {char_text}")
            print(f"      매니저: {mgr_text}")
        print()

    # 8. CardEvolutionMessage.json
    evolve_msgs = load_json("CardEvolutionMessage")
    relevant_em = [em for em in evolve_msgs if em.get("cardId") == card_id]
    if relevant_em:
        print(f"[+] 8. 개화(Bloom) 대사 (CardEvolutionMessage.json)")
        for em in relevant_em:
            print(f"    - [Evo {em.get('evolutionLevel')}, Num {em.get('number')}] {em.get('evolveMessage')}")
        print()
    else:
        print(f"[-] 8. 개화(Bloom) 대사: 관련 데이터 없음")
        print()

    # 9. Telephone.json
    telephones = load_json("Telephone")
    relevant_tel = [tel for tel in telephones if asset_id in tel.get("id", "")]
    if relevant_tel:
        print(f"[+] 9. 전화 (Telephone.json)")
        for tel in relevant_tel:
            print(f"    - ID: {tel.get('id')}")
            print(f"      해금 조건: {tel.get('unlockConditionId')}")
        print()
    else:
        print(f"[-] 9. 전화: 관련 데이터 없음")
        print()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python card_tracker.py <assetId>")
        sys.exit(1)
    
    target_id = sys.argv[1]
    track_card(target_id)
