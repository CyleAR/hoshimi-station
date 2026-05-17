import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CWD = process.cwd();
const PROJECT_ROOT = CWD.endsWith('hoshimi-station') ? CWD : path.join(CWD, 'hoshimi-station');
const JSON_KOR_DIR = path.join(PROJECT_ROOT, 'json-kor');
const MASTERDB_DIR = path.join(PROJECT_ROOT, 'res', 'masterdb');

// Load structured JSON file (from json-kor if it exists, falling back to res/masterdb)
function loadTable(tableName) {
  const korPath = path.join(JSON_KOR_DIR, `${tableName}.json`);
  if (fs.existsSync(korPath)) {
    try {
      return JSON.parse(fs.readFileSync(korPath, 'utf-8'));
    } catch (e) {
      console.error(`Error parsing json-kor ${tableName}:`, e);
    }
  }
  const dbPath = path.join(MASTERDB_DIR, `${tableName}.json`);
  if (fs.existsSync(dbPath)) {
    try {
      return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    } catch (e) {
      console.error(`Error parsing masterdb ${tableName}:`, e);
    }
  }
  return null;
}

export async function POST(request) {
  try {
    const { ids } = await request.json();
    if (!ids || !Array.isArray(ids)) {
      return NextResponse.json({ error: 'Invalid ids array' }, { status: 400 });
    }

    const tableCache = {};
    const getCachedTable = (tableName) => {
      if (tableName in tableCache) return tableCache[tableName];
      const data = loadTable(tableName);
      tableCache[tableName] = data;
      return data;
    };

    const results = {};

    for (const id of ids) {
      if (!id) continue;
      try {
        // Parse Character Profile
        if (id.startsWith('char_profile_') || id.startsWith('char_fan_word_')) {
          const charTable = getCachedTable('Character');
          if (!charTable) continue;

          if (id.startsWith('char_profile_')) {
            // Format: char_profile_{field}_{charId}
            const match = id.match(/^char_profile_([a-zA-Z0-9]+)_(char-[a-zA-Z0-9_-]+)$/);
            if (match) {
              const field = match[1];
              const charId = match[2];
              const char = charTable.find(c => c.id === charId);
              if (char) {
                const mappedField = field === 'text' ? 'profile' : field === 'short' ? 'shortProfile' : field;
                if (char[mappedField] !== undefined) {
                  results[id] = char[mappedField];
                }
              }
            }
          } else if (id.startsWith('char_fan_word_')) {
            // Format: char_fan_word_{charId}_{index}
            const match = id.match(/^char_fan_word_(char-[a-zA-Z0-9_-]+)_(\d+)$/);
            if (match) {
              const charId = match[1];
              const index = parseInt(match[2]);
              const char = charTable.find(c => c.id === charId);
              if (char && char.activityFanEventWords && char.activityFanEventWords[index]) {
                results[id] = char.activityFanEventWords[index].word;
              }
            }
          }
        }
        // Message Group Name
        else if (id.startsWith('msg_group_name_')) {
          const match = id.match(/^msg_group_name_(.+)$/);
          if (match) {
            const groupId = match[1];
            const mgTable = getCachedTable('MessageGroup');
            const group = mgTable?.find(g => g.id === groupId);
            if (group) results[id] = group.name;
          }
        }
        // Flat KV split by "|"
        else if (id.includes('|')) {
          const parts = id.split('|');
          const prefix = parts[0];
          const suffix = parts[1];

          // Costume: cos-xxx|name
          if (prefix.startsWith('cos-')) {
            const cosTable = getCachedTable('Costume');
            const cos = cosTable?.find(c => c.id === prefix);
            if (cos && suffix === 'name') results[id] = cos.name;
          }
          // Telephone: tel-xxx|name
          else if (prefix.startsWith('tel-')) {
            const telTable = getCachedTable('Telephone');
            const tel = telTable?.find(t => t.id === prefix);
            if (tel && suffix === 'name') results[id] = tel.name;
          }
          // Card: card-xxx|field
          else if (prefix.startsWith('card-')) {
            const cardTable = getCachedTable('Card');
            const card = cardTable?.find(c => c.id === prefix);
            if (card && (suffix === 'name' || suffix === 'description' || suffix === 'obtainMessage')) {
              results[id] = card[suffix];
            }
            // Evolution messages: card-xxx|evo.level.number
            else if (suffix.startsWith('evo.')) {
              const evoMatch = suffix.match(/^evo\.(\d+)\.(\d+)$/);
              if (evoMatch) {
                const level = parseInt(evoMatch[1]);
                const number = parseInt(evoMatch[2]);
                const evoTable = getCachedTable('CardEvolutionMessage');
                const em = evoTable?.find(e => e.cardId === prefix && e.evolutionLevel === level && e.number === number);
                if (em) results[id] = em.evolveMessage;
              }
            }
          }
          // Skill: sk-xxx|field
          else if (prefix.startsWith('sk-')) {
            const skillTable = getCachedTable('Skill');
            const sk = skillTable?.find(s => s.id === prefix);
            if (sk) {
              if (suffix === 'name') {
                results[id] = sk.name;
              } else if (suffix.startsWith('level.')) {
                const lvlMatch = suffix.match(/^level\.(\d+)\.(description|shortDescription)$/);
                if (lvlMatch) {
                  const level = parseInt(lvlMatch[1]);
                  const field = lvlMatch[2];
                  const lvlObj = sk.levels?.find(l => l.level === level);
                  if (lvlObj) results[id] = lvlObj[field];
                }
              }
            }
          }
          // Story: st-xxx|field
          else if (prefix.startsWith('st-')) {
            const storyTable = getCachedTable('Story');
            const st = storyTable?.find(s => s.id === prefix);
            if (st) {
              if (suffix === 'name' || suffix === 'description' || suffix === 'branchCautionText' || suffix === 'branchFirstText') {
                results[id] = st[suffix];
              } else if (suffix.startsWith('branchChoice.') || suffix.startsWith('branchChoices[')) {
                const choiceMatch = suffix.match(/(?:branchChoice\.(\d+)\.text|branchChoices\[(\d+)\]\.text)/);
                if (choiceMatch) {
                  const index = parseInt(choiceMatch[1] || choiceMatch[2]);
                  const bc = st.branchChoices?.find(c => c.index === index);
                  if (bc) results[id] = bc.text;
                }
              }
            }
          }
          // Message Group/Detail: message-xxx|detail.xxx.field
          else if (prefix.startsWith('message-')) {
            const msgTable = getCachedTable('Message');
            const msg = msgTable?.find(m => m.id === prefix);
            if (msg) {
              if (suffix === 'name') {
                results[id] = msg.name;
              } else if (suffix.startsWith('detail.')) {
                const detailMatch = suffix.match(/^detail\.([a-zA-Z0-9_-]+)\.(text|choiceText)$/);
                if (detailMatch) {
                  const detailId = detailMatch[1];
                  const field = detailMatch[2];
                  const dObj = msg.details?.find(d => d.messageDetailId === detailId);
                  if (dObj) results[id] = dObj[field];
                }
              }
            }
          }
          // HomeTalk: home-talk-xxx|field
          else if (prefix.startsWith('home-talk-')) {
            const htTable = getCachedTable('HomeTalk');
            const ht = htTable?.find(h => h.homeTalkId === prefix);
            if (ht) {
              if (suffix === 'choiceText' || suffix === 'managerText') {
                results[id] = ht[suffix];
              } else if (suffix.startsWith('talk.')) {
                const talkMatch = suffix.match(/^talk\.(\d+)$/);
                if (talkMatch) {
                  const index = parseInt(talkMatch[1]);
                  if (ht.characterTalks && ht.characterTalks[index]) {
                    results[id] = ht.characterTalks[index].text;
                  }
                }
              }
            }
          }
          // CallPattern: patternId|field
          else {
            const cpTable = getCachedTable('HomeTalkCallPattern');
            const cp = cpTable?.find(c => c.patternId === prefix);
            if (cp && (suffix === 'characterArrivalText' || suffix === 'managerCallText')) {
              results[id] = cp[suffix];
            }
          }
        }
      } catch (err) {
        console.error(`Error parsing ID "${id}":`, err);
      }
    }

    return NextResponse.json({ translations: results });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
