import fs from 'fs';
import path from 'path';

// Path to the ipr-translate-manager data
const DATA_ROOT = path.resolve(process.cwd(), '..');
const MASTERDB_PATH = path.join(DATA_ROOT, 'res', 'masterdb');
const ADV_PATH = path.join(DATA_ROOT, 'res', 'adv', 'resource');

let jsonCache = {};

export function loadJson(filename) {
  if (jsonCache[filename]) return jsonCache[filename];
  const filePath = path.join(MASTERDB_PATH, `${filename}.json`);
  console.log(`[HoshimiStation] Loading JSON: ${filePath}`);
  if (!fs.existsSync(filePath)) {
    console.error(`[HoshimiStation] File NOT found: ${filePath}`);
    return null;
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  jsonCache[filename] = data;
  return data;
}

export function clearCache() {
  jsonCache = {};
}

export function getAllCards() {
  const cards = loadJson('Card');
  if (!cards) return [];
  return cards.map(c => ({
    id: c.id,
    assetId: c.assetId,
    name: c.name,
    description: c.description || '',
    characterId: c.characterId,
    initialRarity: c.initialRarity,
    type: c.type,
    obtainMessage: c.obtainMessage || '',
    releaseDate: c.releaseDate,
    skillIds: [c.skillId1, c.skillId2, c.skillId3, c.skillId4].filter(Boolean),
    rewardCostumeId: c.rewardCostumeId || '',
    stories: c.stories || [],
    messages: c.messages || [],
    homeTalks: c.homeTalks || [],
  }));
}

export function getCardDependencies(assetId) {
  const cards = loadJson('Card');
  const card = cards?.find(c => c.assetId === assetId);
  if (!card) return null;

  const cardId = card.id;
  const result = {
    card: {
      id: card.id,
      assetId: card.assetId,
      name: card.name,
      description: card.description || '',
      obtainMessage: card.obtainMessage || '',
      characterId: card.characterId,
      initialRarity: card.initialRarity,
      rewardCostumeId: card.rewardCostumeId || '',
    },
    costume: null,
    skills: [],
    stories: [],
    messages: [],
    homeTalks: [],
    callPatterns: [],
    evolutionMessages: [],
    telephones: [],
  };

  // Costume
  if (card.rewardCostumeId) {
    const costumes = loadJson('Costume');
    const cos = costumes?.find(c => c.id === card.rewardCostumeId);
    if (cos) {
      result.costume = { id: cos.id, name: cos.name };
    }
  }

  // Skills
  const skillIds = [card.skillId1, card.skillId2, card.skillId3, card.skillId4].filter(Boolean);
  if (skillIds.length > 0) {
    const skills = loadJson('Skill');
    for (const sid of skillIds) {
      const sk = skills?.find(s => s.id === sid);
      if (sk) {
        result.skills.push({
          id: sk.id,
          name: sk.name,
          levels: (sk.levels || []).map(l => ({
            level: l.level,
            description: l.description || '',
            shortDescription: l.shortDescription || '',
          })),
        });
      }
    }
  }

  // Stories + ADV
  const storyRefs = card.stories || [];
  if (storyRefs.length > 0) {
    const stories = loadJson('Story');
    for (const ref of storyRefs) {
      const st = stories?.find(s => s.id === ref.storyId);
      if (st) {
        const advFiles = (st.advAssetIds || []).map(aid => {
          const filename = `adv_${aid}.txt`;
          const fullPath = path.join(ADV_PATH, filename);
          return {
            assetId: aid,
            filename,
            exists: fs.existsSync(fullPath),
          };
        });
        result.stories.push({
          id: st.id,
          name: st.name,
          description: st.description || '',
          advFiles,
        });
      }
    }
  }

  // Messages
  const msgGroupId = `message-card-${assetId}`;
  const messages = loadJson('Message');
  const msgEntries = messages?.filter(m => m.id === msgGroupId) || [];
  for (const group of msgEntries) {
    result.messages.push({
      id: group.id,
      name: group.name || '',
      details: (group.details || []).map(d => ({
        messageDetailId: d.messageDetailId,
        text: d.text || '',
        choiceText: d.choiceText || '',
      })),
    });
  }

  // HomeTalk
  const homeTalks = loadJson('HomeTalk');
  const relevantHt = homeTalks?.filter(ht =>
    (ht.homeTalkId && ht.homeTalkId.includes(assetId)) ||
    ht.cardId === cardId
  ) || [];
  for (const ht of relevantHt) {
    result.homeTalks.push({
      id: ht.homeTalkId,
      title: ht.title || '',
      choiceText: ht.choiceText || '',
      managerText: ht.managerText || '',
      displayConditionDescription: ht.displayConditionDescription || '',
      characterTalks: (ht.characterTalks || []).map(ct => ({
        text: ct.text || '',
        voiceAssetId: ct.voiceAssetId || '',
      })),
    });
  }

  // HomeTalkCallPattern
  const callPatterns = loadJson('HomeTalkCallPattern');
  const relevantCp = callPatterns?.filter(cp =>
    cp.patternId && cp.patternId.includes(assetId)
  ) || [];
  for (const cp of relevantCp) {
    result.callPatterns.push({
      patternId: cp.patternId,
      characterId: cp.characterId,
      characterArrivalText: cp.characterArrivalText || '',
      managerCallText: cp.managerCallText || '',
    });
  }

  // CardEvolutionMessage
  const evolveMessages = loadJson('CardEvolutionMessage');
  const relevantEm = evolveMessages?.filter(em => em.cardId === cardId) || [];
  for (const em of relevantEm) {
    result.evolutionMessages.push({
      cardId: em.cardId,
      evolutionLevel: em.evolutionLevel,
      number: em.number,
      evolveMessage: em.evolveMessage || '',
      characterId: em.characterId || '',
    });
  }

  // Telephone
  const telephones = loadJson('Telephone');
  const relevantTel = telephones?.filter(tel => tel.id && tel.id.includes(assetId)) || [];
  for (const tel of relevantTel) {
    result.telephones.push({
      id: tel.id,
      name: tel.name || '',
      unlockConditionId: tel.unlockConditionId || '',
    });
  }

  return result;
}

// Get character display info
const CHARACTER_NAMES = {
  'char-ai': { name: '小美山 愛', nameKr: '코미야마 아이', short: 'AI' },
  'char-ktn': { name: '長瀬 琴乃', nameKr: '나가세 코토노', short: 'KTN' },
  'char-ngs': { name: '長瀬 麻奈', nameKr: '나가세 마나', short: 'NGS' },
  'char-ski': { name: '伊吹 渚', nameKr: '이부키 나기사', short: 'SKI' },
  'char-szk': { name: '佐伯 遙子', nameKr: '사에키 하루코', short: 'SZK' },
  'char-chs': { name: '白石 千紗', nameKr: '시라이시 치사', short: 'CHS' },
  'char-mei': { name: '兵藤 雫', nameKr: '효도 시즈쿠', short: 'MEI' },
  'char-suz': { name: '早坂 芽衣', nameKr: '하야사카 메이', short: 'SUZ' },
  'char-hrk': { name: '天動 瑠依', nameKr: '텐도 루이', short: 'HRK' },
  'char-rei': { name: '奥山 すみれ', nameKr: '오쿠야마 스미레', short: 'REI' },
  'char-rui': { name: '川咲 さくら', nameKr: '카와사키 사쿠라', short: 'RUI' },
  'char-kkr': { name: '兵藤 雫', nameKr: '효도 시즈쿠', short: 'KKR' },
  'char-aoi': { name: '一ノ瀬 怜', nameKr: '이치노세 레이', short: 'AOI' },
  'char-yu': { name: '神崎 莉央', nameKr: '칸자키 리오', short: 'YU' },
  'char-mna': { name: '長瀬 麻奈', nameKr: '나가세 마나', short: 'MNA' },
};

export function getCharacterName(charId) {
  return CHARACTER_NAMES[charId] || { name: charId, nameKr: charId, short: charId };
}

export function getCharacterList() {
  const cards = loadJson('Card');
  if (!cards) return [];
  const charIds = [...new Set(cards.map(c => c.characterId))];
  return charIds.map(id => ({
    id,
    ...getCharacterName(id),
  }));
}

// ==========================================
// Event Story Tracking
// ==========================================
export function getAllEvents() {
  const events = loadJson('EventStory');
  if (!events) return [];
  
  return events.map(e => ({
    id: e.id,
    assetId: e.assetId,
    name: e.description || e.name || e.id, // Usually description has the actual event title
    meta: e.name,
    type: 'event'
  })).sort((a, b) => b.id.localeCompare(a.id)); // Reverse alphabetical to put newer events first
}

export function getEventWithDependencies(id) {
  const events = loadJson('EventStory');
  if (!events) return null;
  
  const event = events.find(e => e.id === id);
  if (!event) return null;
  
  const dependencies = {
    info: [],
    adv: []
  };
  
  // 1. Event Info
  dependencies.info.push({
    id: `event_name_${event.id}`,
    original: event.name,
    current: '',
    type: 'Event Name'
  });
  if (event.description) {
    dependencies.info.push({
      id: `event_desc_${event.id}`,
      original: event.description,
      current: '',
      type: 'Event Description'
    });
  }
  
  // 2. ADV Episodes
  const storyDb = loadJson('Story') || [];
  if (event.episodes && Array.isArray(event.episodes)) {
    event.episodes.forEach(ep => {
      // Find the episode info in Story.json
      if (ep.storyId) {
        const epStory = storyDb.find(s => s.id === ep.storyId);
        if (epStory) {
          dependencies.info.push({
            id: `story_name_${ep.storyId}`,
            original: epStory.name,
            current: '',
            type: `Ep ${ep.episode} Title`
          });
          if (epStory.description) {
            dependencies.info.push({
              id: `story_desc_${ep.storyId}`,
              original: epStory.description,
              current: '',
              type: `Ep ${ep.episode} Desc`
            });
          }
        }
      }
      
      if (ep.assetId) {
        const fileName = `adv_${ep.assetId}.txt`;
        const fullPath = path.join(ADV_PATH, fileName);
        dependencies.adv.push({
          id: `adv_event_${ep.assetId}`,
          fileName,
          type: `Episode ${ep.episode}`,
          exists: fs.existsSync(fullPath)
        });
      }
    });
  }
  
  return {
    id: event.id,
    assetId: event.assetId,
    name: event.description || event.name,
    dependencies
  };
}

// ==========================================
// Main/Group Story Tracking (StoryPart.json)
// ==========================================
export function getAllStoryParts() {
  const parts = loadJson('StoryPart');
  if (!parts) return [];
  
  return parts.map(p => ({
    id: p.id,
    assetId: p.assetId,
    name: p.name,
    meta: `Type: ${p.type}`,
    type: 'storyPart'
  }));
}

export function getStoryPartWithDependencies(id) {
  const parts = loadJson('StoryPart');
  if (!parts) return null;
  
  const part = parts.find(p => p.id === id);
  if (!part) return null;
  
  const dependencies = {
    info: [],
    adv: []
  };
  
  // 1. Story Part Info
  dependencies.info.push({
    id: `storypart_name_${part.id}`,
    original: part.name,
    current: '',
    type: 'Story Name'
  });
  if (part.subTitle) {
    dependencies.info.push({
      id: `storypart_subtitle_${part.id}`,
      original: part.subTitle,
      current: '',
      type: 'Subtitle'
    });
  }
  
  // 2. Chapters and Episodes
  const storyDb = loadJson('Story') || [];
  if (part.chapters && Array.isArray(part.chapters)) {
    part.chapters.forEach(ch => {
      dependencies.info.push({
        id: `storypart_chapter_${part.id}_${ch.chapter}`,
        original: ch.name,
        current: '',
        type: `Chapter ${ch.chapter} Name`
      });
      
      if (ch.episodes && Array.isArray(ch.episodes)) {
        ch.episodes.forEach(ep => {
          // Find the episode info in Story.json
          if (ep.storyId) {
            const epStory = storyDb.find(s => s.id === ep.storyId);
            if (epStory) {
              dependencies.info.push({
                id: `story_name_${ep.storyId}`,
                original: epStory.name,
                current: '',
                type: `Ch ${ch.chapter} Ep ${ep.episode} Title`
              });
              if (epStory.description) {
                dependencies.info.push({
                  id: `story_desc_${ep.storyId}`,
                  original: epStory.description,
                  current: '',
                  type: `Ch ${ch.chapter} Ep ${ep.episode} Desc`
                });
              }
            }
          }

          if (ep.assetId) {
            const fileName = `adv_${ep.assetId}.txt`;
            const fullPath = path.join(ADV_PATH, fileName);
            dependencies.adv.push({
              id: `adv_${ep.assetId}`,
              fileName,
              type: `Ch ${ch.chapter} Ep ${ep.episode}`,
              exists: fs.existsSync(fullPath)
            });
          }
        });
      }
    });
  }
  
  return {
    id: part.id,
    assetId: part.assetId,
    name: part.name,
    dependencies
  };
}

// ==========================================
// Extras (Love, Extra, Birthday etc) Tracking
// ==========================================
export function getAllExtras() {
  const list = [];
  
  // 1. Love Stories
  const love = loadJson('LoveStoryEpisode') || [];
  const groupedLove = {};
  love.forEach(l => {
    if (!groupedLove[l.loveId]) groupedLove[l.loveId] = [];
    groupedLove[l.loveId].push(l);
  });
  
  for (const [loveId, episodes] of Object.entries(groupedLove)) {
    list.push({
      id: loveId,
      assetId: loveId,
      name: `러브 스토리 (${loveId})`,
      meta: `Episodes: ${episodes.length}`,
      type: 'love'
    });
  }

  // 2. Extra Stories
  const extra = loadJson('ExtraStory') || [];
  extra.forEach(ex => {
    list.push({
      id: ex.id,
      assetId: ex.assetId,
      name: ex.name,
      meta: 'Extra Story',
      type: 'extra'
    });
  });
  
  return list;
}

export function getExtraWithDependencies(id) {
  const dependencies = { info: [], adv: [] };
  const storyDb = loadJson('Story') || [];
  
  // Try finding in LoveStoryEpisode
  const loveDb = loadJson('LoveStoryEpisode') || [];
  const loveEpisodes = loveDb.filter(l => l.loveId === id);
  if (loveEpisodes.length > 0) {
    loveEpisodes.forEach(ep => {
      if (ep.storyId) {
        const epStory = storyDb.find(s => s.id === ep.storyId);
        if (epStory) {
          dependencies.info.push({
            id: `story_name_${ep.storyId}`,
            original: epStory.name,
            current: '',
            type: `Ep ${ep.episode} Title`
          });
          if (epStory.description) {
            dependencies.info.push({
              id: `story_desc_${ep.storyId}`,
              original: epStory.description,
              current: '',
              type: `Ep ${ep.episode} Desc`
            });
          }
        }
      }
      if (ep.assetId) {
        const fileName = `adv_${ep.assetId}.txt`;
        const fullPath = path.join(ADV_PATH, fileName);
        dependencies.adv.push({
          id: `adv_${ep.assetId}`,
          fileName,
          type: `Episode ${ep.episode}`,
          exists: fs.existsSync(fullPath)
        });
      }
    });
    return { id, assetId: id, name: `러브 스토리 (${id})`, dependencies };
  }

  // Try finding in ExtraStory
  const extraDb = loadJson('ExtraStory') || [];
  const extra = extraDb.find(ex => ex.id === id);
  if (extra) {
    dependencies.info.push({
      id: `extrastory_name_${extra.id}`,
      original: extra.name,
      current: '',
      type: 'Extra Name'
    });
    if (extra.description) {
      dependencies.info.push({
        id: `extrastory_desc_${extra.id}`,
        original: extra.description,
        current: '',
        type: 'Extra Desc'
      });
    }

    if (extra.episodes && Array.isArray(extra.episodes)) {
      extra.episodes.forEach(ep => {
        if (ep.storyId) {
          const epStory = storyDb.find(s => s.id === ep.storyId);
          if (epStory) {
            dependencies.info.push({
              id: `story_name_${ep.storyId}`,
              original: epStory.name,
              current: '',
              type: `Ep ${ep.episode} Title`
            });
            if (epStory.description) {
              dependencies.info.push({
                id: `story_desc_${ep.storyId}`,
                original: epStory.description,
                current: '',
                type: `Ep ${ep.episode} Desc`
              });
            }
          }
        }
        if (ep.assetId) {
          const fileName = `adv_${ep.assetId}.txt`;
          const fullPath = path.join(ADV_PATH, fileName);
          dependencies.adv.push({
            id: `adv_${ep.assetId}`,
            fileName,
            type: `Episode ${ep.episode}`,
            exists: fs.existsSync(fullPath)
          });
        }
      });
    }
    return { id, assetId: extra.assetId, name: extra.name, dependencies };
  }
  
  return null;
}

// ==========================================
// Character Tracking
// ==========================================
export function getAllCharactersList() {
  const characters = loadJson('Character') || [];
  return characters.map(c => ({
    id: c.id,
    assetId: c.assetId,
    name: c.name,
    meta: c.cv || 'CV Unknown',
    type: 'character'
  }));
}

export function getCharacterWithDependencies(id) {
  const characters = loadJson('Character') || [];
  const char = characters.find(c => c.id === id);
  if (!char) return null;

  const dependencies = { info: [], adv: [] };
  
  dependencies.info.push({
    id: `char_name_${char.id}`,
    original: char.name,
    current: '',
    type: 'Character Name'
  });
  
  if (char.cv) {
    dependencies.info.push({
      id: `char_cv_${char.id}`,
      original: char.cv,
      current: '',
      type: 'CV'
    });
  }
  if (char.favorite) {
    dependencies.info.push({
      id: `char_fav_${char.id}`,
      original: char.favorite,
      current: '',
      type: 'Favorite'
    });
  }
  if (char.unfavorite) {
    dependencies.info.push({
      id: `char_unfav_${char.id}`,
      original: char.unfavorite,
      current: '',
      type: 'Unfavorite'
    });
  }
  if (char.profile) {
    dependencies.info.push({
      id: `char_profile_${char.id}`,
      original: char.profile,
      current: '',
      type: 'Profile'
    });
  }

  return {
    id: char.id,
    assetId: char.assetId,
    name: char.name,
    dependencies
  };
}

// ==========================================
// Generic (Messages, HomeTalks, etc.)
// ==========================================
export function getAllGenericList() {
  const list = [];
  
  const messages = loadJson('Message') || [];
  const msgGroups = {};
  messages.forEach(m => {
    if (!msgGroups[m.id]) {
      msgGroups[m.id] = { id: m.id, name: m.name, type: 'Message Group' };
    }
  });
  Object.values(msgGroups).forEach(g => {
    list.push({ id: g.id, name: g.name || g.id, meta: 'Message', type: 'generic' });
  });

  const homeTalks = loadJson('HomeTalk') || [];
  homeTalks.forEach(ht => {
    list.push({ id: ht.homeTalkId, name: ht.title || ht.homeTalkId, meta: 'HomeTalk', type: 'generic' });
  });

  return list;
}

export function getGenericWithDependencies(id) {
  const dependencies = { info: [], adv: [] };
  let name = id;

  // Check Message
  const messages = loadJson('Message') || [];
  const msgGroup = messages.filter(m => m.id === id);
  if (msgGroup.length > 0) {
    name = msgGroup[0].name || id;
    msgGroup.forEach(m => {
      if (m.name) {
        dependencies.info.push({ id: `msg_name_${m.id}`, original: m.name, type: 'Message Name' });
      }
      m.details?.forEach(d => {
        if (d.text) dependencies.info.push({ id: `msg_text_${m.id}_${d.messageDetailId}`, original: d.text, type: 'Message Text' });
        if (d.choiceText) dependencies.info.push({ id: `msg_choice_${m.id}_${d.messageDetailId}`, original: d.choiceText, type: 'Message Choice' });
      });
    });
  }

  // Check HomeTalk
  const homeTalks = loadJson('HomeTalk') || [];
  const ht = homeTalks.find(h => h.homeTalkId === id);
  if (ht) {
    name = ht.title || id;
    if (ht.title) dependencies.info.push({ id: `ht_title_${ht.homeTalkId}`, original: ht.title, type: 'HomeTalk Title' });
    if (ht.managerText) dependencies.info.push({ id: `ht_manager_${ht.homeTalkId}`, original: ht.managerText, type: 'Manager Text' });
    if (ht.choiceText) dependencies.info.push({ id: `ht_choice_${ht.homeTalkId}`, original: ht.choiceText, type: 'HomeTalk Choice' });
    ht.characterTalks?.forEach((ct, idx) => {
      if (ct.text) dependencies.info.push({ id: `ht_talk_${ht.homeTalkId}_${idx}`, original: ct.text, type: 'Character Talk' });
    });
  }

  return { id, name, dependencies };
}