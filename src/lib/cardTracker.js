import fs from 'fs';
import path from 'path';

// Dynamically locate the project's own res folder, robust against starting directory
function getResPath() {
  const cwd = process.cwd();
  
  // If we are already in the hoshimi-station directory
  if (cwd.endsWith('hoshimi-station')) {
    return path.join(cwd, 'res');
  }
  
  // If the process was started from the parent directory, resolve to hoshimi-station/res
  const projectPath = path.join(cwd, 'hoshimi-station');
  if (fs.existsSync(projectPath)) {
    return path.join(projectPath, 'res');
  }
  
  return path.join(cwd, 'res'); // Fallback
}

const RES_ROOT = getResPath();
const MASTERDB_PATH = path.join(RES_ROOT, 'masterdb');
const ADV_PATH = path.join(RES_ROOT, 'adv', 'resource');

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

// Get character display info — loaded dynamically from Character.json
export function getCharacterName(charId) {
  const characters = loadJson('Character') || [];
  const char = characters.find(c => c.id === charId);
  if (char) {
    const short = (char.assetId || charId.replace('char-', '')).toUpperCase();
    return { name: char.name, short };
  }
  return { name: charId, short: charId.replace('char-', '').toUpperCase() };
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
// Character Tracking (Full Hierarchy)
// ==========================================
export function getAllCharactersList() {
  const characters = loadJson('Character') || [];
  const groups = loadJson('CharacterGroup') || [];
  const cards = loadJson('Card') || [];

  // Count cards per character
  const cardCounts = {};
  cards.forEach(c => { cardCounts[c.characterId] = (cardCounts[c.characterId] || 0) + 1; });

  return characters.map(c => {
    const group = groups.find(g => g.id === c.characterGroupId);
    return {
      id: c.id,
      assetId: c.assetId,
      name: c.name,
      groupName: group?.name || c.groupName || '',
      color: c.color || '',
      cv: c.cv || '',
      cardCount: cardCounts[c.id] || 0,
      meta: `${group?.name || ''} | ${c.cv || ''} | Cards: ${cardCounts[c.id] || 0}`,
      type: 'character'
    };
  }).filter(c => c.cardCount > 0 || c.cv); // Only show characters that have cards or CV data
}

export function getCharacterWithDependencies(charId) {
  const characters = loadJson('Character') || [];
  const char = characters.find(c => c.id === charId);
  if (!char) return null;

  const storyDb = loadJson('Story') || [];
  const allMessages = loadJson('Message') || [];
  const allTelephones = loadJson('Telephone') || [];
  const allHomeTalks = loadJson('HomeTalk') || [];
  const allCallPatterns = loadJson('HomeTalkCallPattern') || [];
  const allCards = loadJson('Card') || [];
  const allSkills = loadJson('Skill') || [];
  const allCostumes = loadJson('Costume') || [];
  const allEvoMsgs = loadJson('CardEvolutionMessage') || [];
  const messageGroups = loadJson('MessageGroup') || [];

  // Build sets of card-linked IDs to identify non-card content
  const cardLinkedMessageIds = new Set();
  const cardLinkedTelephoneIds = new Set();
  const cardLinkedHomeTalkIds = new Set();
  allCards.forEach(c => {
    (c.messages || []).forEach(m => {
      if (m.messageId) cardLinkedMessageIds.add(m.messageId);
      if (m.telephoneId) cardLinkedTelephoneIds.add(m.telephoneId);
    });
    (c.homeTalks || []).forEach(h => {
      if (h.homeTalkId) cardLinkedHomeTalkIds.add(h.homeTalkId);
    });
  });

  // Find messageGroups this character belongs to (solo only, not group chats)
  const soloGroupIds = new Set();
  messageGroups.forEach(mg => {
    if (mg.characterIds.length === 1 && mg.characterIds[0] === charId) {
      soloGroupIds.add(mg.id);
    }
  });

  const result = {
    id: char.id,
    assetId: char.assetId,
    name: char.name,
    color: char.color || '',
    groupName: char.groupName || '',

    // Character profile fields
    profile: {
      name: char.name,
      cv: char.cv || '',
      age: char.age || '',
      birthday: char.birthday || '',
      height: char.height || '',
      weight: char.weight || '',
      zodiacSign: char.zodiacSign || '',
      hometown: char.hometown || '',
      favorite: char.favorite || '',
      unfavorite: char.unfavorite || '',
      profileText: char.profile || '',
      shortProfile: char.shortProfile || '',
      catchphrase: char.catchphrase || '',
      threeSize: char.threeSize || '',
      idiom: char.idiom || '',
      activityFanEventWords: (char.activityFanEventWords || []).map(w => w.word),
    },

    // Cards belonging to this character (with full sub-deps)
    cards: [],

    // Non-card messages (instant, birthday, story, etc.)
    nonCardMessages: {
      instant: [],   // message-instant-*
      birthday: [],  // message-hbd-*
      story: [],     // message-story-*
      other: [],     // suntory, vns, etc.
    },

    // Non-card telephones
    nonCardTelephones: {
      birthday: [],  // tel-hbd-*
      message: [],   // tel-message-*
      other: [],     // tel-suntory-* etc.
    },

    // Home talks not linked to any card
    nonCardHomeTalks: {
      character: [],  // home-talk-char-*
      cardUnlinked: [], // home-talk-card-* but not in Card.homeTalks
    },

    // Call patterns (character-level greetings)
    callPatterns: [],

    // Company enjoy stories (Character.companyEnjoyStories)
    companyStories: [],
  };

  // ---- Cards with sub-deps ----
  const charCards = allCards.filter(c => c.characterId === charId);
  for (const card of charCards) {
    const cardData = {
      id: card.id,
      assetId: card.assetId,
      name: card.name,
      description: card.description || '',
      obtainMessage: card.obtainMessage || '',
      initialRarity: card.initialRarity,
      releaseDate: card.releaseDate,
      costume: null,
      skills: [],
      stories: [],
      messages: [],
      telephones: [],
      homeTalks: [],
      evolutionMessages: [],
    };

    // Skills
    const skillIds = [card.skillId1, card.skillId2, card.skillId3, card.skillId4].filter(Boolean);
    for (const sid of skillIds) {
      const sk = allSkills.find(s => s.id === sid);
      if (sk) {
        cardData.skills.push({
          id: sk.id, name: sk.name,
          levels: (sk.levels || []).map(l => ({ 
            level: l.level, 
            description: l.description || '',
            shortDescription: l.shortDescription || ''
          })),
        });
      }
    }

    // Costume
    if (card.rewardCostumeId) {
      const cos = allCostumes.find(c => c.id === card.rewardCostumeId);
      if (cos) cardData.costume = { id: cos.id, name: cos.name };
    }

    // Stories + ADV
    for (const ref of (card.stories || [])) {
      const st = storyDb.find(s => s.id === ref.storyId);
      if (st) {
        const advFiles = (st.advAssetIds || []).map(aid => {
          const filename = `adv_${aid}.txt`;
          return { assetId: aid, filename, exists: fs.existsSync(path.join(ADV_PATH, filename)) };
        });
        // Branch choices ADV
        for (const bc of (st.branchChoices || [])) {
          if (bc.advAssetId) {
            const filename = `adv_${bc.advAssetId}.txt`;
            advFiles.push({ assetId: bc.advAssetId, filename, exists: fs.existsSync(path.join(ADV_PATH, filename)) });
          }
        }
        cardData.stories.push({ 
          id: st.id, 
          name: st.name, 
          description: st.description || '', 
          branchCautionText: st.branchCautionText || '',
          branchFirstText: st.branchFirstText || '',
          branchChoices: (st.branchChoices || []).map(bc => ({ index: bc.index, text: bc.text || '' })),
          advFiles 
        });
      }
    }

    // Card-linked messages
    for (const ref of (card.messages || [])) {
      if (ref.messageId) {
        const msg = allMessages.find(m => m.id === ref.messageId);
        if (msg) {
          cardData.messages.push({
            id: msg.id, name: msg.name || '',
            details: (msg.details || []).map(d => ({ messageDetailId: d.messageDetailId, text: d.text || '', choiceText: d.choiceText || '' })),
          });
        }
      }
      if (ref.telephoneId) {
        const tel = allTelephones.find(t => t.id === ref.telephoneId);
        if (tel) cardData.telephones.push({ id: tel.id, name: tel.name || '' });
      }
    }

    // Card-linked home talks
    for (const ref of (card.homeTalks || [])) {
      const ht = allHomeTalks.find(h => h.homeTalkId === ref.homeTalkId);
      if (ht) {
        cardData.homeTalks.push({
          id: ht.homeTalkId, title: ht.title || '',
          choiceText: ht.choiceText || '', managerText: ht.managerText || '',
          characterTalks: (ht.characterTalks || []).map(ct => ({ text: ct.text || '' })),
        });
      }
    }

    // Evolution messages
    const evoMsgs = allEvoMsgs.filter(em => em.cardId === card.id);
    for (const em of evoMsgs) {
      cardData.evolutionMessages.push({
        cardId: em.cardId, evolutionLevel: em.evolutionLevel,
        number: em.number, evolveMessage: em.evolveMessage || '', characterId: em.characterId || '',
      });
    }

    // Sort cards by releaseDate (newest first)
    result.cards.push(cardData);
  }
  result.cards.sort((a, b) => (parseInt(b.releaseDate) || 0) - (parseInt(a.releaseDate) || 0));

  // ---- Non-card Messages ----
  // Find all messages belonging to this character's solo message groups
  const charMessages = allMessages.filter(m => {
    // Check if it belongs to a solo message group for this character
    if (soloGroupIds.has(m.messageGroupId)) return true;
    // Also check messages with this character's ID pattern
    const charAsset = char.assetId;
    if (m.id.includes(`-${charAsset}-`) || m.id.endsWith(`-${charAsset}`)) return true;
    return false;
  }).filter(m => !cardLinkedMessageIds.has(m.id));

  for (const msg of charMessages) {
    const entry = {
      id: msg.id, name: msg.name || '',
      detailCount: (msg.details || []).length,
      details: (msg.details || []).map(d => ({ messageDetailId: d.messageDetailId, text: d.text || '', choiceText: d.choiceText || '' })),
    };
    if (msg.id.startsWith('message-instant-')) result.nonCardMessages.instant.push(entry);
    else if (msg.id.startsWith('message-hbd-')) result.nonCardMessages.birthday.push(entry);
    else if (msg.id.startsWith('message-story-')) result.nonCardMessages.story.push(entry);
    else result.nonCardMessages.other.push(entry);
  }

  // ---- Non-card Telephones ----
  const charTelephones = allTelephones.filter(t => t.characterId === charId && !cardLinkedTelephoneIds.has(t.id));
  for (const tel of charTelephones) {
    const entry = { id: tel.id, name: tel.name || '' };
    if (tel.id.startsWith('tel-hbd-')) result.nonCardTelephones.birthday.push(entry);
    else if (tel.id.startsWith('tel-message-')) result.nonCardTelephones.message.push(entry);
    else result.nonCardTelephones.other.push(entry);
  }

  // ---- Non-card HomeTalks ----
  const charHomeTalks = allHomeTalks.filter(ht => ht.characterId === charId && !cardLinkedHomeTalkIds.has(ht.homeTalkId));
  for (const ht of charHomeTalks) {
    const entry = {
      id: ht.homeTalkId, title: ht.title || '',
      choiceText: ht.choiceText || '', managerText: ht.managerText || '',
      characterTalks: (ht.characterTalks || []).map(ct => ({ text: ct.text || '' })),
    };
    if (ht.homeTalkId.startsWith('home-talk-char-')) result.nonCardHomeTalks.character.push(entry);
    else result.nonCardHomeTalks.cardUnlinked.push(entry);
  }

  // ---- Call Patterns (character-level greetings) ----
  const charCallPatterns = allCallPatterns.filter(cp => cp.characterId === charId);
  for (const cp of charCallPatterns) {
    result.callPatterns.push({
      patternId: cp.patternId,
      managerCallText: cp.managerCallText || '',
      characterArrivalText: cp.characterArrivalText || '',
    });
  }

  // ---- Company Enjoy Stories ----
  if (char.companyEnjoyStories && char.companyEnjoyStories.length > 0) {
    for (const cs of char.companyEnjoyStories) {
      const st = storyDb.find(s => s.id === cs.storyId);
      if (st) {
        const advFiles = (st.advAssetIds || []).map(aid => {
          const filename = `adv_${aid}.txt`;
          return { assetId: aid, filename, exists: fs.existsSync(path.join(ADV_PATH, filename)) };
        });
        result.companyStories.push({ id: st.id, name: st.name, description: st.description || '', number: cs.number, advFiles });
      }
    }
  }

  return result;
}

// ==========================================
// Group Chat Rooms (MessageGroup with 2+ characters)
// ==========================================
export function getAllGroupChats() {
  const messageGroups = loadJson('MessageGroup') || [];
  const allMessages = loadJson('Message') || [];

  // Only group chats (2+ characters)
  return messageGroups
    .filter(mg => mg.characterIds.length >= 2)
    .map(mg => {
      const messageCount = allMessages.filter(m => m.messageGroupId === mg.id).length;
      const charNames = mg.characterIds.map(cid => {
        const info = getCharacterName(cid);
        return info.short;
      });
      return {
        id: mg.id,
        assetId: mg.assetId,
        name: mg.name,
        characterIds: mg.characterIds,
        characterCount: mg.characterIds.length,
        characterNames: charNames.join(', '),
        messageCount,
        meta: `${mg.characterIds.length}명 | ${messageCount}개 메시지`,
        type: 'groupchat'
      };
    })
    .filter(gc => gc.messageCount > 0);
}

export function getGroupChatDependencies(groupId) {
  const messageGroups = loadJson('MessageGroup') || [];
  const allMessages = loadJson('Message') || [];
  const allTelephones = loadJson('Telephone') || [];

  const group = messageGroups.find(mg => mg.id === groupId);
  if (!group) return null;

  // All messages in this group
  const messages = allMessages.filter(m => m.messageGroupId === groupId);

  // All telephones in this group
  const telephones = allTelephones.filter(t => t.messageGroupId === groupId);

  return {
    id: group.id,
    assetId: group.assetId,
    name: group.name,
    characterIds: group.characterIds,
    characterNames: group.characterIds.map(cid => getCharacterName(cid)),
    messages: messages.map(m => ({
      id: m.id, name: m.name || '',
      detailCount: (m.details || []).length,
      details: (m.details || []).map(d => ({
        messageDetailId: d.messageDetailId,
        characterId: d.characterId || '',
        text: d.text || '',
        choiceText: d.choiceText || '',
        stampAssetId: d.stampAssetId || '',
        imageAssetId: d.imageAssetId || '',
      })),
    })),
    telephones: telephones.map(t => ({ id: t.id, name: t.name || '', characterId: t.characterId || '' })),
  };
}

// ==========================================
// Generic (Messages, HomeTalks, etc.) — Legacy compatibility
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