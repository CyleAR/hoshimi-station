import argparse
import sqlite3
import re
from pathlib import Path


def translate_line(kr):
    # --- 1. 가변 조건 및 구조적 정규식 (원문 훼손 전 최우선 처리) ---
    kr = re.sub(r'(.+)状態の段階数が多い程効果上昇', r'\1 상태의 단계 수가 많을수록 효과 상승', kr)
    kr = re.sub(r'楽曲が(.+)の時', r'곡이 \1일 때', kr)
    kr = kr.replace('コンボ数が多い程効果上昇', '콤보 수가 많을수록 효과 상승')
    kr = kr.replace('コンボ数が少ない程効果上昇', '콤보 수가 적을수록 효과 상승')
    kr = kr.replace('スキル成功率が高い程効果上昇', '스킬 성공률이 높을수록 효과 상승')
    kr = kr.replace('強化効果が多い程効果上昇', '강화 효과가 많을수록 효과 상승')
    kr = kr.replace('自身の発動したスキル数が多い程効果上昇', '자신이 발동한 스킬 수가 많을수록 효과 상승')
    kr = kr.replace('コアファン率が多い程効果上昇', '코어 팬 비율이 높을수록 효과 상승')
    kr = kr.replace('ファン数割合が少ない程効果上昇', '팬 수 비율이 적을수록 효과 상승')
    kr = kr.replace('残スタミナが多い程効果上昇', '남은 스태미나가 많을수록 효과 상승')
    kr = kr.replace('残スタミナが少ない程効果上昇', '남은 스태미나가 적을수록 효과 상승')
    kr = kr.replace('このスキルで消費したスタミナが多い程効果上昇', '이 스킬로 소모한 스태미나가 많을수록 효과 상승')
    kr = kr.replace('消費したスタミナが多い程効果上昇', '소모한 스태미나가 많을수록 효과 상승')
    kr = re.sub(r'(.+)の編成数が多い程効果上昇', r'\1의 편성 수가 많을수록 효과 상승', kr)
    
    kr = re.sub(r'スコア獲得倍率が(\d+)%に上昇', r'스코어 획득 배율이 \1%로 상승', kr)
    kr = re.sub(r'(\d+)%の確率で', r'\1%의 확률로 ', kr)
    kr = re.sub(r'(\d+)%のスコア獲得', r'\1%의 스코어 획득', kr)
    kr = re.sub(r'スタミナ(\d+)消費', r'스태미나 \1소비', kr)
    kr = re.sub(r'自身の獲得スコアの(\d+)%のスコア獲得', r'자신의 획득 스코어의 \1% 스코어 획득', kr)
    
    kr = re.sub(r'(\d+)コンボ以下(?:の)?時', r'\1콤보 이하일 때 ', kr)
    kr = re.sub(r'(\d+)コンボ以上(?:の)?時', r'\1콤보 이상일 때 ', kr)
    kr = re.sub(r'(\d+)コンボ到達時', r'\1콤보 도달 시 ', kr)
    kr = re.sub(r'(\d+)コンボ時', r'\1콤보 도달 시 ', kr)
    kr = re.sub(r'(\d+)[%％]以下の', r'\1% 이하인 ', kr)
    kr = re.sub(r'自身が(.+)レーンの時', r'자신이 \1 레인일 때 ', kr)
    kr = re.sub(r'(.+)状態の時', r'\1 상태일 때 ', kr)
    kr = re.sub(r'(.+)レーンの時', r'\1 레인일 때 ', kr)
    kr = re.sub(r'スタミナ(\d+)%以下(?:の)?時', r'스태미나 \1% 이하일 때 ', kr)
    kr = re.sub(r'スタミナ(\d+)%以上(?:の)?時', r'스태미나 \1% 이상일 때 ', kr)
    kr = re.sub(r'自身のスタミナが(\d+)[%％]以下の時', r'자신의 스태미나가 \1% 이하일 때 ', kr)
    kr = re.sub(r'スタミナを(\d+)回復', r'스태미나를 \1 회복', kr)
    kr = re.sub(r'スタミナ(\d+)消費', r'스태미나 \1 소비', kr)
    kr = kr.replace('ライブ中１回のみ', '라이브 중 1회 한정')
    kr = kr.replace('ライブ中1回のみ', '라이브 중 1회 한정')
    kr = re.sub(r'<(.+)タイプのみ>', r'<\1 타입 한정>', kr)
    
    # 다중 대상 지정 (원문이 일본어 상태이므로 일본어 키워드 사용)
    kr = re.sub(r'(.+)タイプ ?(\d+)人に', r'\1タイプ \2명에게 ', kr)
    kr = re.sub(r'(.+)タイプ ?(\d+)人へ', r'\1タイプ \2명에게 ', kr)
    kr = re.sub(r'(.+)タイプ ?(\d+)人の', r'\1タイプ \2명의 ', kr)
    kr = re.sub(r'(.+)レーン ?(\d+)人に', r'\1レーン \2명에게 ', kr)
    kr = re.sub(r'(.+)が高い ?(\d+)人に', r'\1이 높은 \2명에게 ', kr)
    kr = re.sub(r'(.+)が高い ?(\d+)人の', r'\1이 높은 \2명의 ', kr)
    kr = re.sub(r'(.+)が低い ?(\d+)人に', r'\1이 낮은 \2명에게 ', kr)
    kr = re.sub(r'(.+)が低い ?(\d+)人の', r'\1이 낮은 \2명의 ', kr)
    kr = re.sub(r'(ボーカル|ダンス|ビジュアル|スタミナ|スコア)高い ?(\d+)人に', r'\1이 높은 \2명에게 ', kr)
    kr = re.sub(r'(ボーカル|ダンス|ビジュアル|スタミナ|スコア)低い ?(\d+)人に', r'\1이 낮은 \2명에게 ', kr)
    kr = re.sub(r'対象 ?(\d+)人に', r'대상 \1명에게 ', kr)
    kr = re.sub(r'対象 ?(\d+)人の', r'대상 \1명의 ', kr)
    kr = re.sub(r'(\d+)人へ', r'\1명에게 ', kr)
    kr = re.sub(r'(\d+)人に', r'\1명에게 ', kr)
    kr = re.sub(r'(\d+)人の', r'\1명의 ', kr)
    kr = re.sub(r'(\d+)人', r'\1명', kr)
    
    # 효과 단계 지정 (단일/복합)
    kr = re.sub(r'(\d+)段階の?([^[\]]+)\[(\d+)ビート\]', r'\1단계 \2 [\3비트]', kr)
    kr = re.sub(r'(\d+)段階の?([^\[\]\n,、]+)', r'\1단계 \2', kr)
    kr = re.sub(r'対象最大スタミナの(\d+)%の(.+)', r'대상 최대 스태미나의 \1% \2', kr)
    
    # --- 2. 명사 및 고유 명칭 사전 매핑 ---
    terms = {
        # 2-0. 아이돌 이름 및 고유명사 (문자열 치환 충돌 방지를 위해 최우선)
        '小美山愛': '코미야마 아이',
        '川咲さくら': '카와사키 사쿠라',
        '鈴村優': '스즈무라 유우',
        '一ノ瀬怜': '이치노세 레이',
        '佐伯遙子': '사에키 하루코',
        '天動瑠依': '텐도 루이',
        '早坂芽衣': '하야사카 메이',
        '白石千紗': '시라이시 치사',
        '白石沙季': '시라이시 사키',
        '神崎莉央': '칸자키 리오',
        '井川葵': '이가와 아오이',
        '伊吹渚': '이부키 나기사',
        '兵藤雫': '효도 시즈쿠',
        '赤崎こころ': '아카사키 코코로',
        '長瀬琴乃': '나가세 코토노',
        '長瀬麻奈': '나가세 마나',
        '星見プロ': '호시미 프로',
        
        # 콜라보 및 기타 고유명사
        'SOS団': 'SOS단',
        'ツンデレ担当': '츤데레 담당',
        'マスコット第二号': '마스코트 제2호',
        '優等生キャラ': '우등생 캐릭터',
        '霊能力者': '영능력자',
        '監督': '감독',
        '自前': '자체 ',
        
        'いずれかの': '어느 하나의 ',
        'いずれか': '어느 하나',
        
        # 2-1. 복합 구문 및 다중 대상 지정 (가장 먼저 치환되어야 하는 것들)
        '対象最大スタミナに応じた': '대상 최대 스태미나에 비례한 ',
        '対象最大スタミナの': '대상 최대 스태미나의 ',
        '相手のセンターの': '상대 센터의 ',
        '隣接するアイドルの': '인접한 아이돌의 ',
        '隣接するアイドルに': '인접한 아이돌에게 ',
        '同じレーンの相手に': '같은 레인의 상대에게 ',
        '同じレーンの': '같은 레인의 ',
        
        'センターに': '센터에게 ',
        'センターへ': '센터에게 ',
        '相手全員に': '상대 전원에게 ',
        '相手全員の': '상대 전원의 ',
        '相手全員': '상대 전원',
        '全員に': ' 전원에게 ',
        '全員の': ' 전원의 ',
        '自身に': '자신에게 ',
        '自身の': '자신의 ',
        '自身が': '자신이 ',
        '相手の': '상대의 ',
        '相手': '상대',
        '自身': '자신',
        '対象に': '대상에게 ',
        '対象の': '대상의 ',
        '誰かが': '누군가 ',
        '誰かの': '누군가의 ',
        
        'ライブバトルのみ': '라이브 배틀 한정',
        'パッシブスキル発動時': '패시브 스킬 발동 시',
        'パッシブスキル発動前': '패시브 스킬 발동 전',
        'パッシブスキル発動': '패시브 스킬 발동',
        'スキル発動前': '스킬 발동 전',
        'クリティカル発動時': '크리티컬 발동 시',
        '発動時': '발동 시',
        'ライブボーナス': '라이브 보너스',
        
        'ライブ中1回のみ': '라이브 중 1회만',
        'ライブ中2回のみ': '라이브 중 2회만',
        '(1回のみ)': '(1회만)',
        '(2回のみ)': '(2회만)',
        '(1回)': '(1회)',
        
        # 2-2. 특수 스킬 용어
        'ぱじゃパ！メンバー': '파자파! 멤버',
        'ぱじゃパ!メンバー': '파자파! 멤버',
        'リーダーメンバー': '리더 멤버',
        'フォト品質': '포토 품질',
        '隣接アイドル': '인접 아이돌',
        'アクセサリパラメータ': '액세서리 파라미터',
        'アイドルパラメータ': '아이돌 파라미터',
        'クリティカル発生': '크리티컬 발생',
        'クリティカルスコア': '크리티컬 스코어',
        'クリティカルアップ': '크리티컬 UP',
        'クリティカル係数アップ': '크리티컬 계수 UP',
        'クリティカル係数上昇': '크리티컬 계수 상승',
        'クリティカル係数': '크리티컬 계수',
        'クリティカル': '크리티컬',
        'パッシブスキル': '패시브 스킬',
        'アピールスキル': '어필 스킬',
        'アピールスコア': '어필 스코어',
        'スキル成功率': '스킬 성공률',
        'スキル成功': '스킬 성공',
        '発動前': '발동 전',
        '発動時': '발동 시',
        '発動': '발동',
        '成功率': '성공률',
        'メンタル': '멘탈',
        '右端': '오른쪽 끝',
        '左端': '왼쪽 끝',
        '隣接するアイドル': '인접한 아이돌',
        '低いキャラ': '낮은 캐릭터',
        '高いキャラ': '높은 캐릭터',
        '確率で': '확률로',
        '場合': '경우',
        '与える': '부여하는 ',
        '受けた時': '받았을 때',
        '受ける': '받는 ',
        '付与する': '부여하는 ',
        '割合で': '비율로',
        '固定値で': '고정치로',
        'に対して': '에 대해 ',
        'ダウン': 'DOWN',
        'スコアラータイプ': '스코어러 타입',
        'サポータータイプ': '서포터 타입',
        'バッファータイプ': '버퍼 타입',
        'ボーカルタイプ': '보컬 타입',
        'ダンスタイプ': '댄스 타입',
        'ビジュアルタイプ': '비주얼 타입',
        'アピールタイプ': '어필 타입',
        'アクティブタイプ': '액티브 타입',
        
        'クリティカル率アップ': '크리티컬 확률 UP',
        'クリティカル係数上昇': '크리티컬 계수 상승',
        'クリティカル率': '크리티컬 확률',
        'テンションUP効果': '텐션 UP 효과',
        'テンションUP': '텐션 UP',
        'スタミナ継続回復効果': '스태미나 지속 회복 효과',
        'スタミナ継続消費効果': '스태미나 지속 소비 효과',
        'スタミナ消費量': '스태미나 소비량',
        'スタミナ回復効果': '스태미나 회복 효과',
        '消費スタミナ低下効果': '소비 스태미나 감소 효과',
        'スタミナ消費増加効果': '스태미나 소비 증가 효과',
        'コンボ継続効果': '콤보 지속 효과',
        
        'アピールスキルスコア': '어필 스킬 스코어',
        'パッシブスキルスコア': '패시브 스킬 스코어',
        'SPスキルスコア追加効果': 'SP스킬 스코어 추가 효과',
        'Aスキルスコア追加効果': 'A스킬 스코어 추가 효과',
        'Pスキルスコア追加効果': 'P스킬 스코어 추가 효과',
        'スキルスコア追加効果': '스킬 스코어 추가 효과',
        'Aスキルスコア上昇効果': 'A스킬 스코어 상승 효과',
        'ビートスコア上昇効果': '비트 스코어 상승 효과',
        '対象獲得スコア': '대상 획득 스코어',
        '割合スコア獲得': '비율 스코어 획득',
        '獲得スコア': '획득 스코어',
        '割合スコア': '비율 스코어',
        'コンボスコア': '콤보 스코어',
        'スキルスコア': '스킬 스코어',
        'ビートスコア': '비트 스코어',
        'ビートのスコア': '비트 스코어',
        'Aスキルのスコア': 'A스킬 스코어',
        'Pスキルのスコア': 'P스킬 스코어',
        'SPスキルのスコア': 'SP스킬 스코어',
        'スキルのスコア': '스킬 스코어',
        'コンボのスコア': '콤보 스코어',
        
        '集目効果': ' 주목 효과',
        'ステルス効果': ' 스텔스 효과',
        'カバー効果': ' 커버 효과',
        'ブースト効果': ' 부스트 효과',
        '上限解放効果': ' 상한 해제 효과',
        '超化効果': ' 초화 효과',
        '強化効果譲渡': ' 강화 효과 양도',
        '強化効果増強': ' 강화 효과 증강',
        '強化効果回数増加': ' 강화 효과 횟수 증가',
        '強化効果': ' 강화 효과',
        '不調効果': ' 부조 효과',
        
        # 2-3. 단일 명사 및 기호
        'スコアラー': '스코어러',
        'サポーター': '서포터',
        'バッファー': '버퍼',
        
        'スタミナ回復': '스태미나 회복',
        '集目': ' 주목',
        'ステルス': ' 스텔스',
        'カバー': ' 커버',
        'ブースト': ' 부스트',
        '上限解放': ' 상한 해제',
        '超化': ' 초화',
        '段階増強': ' 단계 증강',
        '増強': ' 증강',
        '不調': ' 부조',
        
        'ボーカルレーン': '보컬 레인',
        'ダンスレーン': '댄스 레인',
        'ビジュアルレーン': '비주얼 레인',
        'ボーカルタイプ': '보컬 타입',
        'ダンスタイプ': '댄스 타입',
        'ビジュアルタイプ': '비주얼 타입',
        'スコアラータイプ': '스코어러 타입',
        'バッファータイプ': '버퍼 타입',
        'サポータータイプ': '서포터 타입',
        
        'ボーカル': '보컬',
        'ダンス': '댄스',
        'ビジュアル': '비주얼',
        'スタミナ': '스태미나',
        'スコア獲得': '스코어 획득',
        'スコアアップ': '스코어 UP',
        'スコア': '스코어',
        'コンボ': '콤보',
        'ビート': '비트',
        'Aスキル': 'A스킬',
        'Pスキル': 'P스킬',
        'SPスキル': 'SP스킬',
        'スキル成功率': '스킬 성공률',
        'スキル': '스킬',
        'コアファン率': '코어 팬 비율',
        
        '【※手動入力※】': '【※수동 입력※】',
        'サニーピースメンバー': '서니 피스 멤버',
        '月のテンペストメンバー': '달의 템페스트 멤버',
        'TRINITYAiLEメンバー': 'TRINITYAiLE 멤버',
        'LizNoirメンバー': 'LizNoir 멤버',
        '星見プロダクションメンバー': '호시미 프로덕션 멤버',
        'ⅢXメンバー': 'ⅢX 멤버',
        
        '対象最大スタミナに応じた': '대상 최대 스태미나에 비례한 ',
        '対象最大スタミナの': '대상 최대 스태미나의 ',
        '対象者': '대상자',
        'に応じた': '에 비례한 ',
        '獲得': '획득',
        '回数増加': '횟수 증가',
        'レーン': '레인',
        'ファン数割合': '팬 수 비율',
        'センター': '센터',
        
        '回復': ' 회복',
        '減少': ' 감소',
        '低減': ' 감소',
        '延長': ' 연장',
        '短縮': ' 단축',
        '消費': ' 소비',
        '消費量': '소비량',
        '消去': ' 제거',
        'リセット': ' 초기화',
        '反転': ' 반전',
        '小': '소',
        '編成数': '편성 수',
        'このスキルで': '이 스킬로 ',
        
        '増加': ' 증가',
        '封印': ' 봉인',
        '無敵': '무적',
        '甘くない': '만만하지 않아',
        '段階数': '단계 수',
        '制限': ' 제한',
        
        '更に': '추가로 ',
        '奥山すみれ': '오쿠야마 스미레',
        '成宮すず': '나루미야 스즈',
        'します': '합니다',
        '確率10%': '확률 10%',
    }
    for jp, ko in sorted(terms.items(), key=lambda item: len(item[0]), reverse=True):
        kr = kr.replace(jp, ko)
    
    terms2 = {
        '対象に': '대상에게 ',
        '対象の': '대상의 ',
        '隣接するアイドルの': '인접한 아이돌의 ',
        '隣接するアイドルに': '인접한 아이돌에게 ',
        '同じレーンの相手に': '같은 레인의 상대에게 ',
        '移動': '이동',
        '前': ' 전',
        '回': '회',
        '状態変化': '상태 변화',
        'お茶会': '다과회',
        '！': '!',
        'センターへ': '센터에게 ',
        'へ': '에게 ',
        
        'を回復': '를 회복',
        'を減少': '를 감소',
        'そのまま譲渡': '그대로 양도',
        '譲渡': '양도',
        '防止': '방지',
        '反射': '반사',
        '延長': '연장',
        'ライブアビリティ': '라이브 어빌리티',
        '固定値': '고정치',
        'クリティカル発動時': '크리티컬 발동 시 ',
        
        # 잔여 누락 키워드 완벽 방어
        '付与する': '부여하는 ',
        '受ける': '받는 ',
        '割合で': '퍼센트로 ',
        '固定値で': '고정치로 ',
        '割合': '비율',
        '倍率': '배율',
        '最大': '최대',
        '対象': '대상',
        'チャンス': '찬스',
        'アップ': ' UP',
        '味方': '아군 ',
        'としての覚悟': '로서의 각오',
        '編成時のみ': '편성 시에만',
        '編成時': '편성 시',
        '中': '중',
        '特大': '특대',
        '微': '미',
        '大': '대',
        '状態時': '상태 시',
        '状態': '상태',
        '時': '시',
        'が': '가 ',
        '毎に': '마다 ',
        '以上': ' 이상 ',
        'プレイ': '플레이 ',
        'カット': '감소 ',
        '全体に': '전체에게 ',
        '全体': '전체',
    }
    for jp, ko in sorted(terms2.items(), key=lambda item: len(item[0]), reverse=True):
        kr = kr.replace(jp, ko)
    
    # 3. 조사, 후처리 및 UP/DOWN 텍스트 매핑
    if 'アップ効果' in kr:
        kr = kr.replace('上昇効果', 'UP 효과').replace('アップ効果', 'UP 효과')
    elif 'ダウン効果' in kr:
        kr = kr.replace('低下効果', 'DOWN 효과').replace('ダウン効果', 'DOWN 효과')
        
    kr = kr.replace('上昇効果', ' 상승 효과')
    kr = kr.replace('低下効果', ' 저하 효과')
    kr = kr.replace('上昇', ' 상승')
    kr = kr.replace('低下', ' 저하')
    kr = kr.replace('効果', ' 효과')
    
    kr = kr.replace('を', '를 ')
    kr = kr.replace('と', ' 및 ')
    kr = kr.replace('の', '의 ')
    
    kr = kr.replace('0를 1に', '0을 1로 ')
    kr = re.sub(r'(\d+)に', r'\1로 ', kr)
    kr = kr.replace('に', '에 ')
    
    kr = kr.replace('、', ', ')
    kr = re.sub(r'[ \t]+', ' ', kr)
    kr = kr.replace(' ,', ',')
    kr = re.sub(r'\s+/', ' /', kr)
    kr = re.sub(r'/\s+', '/ ', kr)
    kr = re.sub(r'([가-힣])([0-9]+(?:\.[0-9]+)?%)', r'\1 \2', kr)
    kr = re.sub(r'([가-힣A-Za-z])([0-9]+)명', r'\1 \2명', kr)
    kr = re.sub(r'([가-힣])([A-Z]+):', r'\1 \2:', kr)
    kr = re.sub(r'([가-힣])([A-Z]+)', r'\1 \2', kr)
    kr = re.sub(r'([0-9]+)소비', r'\1 소비', kr)
    kr = kr.replace('상승상한', '상승 상한')
    kr = kr.replace('상승상태', '상승 상태')
    kr = kr.replace('저하상태', '저하 상태')
    kr = kr.replace('UP상태', 'UP 상태')
    kr = kr.replace('DOWN상태', 'DOWN 상태')
    kr = kr.replace('UP시', 'UP 시')
    kr = kr.replace('DOWN시', 'DOWN 시')
    kr = kr.replace('효과시', '효과 시')
    kr = kr.replace('발생시', '발생 시')
    kr = kr.replace('확률로스태미나', '확률로 스태미나')
    kr = kr.replace('에 대해비율로', '에 대해 비율로')
    kr = kr.replace('상승 효과[', '상승 효과 [')
    kr = kr.replace('UP 효과[', 'UP 효과 [')
    kr = kr.replace('초화 효과[', '초화 효과 [')
    kr = kr.replace('증강 효과[', '증강 효과 [')
    kr = re.sub(r'\s{2,}', ' ', kr)
    
    return kr.strip()

# 일본어가 남아있는지 확인하기 위한 정규식
jp_pattern = re.compile(r'[ぁ-んァ-ン一-龥]+')

def auto_translate_text(jp_text):
    if not jp_text:
        return ""
    jp_lines = [l.strip() for l in jp_text.replace('\r', '').split('\n')]
    kr_lines = [translate_line(l) if l else "" for l in jp_lines]
    return '\n'.join(kr_lines)


def one_line(text):
    return str(text or "").replace("\n", " / ")


def write_report(path, mode, updates, blocked, limit):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Skill Auto Translation Report",
        "",
        f"- mode: `{mode}`",
        f"- updates: `{len(updates)}`",
        f"- blocked: `{len(blocked)}`",
        "",
        "## Update Preview",
        "",
    ]
    if updates:
        for new_kr, unit_id, jp, old_kr in updates[: max(limit, 0)]:
            lines.extend(
                [
                    f"### {unit_id}",
                    "",
                    f"- JP: {one_line(jp)}",
                    f"- OLD: {one_line(old_kr)}",
                    f"- NEW: {one_line(new_kr)}",
                    "",
                ]
            )
        if len(updates) > limit:
            lines.append(f"... {len(updates) - limit} more updates")
            lines.append("")
    else:
        lines.extend(["No updates.", ""])

    lines.extend(["## Blocked Preview", ""])
    if blocked:
        for unit_id, jp, old_kr, new_kr in blocked[: max(limit, 0)]:
            lines.extend(
                [
                    f"### {unit_id}",
                    "",
                    f"- JP: {one_line(jp)}",
                    f"- OLD: {one_line(old_kr)}",
                    f"- NEW: {one_line(new_kr)}",
                    "",
                ]
            )
        if len(blocked) > limit:
            lines.append(f"... {len(blocked) - limit} more blocked rows")
            lines.append("")
    else:
        lines.extend(["No blocked rows.", ""])

    path.write_text("\n".join(lines), encoding="utf-8")


def main():
    import argparse
    import sqlite3
    from pathlib import Path
    
    parser = argparse.ArgumentParser(description="Auto-translate skills in translation_units")
    parser.add_argument("--db", type=str, required=True, help="Path to sqlite3 database")
    parser.add_argument("--mode", type=str, choices=["missing", "all"], default="missing", help="Translate missing/mismatched rows only, or re-translate all rows")
    parser.add_argument("--apply", action="store_true", help="Actually update the database. Without this, only prints a preview.")
    parser.add_argument("--limit", type=int, default=20, help="Maximum number of preview rows to print.")
    parser.add_argument("--report", type=str, default="", help="Write a markdown preview report to this path.")
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"Database not found: {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    files = ('Skill.json', 'SkillEfficacy.json', 'LiveAbility.json', 'PhotoAbility.json')
    query = f"SELECT unit_id, original_text, translation_text FROM translation_units WHERE source_file IN ({','.join(['?']*len(files))}) AND (field_path = 'description' OR field_path = 'shortDescription' OR field_path LIKE 'levels[%].description' OR field_path LIKE 'levels[%].shortDescription' OR (source_file = 'SkillEfficacy.json' AND field_path = 'name'))"
    cur.execute(query, files)
    rows = cur.fetchall()

    updates = []
    blocked = []
    
    for row in rows:
        unit_id, jp, kr = row
        jp_lines = [l.strip() for l in jp.strip().split('\n') if l.strip()]
        kr_lines = [l.strip() for l in (kr or "").strip().split('\n') if l.strip()]
        
        needs_translation = False
        if args.mode == "all":
            needs_translation = True
        elif len(jp_lines) != len(kr_lines):
            needs_translation = True
            
        if needs_translation:
            new_kr = auto_translate_text(jp)
            # 일본어가 완전히 번역된(남아있지 않은) 경우에만 업데이트하여
            # 고유명사나 스킬명이 어색하게 반쪽짜리로 번역되는 것을 방지합니다.
            if new_kr != kr and not jp_pattern.search(new_kr):
                updates.append((new_kr, unit_id, jp, kr or ""))
            elif jp_pattern.search(new_kr):
                blocked.append((unit_id, jp, kr or "", new_kr))

    print(f"Found {len(updates)} records to auto-translate (mode: {args.mode}).")
    print(f"Blocked {len(blocked)} records because Japanese text remains after conversion.")

    if updates:
        print()
        print("Preview:")
        for new_kr, unit_id, jp, old_kr in updates[: max(args.limit, 0)]:
            print(f"- {unit_id}")
            print(f"  JP : {one_line(jp)}")
            print(f"  OLD: {one_line(old_kr)}")
            print(f"  NEW: {one_line(new_kr)}")
        if len(updates) > args.limit:
            print(f"  ... {len(updates) - args.limit} more")

    if blocked and not updates:
        print()
        print("Blocked sample:")
        for unit_id, jp, old_kr, new_kr in blocked[: max(args.limit, 0)]:
            print(f"- {unit_id}")
            print(f"  JP : {one_line(jp)}")
            print(f"  OLD: {one_line(old_kr)}")
            print(f"  NEW: {one_line(new_kr)}")

    if args.report:
        write_report(args.report, args.mode, updates, blocked, args.limit)
        print(f"Report written: {args.report}")

    if updates and args.apply:
        cur.executemany(
            "UPDATE translation_units SET translation_text = ?, status = 'translated', updated_at = datetime('now') WHERE unit_id = ?",
            [(new_kr, unit_id) for new_kr, unit_id, _jp, _old_kr in updates],
        )
        conn.commit()
        print("Database updated successfully.")
    elif updates:
        print("Dry run only. Re-run with --apply to update the database.")
    else:
        print("No updates needed.")

    conn.close()

if __name__ == '__main__':
    main()
